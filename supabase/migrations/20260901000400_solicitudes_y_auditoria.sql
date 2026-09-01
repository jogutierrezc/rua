-- =============================================================================
-- Rua · 04 — Solicitudes, flujo de aprobación, notificaciones y auditoría
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Solicitudes de cambio sobre la estructura de actividades
-- -----------------------------------------------------------------------------
create table public.solicitudes (
  id              uuid primary key default gen_random_uuid(),
  folio           text not null unique,          -- REQ-2026-0891, generado por trigger

  tipo            public.tipo_solicitud not null,
  estado          public.estado_solicitud not null default 'borrador',
  prioridad       public.prioridad not null default 'normal',

  solicitante_id  uuid not null references public.perfiles (id) on delete restrict,
  periodo_id      uuid references public.periodos (id) on delete set null,

  -- Para 'editar' y 'eliminar': la actividad afectada.
  -- Para 'crear': queda nulo y el contenido propuesto vive en los campos de abajo.
  actividad_id    uuid references public.actividades (id) on delete set null,

  -- Propuesta: qué se quiere que exista tras aprobar
  actividad_principal_id uuid references public.actividades (id) on delete set null,
  propuesta_codigo       text,
  propuesta_nomenclatura text,
  propuesta_tipo         public.tipo_actividad,
  propuesta_apoyo        text,

  concepto_justificativo text not null,

  -- Resolución
  resuelto_por    uuid references public.perfiles (id) on delete set null,
  resuelto_en     timestamptz,
  comentario_resolucion text,

  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  -- El concepto justificativo es lo que revisa el comité: exigimos sustancia.
  constraint solicitudes_justificacion_suficiente check (
    estado = 'borrador' or length(trim(concepto_justificativo)) >= 150
  ),
  constraint solicitudes_justificacion_maxima check (
    length(concepto_justificativo) <= 2000
  ),

  -- Editar o eliminar exige señalar qué actividad
  constraint solicitudes_objetivo_coherente check (
    tipo = 'crear' or actividad_id is not null
  ),

  -- Crear exige la propuesta completa
  constraint solicitudes_propuesta_coherente check (
    tipo <> 'crear'
    or (propuesta_nomenclatura is not null and propuesta_tipo is not null)
  ),

  -- Una solicitud resuelta guarda siempre quién y cuándo
  constraint solicitudes_resolucion_completa check (
    estado not in ('aprobada', 'denegada')
    or (resuelto_por is not null and resuelto_en is not null)
  )
);

create index solicitudes_estado_idx on public.solicitudes (estado, creado_en desc);
create index solicitudes_solicitante_idx on public.solicitudes (solicitante_id, creado_en desc);
create index solicitudes_actividad_idx on public.solicitudes (actividad_id);
create index solicitudes_periodo_idx on public.solicitudes (periodo_id);
-- Bandeja de coordinación: lo pendiente, lo urgente primero. Índice parcial:
-- sólo indexa las filas que la bandeja consulta, no el histórico completo.
create index solicitudes_bandeja_idx on public.solicitudes (prioridad desc, creado_en)
  where estado in ('pendiente', 'revision');

comment on table public.solicitudes is
  'Peticiones de creación, edición o baja de actividades. Nada muta la estructura sin pasar por aquí.';

-- -----------------------------------------------------------------------------
-- Folio correlativo por año: REQ-2026-0001
-- -----------------------------------------------------------------------------
create sequence if not exists public.solicitudes_folio_seq;

create or replace function public.fn_solicitud_folio()
returns trigger
language plpgsql
as $fn$
begin
  if new.folio is null or trim(new.folio) = '' then
    new.folio := 'REQ-'
      || to_char(now(), 'YYYY')
      || '-'
      || lpad(nextval('public.solicitudes_folio_seq')::text, 4, '0');
  end if;
  return new;
end;
$fn$;

create trigger trg_solicitud_folio
  before insert on public.solicitudes
  for each row execute function public.fn_solicitud_folio();

-- -----------------------------------------------------------------------------
-- Historial de revisiones — traza completa de cada cambio de estado
-- -----------------------------------------------------------------------------
create table public.solicitud_revisiones (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.solicitudes (id) on delete cascade,
  revisor_id     uuid references public.perfiles (id) on delete set null,

  estado_anterior public.estado_solicitud,
  estado_nuevo    public.estado_solicitud not null,
  comentario      text,

  creado_en      timestamptz not null default now()
);

create index solicitud_revisiones_solicitud_idx
  on public.solicitud_revisiones (solicitud_id, creado_en desc);

-- Cada transición de estado deja rastro automáticamente. No depende de que
-- el cliente se acuerde de escribirlo.
create or replace function public.fn_solicitud_registrar_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.solicitud_revisiones (solicitud_id, revisor_id, estado_anterior, estado_nuevo)
    values (new.id, new.solicitante_id, null, new.estado);
  elsif new.estado is distinct from old.estado then
    insert into public.solicitud_revisiones (solicitud_id, revisor_id, estado_anterior, estado_nuevo, comentario)
    values (new.id, coalesce(new.resuelto_por, auth.uid()), old.estado, new.estado, new.comentario_resolucion);
  end if;
  return null;
end;
$fn$;

create trigger trg_solicitud_registrar_revision
  after insert or update of estado on public.solicitudes
  for each row execute function public.fn_solicitud_registrar_revision();

-- Al resolver, sella quién y cuándo sin confiar en el cliente.
create or replace function public.fn_solicitud_sellar_resolucion()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.estado in ('aprobada', 'denegada') and old.estado not in ('aprobada', 'denegada') then
    new.resuelto_por := coalesce(new.resuelto_por, auth.uid());
    new.resuelto_en  := coalesce(new.resuelto_en, now());
  end if;
  return new;
