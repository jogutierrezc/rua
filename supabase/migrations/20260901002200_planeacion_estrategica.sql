-- =============================================================================
-- Rua · 22 — Planeación Estratégica
--
-- Primer módulo del portal que no gira alrededor de las actividades. Guarda la
-- oferta académica: qué programas tiene la Universidad, con qué registro
-- calificado, hasta cuándo vale y cuántos cupos aprobados tiene.
--
-- El registro calificado caduca. Ése es el hecho que ordena todo el diseño:
-- un programa cuyo registro vence sin renovar no puede admitir estudiantes, y
-- la renovación tarda meses en tramitarse. Por eso el vencimiento no es una
-- fecha más en una tabla, sino algo que el sistema VIGILA: se calcula el tiempo
-- que queda, se pinta, y cuando entra en los últimos tres meses el portal avisa
-- por correo sin que nadie tenga que acordarse de mirar.
--
-- Los submódulos «Programas SNIES», «Otra Información» y «Proyección de cupos»
-- quedan declarados en el menú pero vacíos: existen para que el módulo tenga su
-- forma final desde el principio, y se llenarán cuando se defina su estructura.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enumeraciones del dominio académico
--
-- Cerradas y no texto libre: sobre estos campos se filtra y se agrega, y con
-- texto libre acaban conviviendo «Presencial», «presencial» y «PRESENCIAL»
-- como si fueran tres modalidades distintas.
-- -----------------------------------------------------------------------------
create type public.nivel_programa as enum (
  'tecnico_profesional',
  'tecnologico',
  'profesional',
  'especializacion',
  'especializacion_medico_quirurgica',
  'maestria',
  'doctorado'
);

create type public.modalidad_programa as enum (
  'presencial',
  'distancia',
  'virtual',
  'dual'
);

create type public.tipo_cupos as enum (
  'trimestral',
  'semestral',
  'anual',
  'cohorte',
  'variacion_por_cohortes'
);

-- -----------------------------------------------------------------------------
-- Programas UDES
-- -----------------------------------------------------------------------------
create table public.programas_udes (
  id uuid primary key default gen_random_uuid(),

  codigo_unico text not null unique,
  -- El código del SNIES es del Ministerio, no nuestro. Puede faltar mientras
  -- un programa está en trámite, así que no es obligatorio.
  snies        text,

  facultad text not null,
  nivel    public.nivel_programa not null,
  nombre   text not null,
  campus   text not null,
  modalidad public.modalidad_programa not null,

  -- Registro calificado vigente ------------------------------------------------
  rc_resolucion       text,
  rc_fecha_registro   date,
  rc_fecha_vencimiento date,
  -- El PDF de la resolución. Vive en el bucket `registros-calificados`; aquí
  -- sólo su ruta. Meter el archivo en una columna haría que cada consulta de
  -- la tabla arrastrara megas que nadie pidió.
  rc_archivo_ruta   text,
  rc_archivo_nombre text,

  -- Acreditación ---------------------------------------------------------------
  ac_resolucion        text,
  ac_fecha_resolucion  date,

  -- Cupos ----------------------------------------------------------------------
  cupos_aprobados integer,
  tipo_cupos      public.tipo_cupos,

  ano_creacion smallint,
  -- Cumple las Condiciones Iniciales para Acreditación en Alta Calidad.
  cumple_ci_para_ac boolean not null default false,

  -- Marca del preaviso, para no repetirlo cada vez que corre la cola. Se borra
  -- al mover la fecha de vencimiento: renovar el registro reabre el aviso.
  aviso_vencimiento_en timestamptz,

  estado public.estado_registro not null default 'activo',

  creado_por     uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint programas_codigo_no_vacio check (length(trim(codigo_unico)) >= 2),
  constraint programas_nombre_no_vacio check (length(trim(nombre)) >= 4),
  constraint programas_cupos_positivos check (cupos_aprobados is null or cupos_aprobados >= 0),
  constraint programas_ano_razonable check (
    ano_creacion is null or ano_creacion between 1900 and 2100
  ),
  -- Un registro que vence antes de empezar es un error de captura, no un dato.
  constraint programas_vigencia_coherente check (
    rc_fecha_registro is null
    or rc_fecha_vencimiento is null
    or rc_fecha_vencimiento > rc_fecha_registro
  )
);

