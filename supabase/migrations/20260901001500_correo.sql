-- =============================================================================
-- Rua · 15 — Notificaciones por correo
--
-- Decisión de fondo: los correos NO se envían desde el trigger. Se ENCOLAN.
--
-- Un trigger que llamara a la API de Resend dejaría el envío dentro de la
-- transacción: si Resend tarda, la solicitud tarda; si Resend falla, ¿se
-- revierte la aprobación? Ninguna respuesta a esa pregunta es buena.
--
-- Con una bandeja de salida, la transacción sólo escribe una fila. Una Edge
-- Function la vacía después. Si el envío falla, la fila queda con el error y
-- se reintenta; nada se pierde, y queda bitácora de qué se envió exactamente
-- a quién — que en un sistema institucional es tan importante como el envío.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración del remitente
--
-- La API key de Resend NO vive aquí. Va como secreto de Supabase
-- (`supabase secrets set RESEND_API_KEY=...`), donde sólo la ve la Edge
-- Function. Guardarla en una tabla la expondría a cualquiera que consiga
-- leerla, y una clave de envío permite suplantar a la institución.
-- -----------------------------------------------------------------------------
alter table public.configuracion
  add column if not exists correo jsonb not null default jsonb_build_object(
    'activo', false,
    'remitente', 'no-responder@ejemplo.edu',
    'nombre_remitente', 'Rua · Gestión Académica',
    'responder_a', null,
    'copia_oculta', null
  );

comment on column public.configuracion.correo is
  'Ajustes del remitente. La API key de Resend es un secreto de Supabase, nunca una columna.';

-- -----------------------------------------------------------------------------
-- Plantillas
-- -----------------------------------------------------------------------------
create table public.plantillas_correo (
  codigo         text primary key,
  nombre         text not null,
  descripcion    text,
  asunto         text not null,
  cuerpo         text not null,
  activa         boolean not null default true,
  -- Variables admitidas, para que la interfaz pueda ofrecerlas y avisar de las
  -- que no existen antes de guardar.
  variables      text[] not null default '{}',
  es_sistema     boolean not null default false,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles (id) on delete set null,

  constraint plantillas_asunto_no_vacio check (length(trim(asunto)) >= 3),
  constraint plantillas_cuerpo_no_vacio check (length(trim(cuerpo)) >= 20)
);

comment on table public.plantillas_correo is
  'Plantillas editables desde el portal. El cuerpo es texto plano con {{variables}}; la Edge Function lo envuelve en HTML.';

create trigger trg_plantillas_actualizado before update on public.plantillas_correo
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- Bandeja de salida y bitácora
-- -----------------------------------------------------------------------------
create type public.estado_correo as enum ('pendiente', 'enviado', 'fallido', 'cancelado');