end;
$fn$;

create trigger trg_solicitud_sellar_resolucion
  before update of estado on public.solicitudes
  for each row execute function public.fn_solicitud_sellar_resolucion();

-- -----------------------------------------------------------------------------
-- Notificaciones
-- -----------------------------------------------------------------------------
create table public.notificaciones (
  id            uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references public.perfiles (id) on delete cascade,

  titulo        text not null,
  cuerpo        text,
  enlace        text,                     -- ruta interna, p. ej. /solicitudes/<id>
  icono         text,

  leida_en      timestamptz,
  creado_en     timestamptz not null default now()
);

-- Índice parcial: la campana sólo consulta las no leídas.
create index notificaciones_pendientes_idx
  on public.notificaciones (destinatario_id, creado_en desc)
  where leida_en is null;

-- -----------------------------------------------------------------------------
-- Bitácora de auditoría — quién tocó qué y cómo quedó
-- -----------------------------------------------------------------------------
create table public.auditoria (
  id           bigint generated always as identity primary key,
  tabla        text not null,
  registro_id  text not null,
  accion       public.accion_auditoria not null,

  actor_id     uuid references public.perfiles (id) on delete set null,
  datos_antes  jsonb,
  datos_despues jsonb,

  creado_en    timestamptz not null default now()
);

create index auditoria_tabla_registro_idx on public.auditoria (tabla, registro_id, creado_en desc);
create index auditoria_actor_idx on public.auditoria (actor_id, creado_en desc);

-- Trigger genérico: se engancha a cualquier tabla que deba auditarse.
create or replace function public.fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id text;
begin
  v_id := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'id'),
    '(sin id)'
  );

  insert into public.auditoria (tabla, registro_id, accion, actor_id, datos_antes, datos_despues)
  values (
    tg_table_name,
    v_id,
    lower(tg_op)::public.accion_auditoria,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return null;
end;
$fn$;

create trigger trg_auditar_roles
  after insert or update or delete on public.roles
  for each row execute function public.fn_auditar();

create trigger trg_auditar_perfiles
  after insert or update or delete on public.perfiles
  for each row execute function public.fn_auditar();

create trigger trg_auditar_actividades
  after insert or update or delete on public.actividades
  for each row execute function public.fn_auditar();

create trigger trg_auditar_solicitudes
  after insert or update or delete on public.solicitudes
  for each row execute function public.fn_auditar();

-- -----------------------------------------------------------------------------
-- Vista de bandeja: solicitudes con solicitante y actividad ya resueltos
-- -----------------------------------------------------------------------------
create or replace view public.v_solicitudes_detalle
with (security_invoker = true) as
select
  s.id,
  s.folio,
  s.tipo,
  s.estado,
  s.prioridad,
  s.concepto_justificativo,
  s.creado_en,
  s.resuelto_en,
  s.comentario_resolucion,

  s.solicitante_id,
  sp.nombre_completo as solicitante_nombre,
  sp.cargo           as solicitante_cargo,
  sp.avatar_url      as solicitante_avatar,
  vic.nombre         as solicitante_vicerrectoria,

  s.actividad_id,
  a.codigo           as actividad_codigo,
  a.nomenclatura     as actividad_nomenclatura,
  coalesce(a.nomenclatura, s.propuesta_nomenclatura) as objetivo_nomenclatura,
  coalesce(a.codigo, s.propuesta_codigo)             as objetivo_codigo,

  s.periodo_id,
  per.codigo         as periodo_codigo,

  s.resuelto_por,
  rp.nombre_completo as resuelto_por_nombre
from public.solicitudes s
join public.perfiles sp on sp.id = s.solicitante_id
left join public.vicerrectorias vic on vic.id = sp.vicerrectoria_id
left join public.actividades a on a.id = s.actividad_id
left join public.periodos per on per.id = s.periodo_id
left join public.perfiles rp on rp.id = s.resuelto_por;

-- -----------------------------------------------------------------------------
-- Métricas del panel de Inteligencia de Negocios.
-- Una sola llamada en vez de cinco COUNT desde el cliente.
-- -----------------------------------------------------------------------------
create or replace function public.fn_metricas_solicitudes(p_periodo_id uuid default null)
returns table (
  total        bigint,
  aprobadas    bigint,
  pendientes   bigint,
  denegadas    bigint,
  urgentes     bigint,
  tasa_aprobacion numeric
)
language sql
stable
security invoker
set search_path = public
as $fn$
  with base as (
    select *
    from public.solicitudes
    where p_periodo_id is null or periodo_id = p_periodo_id
  )
  select
    count(*)                                                              as total,
    count(*) filter (where estado = 'aprobada')                           as aprobadas,
    count(*) filter (where estado in ('pendiente', 'revision'))           as pendientes,
    count(*) filter (where estado = 'denegada')                           as denegadas,
    count(*) filter (where prioridad = 'urgente'
                       and estado in ('pendiente', 'revision'))           as urgentes,
    round(
      100.0 * count(*) filter (where estado = 'aprobada')
      / nullif(count(*) filter (where estado <> 'borrador'), 0),
      1
    )                                                                     as tasa_aprobacion
  from base;
$fn$;

comment on function public.fn_metricas_solicitudes is
  'Tarjetas del panel BI en una sola consulta. security invoker: sólo cuenta lo que el usuario puede ver.';

-- -----------------------------------------------------------------------------
-- Triggers de actualizado_en
-- -----------------------------------------------------------------------------
create trigger trg_solicitudes_actualizado before update on public.solicitudes
  for each row execute function public.fn_set_actualizado_en();