create index programas_udes_facultad_idx on public.programas_udes (facultad, nombre);
-- Índice parcial para la vigilancia del vencimiento: sólo mira lo activo con
-- fecha, que es una fracción de la tabla y lo único que consulta el aviso.
create index programas_udes_vencimiento_idx on public.programas_udes (rc_fecha_vencimiento)
  where estado = 'activo' and rc_fecha_vencimiento is not null;

comment on table public.programas_udes is
  'Oferta académica de la Universidad con su registro calificado, acreditación y cupos aprobados.';

create trigger trg_programas_udes_actualizado before update on public.programas_udes
  for each row execute function public.fn_set_actualizado_en();

-- Renovar el registro reabre el preaviso: si no, un programa renovado nunca
-- volvería a avisar porque ya lo hizo en su vigencia anterior.
create or replace function public.fn_programa_reabrir_aviso()
returns trigger
language plpgsql
as $fn$
begin
  if new.rc_fecha_vencimiento is distinct from old.rc_fecha_vencimiento then
    new.aviso_vencimiento_en := null;
  end if;
  return new;
end;
$fn$;

create trigger trg_programa_reabrir_aviso
  before update of rc_fecha_vencimiento on public.programas_udes
  for each row execute function public.fn_programa_reabrir_aviso();

-- -----------------------------------------------------------------------------
-- Observaciones
--
-- El nombre y el rol se guardan COPIADOS, no sólo referenciados. Una
-- observación dice con qué autoridad se hizo, y los roles cambian: si mañana
-- quien la escribió deja de ser Decano, la observación no puede empezar a
-- mostrar su cargo nuevo — diría algo que nunca ocurrió. Por eso el rol es
-- texto congelado y no un `join`.
-- -----------------------------------------------------------------------------
create table public.programa_observaciones (
  id          uuid primary key default gen_random_uuid(),
  programa_id uuid not null references public.programas_udes (id) on delete cascade,

  autor_id     uuid references public.perfiles (id) on delete set null,
  autor_nombre text not null,
  autor_rol    text,

  comentario text not null,
  creado_en  timestamptz not null default now(),

  constraint observacion_con_contenido check (length(trim(comentario)) >= 3)
);

create index programa_observaciones_idx
  on public.programa_observaciones (programa_id, creado_en desc);

comment on table public.programa_observaciones is
  'Comentarios sobre un programa. El autor y su rol se congelan al escribir: la observación conserva con qué autoridad se hizo.';

-- El cliente sólo manda el comentario. Quién lo firma lo decide el servidor,
-- que es la única forma de que la firma signifique algo.
create or replace function public.fn_sellar_observacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_perfil record;
begin
  select p.nombre_completo, r.nombre as rol
  into v_perfil
  from public.perfiles p
  left join public.roles r on r.id = p.rol_id
  where p.id = auth.uid();

  if not found then
    raise exception 'No se pudo identificar a quien escribe la observación.'
      using errcode = 'insufficient_privilege';
  end if;

  new.autor_id     := auth.uid();
  new.autor_nombre := v_perfil.nombre_completo;
  new.autor_rol    := v_perfil.rol;
  new.creado_en    := now();
  return new;
end;
$fn$;

create trigger trg_sellar_observacion
  before insert on public.programa_observaciones
  for each row execute function public.fn_sellar_observacion();

-- -----------------------------------------------------------------------------
-- Permisos del módulo
-- -----------------------------------------------------------------------------
insert into public.permisos (codigo, modulo, accion, descripcion) values
  ('planeacion.ver', 'planeacion', 'ver',
   'Consultar los programas y la información de Planeación Estratégica'),
  ('planeacion.administrar', 'planeacion', 'administrar',
   'Crear y editar programas, su registro calificado y sus documentos')