create table public.correos (
  id               uuid primary key default gen_random_uuid(),
  destinatario     text not null,
  destinatario_nombre text,
  asunto           text not null,
  cuerpo           text not null,

  plantilla_codigo text references public.plantillas_correo (codigo) on delete set null,
  solicitud_id     uuid references public.solicitudes (id) on delete set null,

  estado           public.estado_correo not null default 'pendiente',
  intentos         smallint not null default 0,
  error            text,
  proveedor_id     text,          -- id que devuelve Resend, para rastrear un envío concreto
  enviado_en       timestamptz,

  creado_en        timestamptz not null default now(),

  constraint correos_destinatario_valido check (destinatario ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$')
);

-- La cola sólo consulta lo pendiente: índice parcial en vez de indexar la
-- bitácora entera, que crecerá sin parar.
create index correos_cola_idx on public.correos (creado_en)
  where estado = 'pendiente';
create index correos_solicitud_idx on public.correos (solicitud_id, creado_en desc);
create index correos_bitacora_idx on public.correos (creado_en desc);

comment on table public.correos is
  'Bandeja de salida y bitácora. El cuerpo se guarda YA RENDERIZADO: la bitácora debe mostrar lo que se envió, no lo que la plantilla diría hoy.';

-- -----------------------------------------------------------------------------
-- Renderizado
--
-- Sustitución simple de {{variable}}. Se hace al ENCOLAR, no al enviar, por
-- dos razones: los datos están disponibles en ese instante, y editar una
-- plantilla después no debe reescribir lo que ya salió.
-- -----------------------------------------------------------------------------
create or replace function public.fn_render_plantilla(p_texto text, p_variables jsonb)
returns text
language plpgsql
immutable
as $fn$
declare
  v_resultado text := p_texto;
  v_clave     text;
begin
  for v_clave in select jsonb_object_keys(p_variables) loop
    v_resultado := replace(
      v_resultado,
      '{{' || v_clave || '}}',
      coalesce(p_variables ->> v_clave, '')
    );
  end loop;

  -- Cualquier marcador que quede sin sustituir se limpia: es preferible una
  -- frase incompleta a un correo institucional que diga «{{solicitante}}».
  return regexp_replace(v_resultado, '\{\{[a-z_]+\}\}', '', 'g');
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Destinatarios de una etapa
--
-- Las oficinas con acceso al flujo son, exactamente, los usuarios activos cuyo
-- rol tiene el permiso de esa etapa. Se deriva en vez de mantenerse una lista
-- aparte: una lista de correos se queda desactualizada en cuanto alguien
-- cambia de puesto.
-- -----------------------------------------------------------------------------
create or replace function public.fn_destinatarios_etapa(p_etapa_codigo text)
returns table (correo text, nombre text)
language sql
stable
security definer
set search_path = public
as $fn$
  select distinct p.correo, p.nombre_completo
  from public.etapas_flujo e
  join public.rol_permisos rp on rp.permiso_codigo = e.permiso_codigo
  join public.roles r on r.id = rp.rol_id and r.estado = 'activo'
  join public.perfiles p on p.rol_id = r.id and p.estado = 'activo'
  where e.codigo = p_etapa_codigo;
$fn$;

-- -----------------------------------------------------------------------------
-- Encolado
-- -----------------------------------------------------------------------------
create or replace function public.fn_encolar_correo(
  p_plantilla    text,
  p_destinatario text,
  p_nombre       text,
  p_variables    jsonb,
  p_solicitud_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_plantilla record;
  v_config    jsonb;
  v_id        uuid;
begin
  select correo into v_config from public.configuracion where id;

  -- Con el correo desactivado no se encola nada: la bandeja no debe llenarse
  -- de mensajes que nunca van a salir.
  if not coalesce((v_config ->> 'activo')::boolean, false) then
    return null;
  end if;

  select * into v_plantilla
  from public.plantillas_correo
  where codigo = p_plantilla and activa;

  if not found then return null; end if;
  if p_destinatario is null or trim(p_destinatario) = '' then return null; end if;

  insert into public.correos
    (destinatario, destinatario_nombre, asunto, cuerpo, plantilla_codigo, solicitud_id)
  values (
    lower(trim(p_destinatario)),
    p_nombre,
    public.fn_render_plantilla(v_plantilla.asunto, p_variables),
    public.fn_render_plantilla(v_plantilla.cuerpo, p_variables),
    p_plantilla,
    p_solicitud_id
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Variables de una solicitud, en un solo sitio
-- -----------------------------------------------------------------------------
create or replace function public.fn_variables_solicitud(p_solicitud_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'folio',            s.folio,
    'tipo',             case s.tipo when 'crear' then 'creación'
                                    when 'editar' then 'modificación'
                                    else 'baja' end,
    'estado',           s.estado::text,
    'prioridad',        s.prioridad::text,
    'solicitante',      sp.nombre_completo,
    'solicitante_correo', sp.correo,
    'unidad',           coalesce(v.nombre, 'Sin unidad asignada'),
    'actividad',        coalesce(a.nomenclatura, s.propuesta_nomenclatura, 'Sin actividad asociada'),
    'codigo_actividad', coalesce(a.codigo, s.propuesta_codigo, '—'),
    'justificacion',    s.concepto_justificativo,
    'periodo',          coalesce(per.codigo, 'Sin periodo'),
    'fecha',            to_char(s.creado_en at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI'),
    'institucion',      coalesce(c.nombre_institucion, 'Gestión Académica')
  )
  from public.solicitudes s
  join public.perfiles sp on sp.id = s.solicitante_id
  left join public.vicerrectorias v on v.id = sp.vicerrectoria_id
  left join public.actividades a on a.id = s.actividad_id
  left join public.periodos per on per.id = s.periodo_id
  cross join public.configuracion c
  where s.id = p_solicitud_id;
$fn$;

-- -----------------------------------------------------------------------------
-- 1 · Solicitud recibida
--
-- Confirma al solicitante y avisa a la oficina que tiene que actuar.
-- -----------------------------------------------------------------------------
create or replace function public.fn_correo_solicitud_recibida()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_vars jsonb;
  v_dest record;
  v_primera text;
begin
  if new.estado <> 'pendiente' then return null; end if;
  if tg_op = 'UPDATE' and old.estado = 'pendiente' then return null; end if;

  v_vars := public.fn_variables_solicitud(new.id);

  -- Acuse para quien la presentó
  perform public.fn_encolar_correo(
    'solicitud_recibida',
    v_vars ->> 'solicitante_correo',
    v_vars ->> 'solicitante',
    v_vars || jsonb_build_object('destinatario', v_vars ->> 'solicitante'),
    new.id
  );

  -- Aviso a la oficina que abre la cadena
  select codigo into v_primera
  from public.etapas_flujo where activa order by orden limit 1;

  if v_primera is not null then
    for v_dest in select * from public.fn_destinatarios_etapa(v_primera) loop
      perform public.fn_encolar_correo(
        'solicitud_recibida',
        v_dest.correo,
        v_dest.nombre,
        v_vars || jsonb_build_object('destinatario', v_dest.nombre),
        new.id
      );
    end loop;
  end if;

  return null;
end;
$fn$;

create trigger trg_correo_solicitud_recibida
  after insert or update of estado on public.solicitudes
  for each row execute function public.fn_correo_solicitud_recibida();

-- -----------------------------------------------------------------------------
-- 2 y 3 · Novedad registrada, y resolución
--
-- Se engancha a `solicitud_etapas` y no a `fn_decidir_etapa`: así el aviso no
-- depende de que nadie se acuerde de añadirlo si mañana cambia esa función.
-- -----------------------------------------------------------------------------
create or replace function public.fn_correo_novedad_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_vars     jsonb;
  v_dest     record;
  v_etapa    record;
  v_estado   public.estado_solicitud;
begin
  if new.estado = old.estado then return null; end if;

  select e.nombre, e.codigo into v_etapa
  from public.etapas_flujo e where e.codigo = new.etapa_codigo;

  v_vars := public.fn_variables_solicitud(new.solicitud_id)
    || jsonb_build_object(
      'etapa', v_etapa.nombre,
      'comentario', coalesce(new.justificacion, ''),
      'revisor', coalesce(
        (select nombre_completo from public.perfiles where id = new.revisor_id),
        'El sistema'
      ),
      'decision', case new.estado
        when 'aprobada' then 'aprobada'
        when 'denegada' then 'denegada'
        else 'en curso' end
    );

  -- Una etapa que se desbloquea: le toca actuar a otra oficina.
  if new.estado = 'pendiente' and old.estado = 'bloqueada' then
    for v_dest in select * from public.fn_destinatarios_etapa(new.etapa_codigo) loop
      perform public.fn_encolar_correo(
        'novedad_registrada',
        v_dest.correo,
        v_dest.nombre,
        v_vars || jsonb_build_object('destinatario', v_dest.nombre),
        new.solicitud_id
      );
    end loop;
    return null;
  end if;

  if new.estado not in ('aprobada', 'denegada') then return null; end if;

  select estado into v_estado from public.solicitudes where id = new.solicitud_id;

  -- Si el expediente quedó cerrado, es la resolución; si no, una novedad más.
  perform public.fn_encolar_correo(
    case when v_estado in ('aprobada', 'denegada') then 'solicitud_resuelta'
         else 'novedad_registrada' end,
    v_vars ->> 'solicitante_correo',
    v_vars ->> 'solicitante',
    v_vars || jsonb_build_object(
      'destinatario', v_vars ->> 'solicitante',
      'estado', v_estado::text
    ),
    new.solicitud_id
  );

  return null;
end;
$fn$;

create trigger trg_correo_novedad_etapa
  after update of estado on public.solicitud_etapas
  for each row execute function public.fn_correo_novedad_etapa();

-- -----------------------------------------------------------------------------
-- Plantillas iniciales
--
-- Texto plano con {{variables}}: el administrador no debería tener que escribir
-- HTML para cambiar una frase. La Edge Function lo envuelve en la maqueta.
-- -----------------------------------------------------------------------------
insert into public.plantillas_correo (codigo, nombre, descripcion, asunto, cuerpo, variables, es_sistema) values
(
  'solicitud_recibida',
  'Solicitud recibida',
  'Se envía al presentar la solicitud: acuse al solicitante y aviso a la oficina que abre la cadena.',
  '[{{folio}}] Solicitud de {{tipo}} recibida — {{actividad}}',
  'Hola {{destinatario}}:

Se ha registrado en {{institucion}} una solicitud de {{tipo}} de actividad.

Folio: {{folio}}
Actividad: {{actividad}} ({{codigo_actividad}})
Solicitante: {{solicitante}} — {{unidad}}
Periodo: {{periodo}}
Fecha: {{fecha}}

Concepto justificativo
{{justificacion}}

Puedes consultar el expediente y su estado en el portal.

{{institucion}}',
  array['destinatario','folio','tipo','actividad','codigo_actividad','solicitante','unidad','periodo','fecha','justificacion','institucion'],
  true
),
(
  'novedad_registrada',
  'Novedad registrada',
  'Se envía cuando el expediente avanza: la etapa siguiente queda a la espera de firma.',
  '[{{folio}}] Novedad en el expediente — {{etapa}}',
  'Hola {{destinatario}}:

El expediente {{folio}} ha registrado una novedad.

Etapa actual: {{etapa}}
Actividad: {{actividad}} ({{codigo_actividad}})
Solicitante: {{solicitante}} — {{unidad}}

{{comentario}}

Si esta etapa corresponde a tu oficina, el expediente está esperando tu validación en el portal.

{{institucion}}',
  array['destinatario','folio','etapa','actividad','codigo_actividad','solicitante','unidad','comentario','revisor','institucion'],
  true
),
(
  'solicitud_resuelta',
  'Aprobación o rechazo',
  'Se envía al solicitante cuando el expediente queda cerrado, con la decisión y los comentarios.',
  '[{{folio}}] Solicitud {{decision}} — {{actividad}}',
  'Hola {{destinatario}}:

Tu solicitud {{folio}} ha sido {{decision}}.

Actividad: {{actividad}} ({{codigo_actividad}})
Etapa que resolvió: {{etapa}}
Resuelta por: {{revisor}}
Fecha de presentación: {{fecha}}

Comentarios de la resolución
{{comentario}}

Puedes consultar el detalle completo y el seguimiento en el portal.

{{institucion}}',
  array['destinatario','folio','decision','actividad','codigo_actividad','etapa','revisor','comentario','fecha','institucion'],
  true
)
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.plantillas_correo enable row level security;
alter table public.correos enable row level security;

create policy "plantillas_lectura" on public.plantillas_correo
  for select to authenticated using (public.fn_estoy_activo());

create policy "plantillas_escritura" on public.plantillas_correo
  for all to authenticated
  using (public.fn_soy_admin())
  with check (public.fn_soy_admin());

-- La bitácora contiene cuerpos de correo con datos de personas: sólo la ve
-- quien administra o quien audita.
create policy "correos_lectura" on public.correos
  for select to authenticated
  using (public.fn_soy_admin() or public.fn_tengo_permiso('auditoria.consultar'));

-- Nadie encola a mano desde el cliente: sólo los triggers y la función de
-- prueba, que son SECURITY DEFINER. Sin política de escritura, un INSERT
-- directo queda bloqueado — y encolar correos a discreción sería una forma
-- cómoda de usar el dominio institucional para enviar spam.

grant execute on function
  public.fn_render_plantilla,
  public.fn_destinatarios_etapa,
  public.fn_variables_solicitud
to authenticated;
