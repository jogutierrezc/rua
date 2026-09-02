-- =============================================================================
-- Rua · 19 — La invitación
--
-- Hasta ahora el alta de un usuario terminaba en silencio: la cuenta quedaba
-- creada y el administrador tenía que dictar la contraseña por WhatsApp, o por
-- un correo escrito a mano que cada quien redactaba distinto. La primera vez
-- que alguien oye hablar de RUA es ese mensaje, y estaba dejado al azar.
--
-- Esta plantilla lo convierte en lo que debería ser: una bienvenida que
-- explica qué es RUA, de dónde viene el nombre, por qué existe y cómo se usa,
-- con las credenciales dentro. Editable desde el portal como todas las demás,
-- porque la Oficina de Planeación conoce mejor que nadie el tono con el que
-- quiere recibir a su comunidad.
--
-- AVISO sobre la contraseña: viaja en el cuerpo del correo, y el cuerpo se
-- guarda renderizado en `correos` —así lo exige la bitácora: debe mostrar lo
-- que se envió—. Es decir, la contraseña queda legible para quien pueda leer
-- esa tabla: administración y auditoría. Se asume a conciencia, porque son
-- exactamente los perfiles que ya pueden restablecerla; no es una fuga nueva.
-- Lo que NO existe todavía es que el titular pueda cambiarla por su cuenta, y
-- por eso el texto no promete lo contrario.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- La dirección del portal
--
-- Vive junto a los ajustes de correo y no en una columna aparte porque sólo la
-- usan los correos: es la dirección a la que llevan sus botones. Ponerla en su
-- propia columna habría sido inventar un ajuste global que nadie más consulta.
-- -----------------------------------------------------------------------------
update public.configuracion
set correo = correo || jsonb_build_object('url_portal', '')
where not (correo ? 'url_portal');