on conflict (codigo) do update set descripcion = excluded.descripcion;

-- El administrador conserva el catálogo completo. Un permiso nuevo no se
-- concede solo: sin esto, quien administra el portal no vería su propio módulo.
insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from public.roles r
cross join public.permisos p
where public.fn_normalizar(r.nombre) = 'administrador del sistema'
  and p.codigo in ('planeacion.ver', 'planeacion.administrar')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Vista con el tiempo que queda
--
-- El conteo se calcula aquí y no en la interfaz: así el aviso por correo, la
-- tabla y cualquier informe futuro dicen exactamente lo mismo. Dos cálculos
-- del mismo plazo acaban discrepando el día que uno redondea distinto.
-- -----------------------------------------------------------------------------
create or replace view public.v_programas_udes
with (security_invoker = true) as
select
  p.*,

  (p.rc_fecha_vencimiento - current_date) as dias_para_vencimiento,

  case
    when p.rc_fecha_vencimiento is null then 'sin_registro'
    when p.rc_fecha_vencimiento < current_date then 'vencido'
    when p.rc_fecha_vencimiento <= current_date + interval '3 months' then 'por_vencer'
    when p.rc_fecha_vencimiento <= current_date + interval '12 months' then 'proximo'
    else 'vigente'
  end as estado_vigencia,

  (select count(*) from public.programa_observaciones o where o.programa_id = p.id)
    as total_observaciones,

  cp.nombre_completo as creado_por_nombre
from public.programas_udes p
left join public.perfiles cp on cp.id = p.creado_por;

comment on view public.v_programas_udes is
  'Programas con el tiempo restante de su registro calificado ya calculado. Única fuente del plazo.';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.programas_udes enable row level security;
alter table public.programa_observaciones enable row level security;

create policy "programas_lectura" on public.programas_udes
  for select to authenticated using (public.fn_tengo_permiso('planeacion.ver'));

create policy "programas_alta" on public.programas_udes
  for insert to authenticated with check (public.fn_tengo_permiso('planeacion.administrar'));

create policy "programas_modificacion" on public.programas_udes
  for update to authenticated
  using (public.fn_tengo_permiso('planeacion.administrar'))
  with check (public.fn_tengo_permiso('planeacion.administrar'));

-- Dar de baja un programa es una decisión de estructura, no de captura de
-- datos: se reserva a la administración. Lo normal es marcarlo inactivo.
create policy "programas_baja" on public.programas_udes
  for delete to authenticated using (public.fn_soy_admin());

create policy "observaciones_lectura" on public.programa_observaciones
  for select to authenticated using (public.fn_tengo_permiso('planeacion.ver'));

-- Observa quien puede consultar: la observación es la forma de que quien mira
-- pueda decir algo, no un privilegio de quien edita.
create policy "observaciones_alta" on public.programa_observaciones
  for insert to authenticated with check (public.fn_tengo_permiso('planeacion.ver'));

-- No hay política de borrado ni de edición. Una observación firmada que se
-- puede reescribir después no es una observación, es un borrador. Si sobra,
-- se responde con otra.

-- -----------------------------------------------------------------------------
-- Los archivos del registro calificado
--
-- Bucket privado: una resolución del Ministerio no es documentación pública
-- del portal. Se sirve con URL firmada y caducada, nunca por enlace directo.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registros-calificados',
  'registros-calificados',
  false,
  20971520,                                  -- 20 MB: son PDFs escaneados
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "registros_lectura" on storage.objects;
create policy "registros_lectura" on storage.objects
  for select to authenticated
  using (bucket_id = 'registros-calificados' and public.fn_tengo_permiso('planeacion.ver'));

drop policy if exists "registros_alta" on storage.objects;
create policy "registros_alta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'registros-calificados' and public.fn_tengo_permiso('planeacion.administrar')
  );

drop policy if exists "registros_modificacion" on storage.objects;
create policy "registros_modificacion" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'registros-calificados' and public.fn_tengo_permiso('planeacion.administrar')
  );

drop policy if exists "registros_baja" on storage.objects;
create policy "registros_baja" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'registros-calificados' and public.fn_tengo_permiso('planeacion.administrar')
  );

-- -----------------------------------------------------------------------------
-- Preaviso de vencimiento
-- -----------------------------------------------------------------------------
create or replace function public.fn_destinatarios_permiso(p_permiso text)
returns table (correo text, nombre text)
language sql
stable
security definer
set search_path = public
as $fn$
  select distinct p.correo, p.nombre_completo
  from public.rol_permisos rp
  join public.roles r    on r.id = rp.rol_id and r.estado = 'activo'
  join public.perfiles p on p.rol_id = r.id and p.estado = 'activo'
  where rp.permiso_codigo = p_permiso;
$fn$;

comment on function public.fn_destinatarios_permiso is
  'Quién debe recibir un aviso, resuelto por capacidad y no por lista de correos. Al cambiar los roles, el reparto se ajusta solo.';

insert into public.plantillas_correo (codigo, nombre, descripcion, asunto, cuerpo, variables, es_sistema)
values (
  'vencimiento_registro',
  'Registro calificado próximo a vencer',
  'Preaviso automático cuando al registro calificado de un programa le quedan tres meses o menos.',
  'Preaviso · el registro calificado de {{programa}} vence en {{dias}} días',
  'Hola {{destinatario}}:

El registro calificado de un programa entra en sus últimos tres meses de vigencia. La renovación ante el Ministerio tarda meses en tramitarse, así que este aviso llega ahora y no cuando ya no haya margen.

Programa

Programa: {{programa}}
Código único: {{codigo_unico}}
SNIES: {{snies}}
Facultad: {{facultad}}
Nivel: {{nivel}}
Campus: {{campus}}
Modalidad: {{modalidad}}

Registro calificado

Resolución: {{resolucion}}
Fecha de registro: {{fecha_registro}}
Fecha de vencimiento: {{fecha_vencimiento}}
Días restantes: {{dias}}

{{enlace}}

Si la renovación ya está en trámite, déjalo escrito como observación en el programa: así el resto de la oficina lo ve sin tener que preguntar.',
  array[
    'destinatario', 'programa', 'codigo_unico', 'snies', 'facultad', 'nivel',
    'campus', 'modalidad', 'resolucion', 'fecha_registro', 'fecha_vencimiento',
    'dias', 'institucion', 'enlace'
  ],
  true
)
on conflict (codigo) do update
  set nombre      = excluded.nombre,
      descripcion = excluded.descripcion,
      variables   = excluded.variables;
-- Igual que la invitación: el texto adaptado por la oficina no se pisa.

/**
 * Encola los preavisos pendientes.
 *
 * La llama la Edge Function que vacía la cola, antes de vaciarla. No hace
 * falta un cron aparte: el que ya existe para el correo sirve para esto, y un
 * segundo temporizador sería una cosa más que puede quedarse parada sin que
 * nadie se entere.
 *
 * Idempotente por `aviso_vencimiento_en`: se avisa UNA vez por vigencia. Sin
 * esa marca, cada pasada de la cola mandaría el mismo correo otra vez, y un
 * aviso que llega noventa veces deja de leerse al tercero.
 */
create or replace function public.fn_encolar_avisos_vencimiento()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_programa record;
  v_dest     record;
  v_vars     jsonb;
  v_config   jsonb;
  v_enviados integer := 0;