-- -----------------------------------------------------------------------------
-- Variables listas para la plantilla
--
-- Se arman aquí y no en la Edge Function por lo mismo que `fn_variables_solicitud`:
-- el texto de la plantilla y la lista de lo que puede usar tienen que poder
-- leerse juntos, o acaban desincronizados.
-- -----------------------------------------------------------------------------
create or replace function public.fn_encolar_invitacion(
  p_perfil_id  uuid,
  p_contrasena text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_correo text;
  v_nombre text;
  v_vars   jsonb;
begin
  select
    p.correo,
    p.nombre_completo,
    jsonb_build_object(
      'destinatario', p.nombre_completo,
      -- El nombre de pila para el saludo. «Hola María Fernanda Restrepo
      -- Guzmán:» no saluda a nadie; suena a carta de cobro.
      'nombre',       split_part(trim(p.nombre_completo), ' ', 1),
      'nombre_completo', p.nombre_completo,
      'correo',       p.correo,
      'contrasena',   p_contrasena,
      'rol',          coalesce(r.nombre, 'Sin rol asignado'),
      'cargo',        coalesce(nullif(trim(p.cargo), ''), 'Sin cargo registrado'),
      'unidad',       coalesce(v.nombre, 'Sin unidad asignada'),
      'institucion',  coalesce(c.nombre_institucion, 'Gestión Académica'),
      -- Sin dirección configurada, la variable queda vacía y el párrafo del
      -- botón desaparece en vez de dejar un hueco.
      'enlace',       coalesce(nullif(trim(c.correo ->> 'url_portal'), ''), '')
    )
  into v_correo, v_nombre, v_vars
  from public.perfiles p
  left join public.roles r on r.id = p.rol_id
  left join public.vicerrectorias v on v.id = p.vicerrectoria_id
  cross join public.configuracion c
  where p.id = p_perfil_id;

  if v_correo is null then
    raise exception 'No existe el perfil %.', p_perfil_id using errcode = 'no_data_found';
  end if;

  return public.fn_encolar_correo('invitacion_usuario', v_correo, v_nombre, v_vars, null);
end;
$fn$;

comment on function public.fn_encolar_invitacion is
  'Encola la bienvenida de un usuario recién creado, con sus credenciales. La llama la Edge Function de alta con la clave de servicio.';

-- Sólo la Edge Function del alta. Recibe una contraseña en claro y encola un
-- correo hacia una dirección que ella no elige, así que ninguna sesión de la
-- aplicación tiene por qué poder llamarla. En Postgres EXECUTE se concede a
-- PUBLIC por defecto: hay que quitarlo a mano.
revoke all on function public.fn_encolar_invitacion(uuid, text) from public;
grant execute on function public.fn_encolar_invitacion(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- La plantilla
--
-- Texto plano, como todas. La maqueta lo convierte en HTML con tres reglas que
-- no hay que aprender: una línea corta y suelta es un título de sección, un
-- bloque de «Etiqueta: valor» es una ficha de datos, y una línea que sólo
-- contiene una dirección web es un botón.
-- -----------------------------------------------------------------------------
insert into public.plantillas_correo (codigo, nombre, descripcion, asunto, cuerpo, variables, es_sistema)
values (
  'invitacion_usuario',
  'Invitación a RUA',
  'Se envía al crear una cuenta desde la administración. Lleva las credenciales y presenta el sistema a quien nunca ha oído hablar de él.',
  'Tu acceso a RUA · {{institucion}}',
  'Hola {{nombre}}:

Te damos la bienvenida a RUA. La Oficina de Planeación Institucional acaba de crearte una cuenta, y con estos datos ya puedes entrar.

Tus datos de acceso

Correo: {{correo}}
Contraseña: {{contrasena}}
Rol: {{rol}}
Cargo: {{cargo}}
Unidad: {{unidad}}

{{enlace}}

Guarda esta contraseña en un sitio seguro. No la elegiste tú, así que no es realmente secreta: cuando quieras cambiarla, pídeselo a la Oficina de Planeación Institucional.

Qué significa el nombre

RUA es el Registro Unificado de Actividades. Y en lengua Emberá Chamí, rúa significa territorio. La coincidencia terminó dándole sentido al proyecto: no construimos solamente un registro, construimos el terreno común donde las facultades y las dependencias siembran sus actividades y ven crecer el resultado.

Por qué lo construimos

La información de las actividades vivía repartida entre archivos, correos y sistemas que no se hablaban entre sí. Saber en qué estado iba una solicitud, o a quién le tocaba actuar, costaba varias llamadas. Y cada informe había que consolidarlo a mano antes de poder decidir nada con él.

RUA existe para lo contrario: registrar una vez, validar dejando rastro, consultar en contexto y decidir con datos en los que se pueda confiar.

Cómo funciona

Presentas una solicitud sobre una o varias actividades y explicas por qué. La solicitud recorre una cadena de firmas, y cada oficina emite su concepto por escrito, aprobando o rechazando. Cuando firma la última, el cambio se aplica solo sobre la estructura: nadie tiene que crear nada a mano después.

Mientras tanto, el Rua Tracker te dice en todo momento en qué fase va lo tuyo, qué oficina lo tiene encima de la mesa y cuánto plazo queda.

Lo que puedes hacer depende de tu rol

Entras como {{rol}}, y el menú lateral te mostrará solamente lo que te corresponde. Si echas en falta algo que esperabas ver, escríbele a la Oficina de Planeación Institucional: será cuestión de permisos, no de que el sistema esté fallando.',
  array[
    'nombre', 'nombre_completo', 'destinatario', 'correo', 'contrasena',
    'rol', 'cargo', 'unidad', 'institucion', 'enlace'
  ],
  true
)
on conflict (codigo) do update
  set nombre      = excluded.nombre,
      descripcion = excluded.descripcion,
      variables   = excluded.variables,
      es_sistema  = excluded.es_sistema;
-- El asunto y el cuerpo NO se pisan al reinstalar: si la Oficina de Planeación
-- ya adaptó el texto, una migración no tiene por qué devolverlo al de fábrica.