begin
  select correo into v_config from public.configuracion where id;

  for v_programa in
    select p.*, (p.rc_fecha_vencimiento - current_date) as dias
    from public.programas_udes p
    where p.estado = 'activo'
      and p.aviso_vencimiento_en is null
      and p.rc_fecha_vencimiento is not null
      and p.rc_fecha_vencimiento <= current_date + interval '3 months'
    order by p.rc_fecha_vencimiento
  loop
    v_vars := jsonb_build_object(
      'programa',          v_programa.nombre,
      'codigo_unico',      v_programa.codigo_unico,
      'snies',             coalesce(v_programa.snies, 'Sin código SNIES'),
      'facultad',          v_programa.facultad,
      'nivel',             replace(v_programa.nivel::text, '_', ' '),
      'campus',            v_programa.campus,
      'modalidad',         v_programa.modalidad::text,
      'resolucion',        coalesce(v_programa.rc_resolucion, 'Sin número de resolución'),
      'fecha_registro',    coalesce(to_char(v_programa.rc_fecha_registro, 'DD/MM/YYYY'), '—'),
      'fecha_vencimiento', to_char(v_programa.rc_fecha_vencimiento, 'DD/MM/YYYY'),
      'dias',              v_programa.dias::text,
      'institucion',       (select coalesce(c.nombre_institucion, 'Gestión Académica')
                            from public.configuracion c),
      'enlace',            coalesce(nullif(trim(v_config ->> 'url_portal'), ''), '')
    );

    for v_dest in select * from public.fn_destinatarios_permiso('planeacion.administrar') loop
      perform public.fn_encolar_correo(
        'vencimiento_registro',
        v_dest.correo,
        v_dest.nombre,
        v_vars || jsonb_build_object('destinatario', v_dest.nombre)
      );
      v_enviados := v_enviados + 1;
    end loop;

    -- Se marca aunque no hubiera destinatarios: si no hay nadie con el
    -- permiso, el problema es de roles y se resuelve ahí, no repitiendo la
    -- consulta en cada pasada de la cola.
    update public.programas_udes
    set aviso_vencimiento_en = now()
    where id = v_programa.id;
  end loop;

  return v_enviados;
end;
$fn$;

comment on function public.fn_encolar_avisos_vencimiento is
  'Encola el preaviso de los registros calificados a menos de tres meses de vencer. Una sola vez por vigencia.';

revoke all on function public.fn_encolar_avisos_vencimiento() from public;
grant execute on function public.fn_encolar_avisos_vencimiento() to service_role;

grant execute on function public.fn_destinatarios_permiso to authenticated;

-- -----------------------------------------------------------------------------
-- El módulo en el menú
--
-- Se siembra igual que los de fábrica, con `es_sistema` para que no se pueda
-- borrar por accidente. Renombrarlo, reordenarlo y esconder los submódulos que
-- todavía están vacíos sí se puede, desde Menú y Navegación.
-- -----------------------------------------------------------------------------
-- El desplazamiento de los grupos que ya existían va atado a que el grupo se
-- haya creado DE VERDAD en esta pasada. Como sentencia suelta, volver a
-- aplicar la migración correría Operación y Administración otra vez, y el
-- orden que el administrador hubiera dejado en Menú y Navegación se movería
-- solo sin que nada lo justificara.
with nuevo as (
  insert into public.menu_grupos (codigo, titulo, orden, es_sistema)
  values ('planeacion', 'Planeación Estratégica', 2, true)
  on conflict (codigo) do nothing
  returning codigo
)
update public.menu_grupos g
set orden = g.orden + 1
where exists (select 1 from nuevo)
  and g.codigo in ('operacion', 'administracion');

insert into public.menu_entradas
  (codigo, grupo_codigo, etiqueta, ruta, icono, permiso_codigo, orden, es_sistema)
values
  ('programas-snies',   'planeacion', 'Programas SNIES',                  '/planeacion/snies',      'Database',      'planeacion.ver', 1, true),
  ('programas-udes',    'planeacion', 'Programas UDES',                   '/planeacion/programas',  'BookOpen',      'planeacion.ver', 2, true),
  ('programas-otra',    'planeacion', 'Otra Información de Programas',    '/planeacion/otra',       'ClipboardList', 'planeacion.ver', 3, true),
  ('proyeccion-cupos',  'planeacion', 'Proyección de Cupos',              '/planeacion/cupos',      'Target',        'planeacion.ver', 4, true)
on conflict (codigo) do nothing;
