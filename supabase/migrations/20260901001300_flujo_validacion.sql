-- =============================================================================
-- Rua · 13 — Flujo de validación por etapas
--
-- Hasta ahora una solicitud la resolvía UNA persona con un clic. El proceso
-- real tiene varias firmas: coordinación revisa, la Vicerrectoría
-- Administrativa y Financiera valida el impacto presupuestal, y auditoría da
-- el visto bueno normativo.
--
-- Modelarlo como una cadena de etapas —y no como más valores del enum de
-- estado— es lo que permite responder «¿en qué va mi solicitud?», que es la
-- pregunta que hace el solicitante y la que el Rua Tracker contesta.
--
-- Cada decisión exige justificación, incluida la APROBACIÓN. Aprobar sin
-- motivo escrito deja un expediente que nadie puede auditar después.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permisos de las nuevas validaciones
-- -----------------------------------------------------------------------------
insert into public.permisos (codigo, modulo, accion, descripcion) values
  ('solicitudes.validar_financiera', 'solicitudes', 'validar_financiera',
   'Validar el impacto administrativo y financiero de una solicitud'),
  ('solicitudes.validar_auditoria', 'solicitudes', 'validar_auditoria',
   'Dar el visto bueno normativo de auditoría')
on conflict (codigo) do update
  set descripcion = excluded.descripcion;

-- -----------------------------------------------------------------------------
-- Catálogo de etapas
--
-- Las etapas se atan a un PERMISO, no a un nombre de rol: renombrar un cargo o
-- reorganizar la estructura no debe romper el flujo.
-- -----------------------------------------------------------------------------
create table public.etapas_flujo (
  codigo         text primary key,
  nombre         text not null,
  descripcion    text,
  orden          smallint not null unique,
  permiso_codigo text not null references public.permisos (codigo),
  obligatoria    boolean not null default true,
  activa         boolean not null default true,

  constraint etapas_flujo_orden_positivo check (orden > 0)
);

comment on table public.etapas_flujo is
  'Secuencia de validaciones por las que pasa una solicitud. El orden define la cadena de firmas.';

insert into public.etapas_flujo (codigo, nombre, descripcion, orden, permiso_codigo) values
  ('coordinacion', 'Coordinación Académica',
   'Revisa la pertinencia académica y la coherencia con la estructura vigente.',
   1, 'solicitudes.revisar'),
  ('financiera', 'Vicerrectoría Administrativa y Financiera',
   'Valida el impacto presupuestal y la disponibilidad de recursos.',
   2, 'solicitudes.validar_financiera'),
  ('auditoria', 'Auditoría',
   'Verifica el cumplimiento normativo y la trazabilidad del expediente.',
   3, 'solicitudes.validar_auditoria')
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- Rol de la Vicerrectoría Administrativa y Financiera
-- -----------------------------------------------------------------------------
insert into public.roles (nombre, descripcion, puede_leer, puede_editar, puede_eliminar, nivel_acceso, es_sistema)
values (
  'Vicerrectoría Administrativa y Financiera',
  'Valida el impacto presupuestal de las solicitudes académicas.',
  true, true, false, 'limitado', true
)
on conflict do nothing;

-- Concesiones: cada rol recibe la validación que le corresponde.
insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from public.roles r
join public.permisos p on p.codigo in (
  'bi.consultar', 'actividades.ver', 'solicitudes.crear', 'solicitudes.validar_financiera'
)
where public.fn_normalizar(r.nombre) = 'vicerrectoria administrativa y financiera'
on conflict do nothing;

insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, 'solicitudes.validar_auditoria'
from public.roles r
where public.fn_normalizar(r.nombre) = 'auditor externo'
on conflict do nothing;

-- El administrador conserva el catálogo completo, también lo que se añade después.
insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from public.roles r
cross join public.permisos p
where public.fn_normalizar(r.nombre) = 'administrador del sistema'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Instancias por solicitud
-- -----------------------------------------------------------------------------
create type public.estado_etapa as enum ('bloqueada', 'pendiente', 'aprobada', 'denegada', 'omitida');

create table public.solicitud_etapas (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.solicitudes (id) on delete cascade,
  etapa_codigo   text not null references public.etapas_flujo (codigo),
  orden          smallint not null,

  estado         public.estado_etapa not null default 'bloqueada',
  revisor_id     uuid references public.perfiles (id) on delete set null,
  justificacion  text,
  decidida_en    timestamptz,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  unique (solicitud_id, etapa_codigo),

  -- Aprobar sin motivo escrito deja un expediente que nadie puede auditar.
  -- Es la razón de ser de esta migración, así que se impone en la base.
  constraint solicitud_etapas_justificacion_obligatoria check (
    estado not in ('aprobada', 'denegada')
    or length(trim(coalesce(justificacion, ''))) >= 20
  ),
  constraint solicitud_etapas_decision_sellada check (
    estado not in ('aprobada', 'denegada')
    or (revisor_id is not null and decidida_en is not null)
  )
);

create index solicitud_etapas_solicitud_idx on public.solicitud_etapas (solicitud_id, orden);
-- Índice parcial para la bandeja: sólo lo que está esperando firma.
create index solicitud_etapas_pendientes_idx on public.solicitud_etapas (etapa_codigo)
  where estado = 'pendiente';

comment on constraint solicitud_etapas_justificacion_obligatoria on public.solicitud_etapas is
  'Toda decisión —aprobar incluido— lleva justificación de al menos 20 caracteres.';

create trigger trg_solicitud_etapas_actualizado before update on public.solicitud_etapas
  for each row execute function public.fn_set_actualizado_en();

-- La traza de revisiones gana la etapa a la que pertenece cada movimiento.
alter table public.solicitud_revisiones
  add column if not exists etapa_codigo text references public.etapas_flujo (codigo);

-- -----------------------------------------------------------------------------
-- Instanciación de la cadena al enviar la solicitud
-- -----------------------------------------------------------------------------
create or replace function public.fn_instanciar_etapas()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Sólo al pasar de borrador a pendiente. Reabrir una solicitud no debe
  -- duplicar la cadena ni borrar las firmas que ya se dieron.
  if new.estado <> 'pendiente' then return null; end if;
  if tg_op = 'UPDATE' and old.estado = 'pendiente' then return null; end if;
  if exists (select 1 from public.solicitud_etapas where solicitud_id = new.id) then
    return null;
  end if;

  insert into public.solicitud_etapas (solicitud_id, etapa_codigo, orden, estado)
  select
    new.id,
    e.codigo,
    e.orden,
    -- La primera espera firma; el resto se desbloquea al aprobarse la anterior.
    case when e.orden = (select min(orden) from public.etapas_flujo where activa)
      then 'pendiente'::public.estado_etapa
      else 'bloqueada'::public.estado_etapa
    end
  from public.etapas_flujo e
  where e.activa
  order by e.orden;

  return null;
end;
$fn$;

create trigger trg_instanciar_etapas
  after insert or update of estado on public.solicitudes
  for each row execute function public.fn_instanciar_etapas();

-- -----------------------------------------------------------------------------
-- Decisión sobre la etapa vigente
--
-- Una sola función para aprobar y denegar: la transición del expediente
-- completo —desbloquear la siguiente firma, o cerrar la solicitud— tiene que
-- ocurrir en la misma transacción que la firma. Partirlo en dos llamadas desde
-- el cliente dejaría solicitudes con una etapa aprobada y ninguna siguiente.
-- -----------------------------------------------------------------------------
create or replace function public.fn_decidir_etapa(
  p_solicitud_id  uuid,
  p_aprobar       boolean,
  p_justificacion text
)
returns table (
  etapa_decidida  text,
  siguiente_etapa text,
  estado_solicitud public.estado_solicitud
)
language plpgsql
-- DEFINER a propósito: `solicitud_etapas` no tiene política de escritura, así
-- que ésta es la ÚNICA vía para firmar. La autorización la hace la propia
-- función —permiso de la etapa, orden de la cadena, no ser el solicitante—
-- antes de tocar nada.
security definer
set search_path = public
as $fn$
declare
  v_etapa            record;
  v_solicitud        record;
  v_siguiente        record;
  v_siguiente_codigo text := null;
  v_estado           public.estado_solicitud;
begin
  if length(trim(coalesce(p_justificacion, ''))) < 20 then
    raise exception 'La justificación debe tener al menos 20 caracteres, tanto al aprobar como al denegar.'
      using errcode = 'check_violation';
  end if;

  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'La solicitud no existe o no tienes acceso a ella.'
      using errcode = 'no_data_found';
  end if;

  if v_solicitud.solicitante_id = auth.uid() then
    raise exception 'No puedes validar tu propia solicitud.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_solicitud.estado not in ('pendiente', 'revision') then
    raise exception 'La solicitud ya está resuelta.'
      using errcode = 'check_violation';
  end if;

  -- La etapa vigente es la primera sin decidir. No se puede firmar por
  -- adelantado ni saltarse una firma anterior.
  select se.*, e.nombre, e.permiso_codigo
  into v_etapa
  from public.solicitud_etapas se
  join public.etapas_flujo e on e.codigo = se.etapa_codigo
  where se.solicitud_id = p_solicitud_id
    and se.estado = 'pendiente'
  order by se.orden
  limit 1;

  if not found then
    raise exception 'No hay ninguna etapa esperando decisión en esta solicitud.'
      using errcode = 'check_violation';
  end if;

  if not public.fn_tengo_permiso(v_etapa.permiso_codigo) then
    raise exception 'Esta solicitud espera la validación de %, y no tienes ese permiso.', v_etapa.nombre
      using errcode = 'insufficient_privilege';
  end if;

  update public.solicitud_etapas
  set estado        = case when p_aprobar then 'aprobada' else 'denegada' end::public.estado_etapa,
      revisor_id    = auth.uid(),
      justificacion = trim(p_justificacion),
      decidida_en   = now()
  where id = v_etapa.id;

  if p_aprobar then
    -- Se desbloquea la siguiente firma...
    select * into v_siguiente
    from public.solicitud_etapas
    where solicitud_id = p_solicitud_id
      and estado = 'bloqueada'
    order by orden
    limit 1;

    if found then
      update public.solicitud_etapas set estado = 'pendiente' where id = v_siguiente.id;
      v_siguiente_codigo := v_siguiente.etapa_codigo;
      v_estado := 'revision';
    else
      -- ...o, si era la última, queda aprobada la solicitud entera.
      v_estado := 'aprobada';
    end if;
  else
    -- Una denegación corta la cadena: las etapas posteriores no llegan a existir.
    update public.solicitud_etapas
    set estado = 'omitida'
    where solicitud_id = p_solicitud_id and estado = 'bloqueada';
    v_estado := 'denegada';
  end if;

  update public.solicitudes
  set estado                = v_estado,
      resuelto_por          = case when v_estado in ('aprobada', 'denegada') then auth.uid() end,
      resuelto_en           = case when v_estado in ('aprobada', 'denegada') then now() end,
      comentario_resolucion = case when v_estado in ('aprobada', 'denegada') then trim(p_justificacion) end
  where id = p_solicitud_id;

  -- Traza explícita de la firma. El trigger de `solicitudes` ya registra el
  -- cambio de estado, pero no sabe a qué etapa pertenece; esta fila sí.
  insert into public.solicitud_revisiones
    (solicitud_id, revisor_id, estado_anterior, estado_nuevo, comentario, etapa_codigo)
  values
    (p_solicitud_id, auth.uid(), v_solicitud.estado, v_estado, trim(p_justificacion), v_etapa.etapa_codigo);

  return query select v_etapa.etapa_codigo, v_siguiente_codigo, v_estado;
end;
$fn$;

comment on function public.fn_decidir_etapa is
  'Firma la etapa vigente y avanza el expediente en la misma transacción. Exige justificación siempre.';

-- -----------------------------------------------------------------------------
-- Días hábiles transcurridos, para el indicador de plazo del Tracker
-- -----------------------------------------------------------------------------
create or replace function public.fn_dias_habiles(p_desde timestamptz, p_hasta timestamptz default now())
returns int
language sql
immutable
parallel safe
as $fn$
  select greatest(0, count(*)::int - 1)
  from generate_series(p_desde::date, p_hasta::date, interval '1 day') d
  where extract(isodow from d) < 6;
$fn$;

comment on function public.fn_dias_habiles is
  'Días hábiles entre dos fechas, sin contar sábados ni domingos. No conoce los festivos institucionales.';

-- -----------------------------------------------------------------------------
-- Vista de seguimiento — lo que consume el Rua Tracker
-- -----------------------------------------------------------------------------
create or replace view public.v_solicitud_etapas
with (security_invoker = true) as
select
  se.id,
  se.solicitud_id,
  se.etapa_codigo,
  se.orden,
  se.estado,
  se.justificacion,
  se.decidida_en,
  se.revisor_id,

  e.nombre        as etapa_nombre,
  e.descripcion   as etapa_descripcion,
  e.permiso_codigo,

  p.nombre_completo as revisor_nombre,
  p.avatar_url      as revisor_avatar,
  r.nombre          as revisor_rol
from public.solicitud_etapas se
join public.etapas_flujo e on e.codigo = se.etapa_codigo
left join public.perfiles p on p.id = se.revisor_id
left join public.roles r on r.id = p.rol_id;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.etapas_flujo enable row level security;
alter table public.solicitud_etapas enable row level security;

create policy "etapas_flujo_lectura" on public.etapas_flujo
  for select to authenticated using (public.fn_estoy_activo());

create policy "etapas_flujo_escritura" on public.etapas_flujo
  for all to authenticated
  using (public.fn_soy_admin())
  with check (public.fn_soy_admin());

-- Se ven las etapas de las solicitudes que ya se pueden ver: la política de
-- `solicitudes` decide, y ésta la hereda. Una sola regla de visibilidad.
create policy "solicitud_etapas_lectura" on public.solicitud_etapas
  for select to authenticated
  using (
    exists (select 1 from public.solicitudes s where s.id = solicitud_etapas.solicitud_id)
  );

-- Nadie escribe aquí a mano: sólo `fn_decidir_etapa`, que valida permiso,
-- orden y autoría antes de firmar. Sin política de escritura, cualquier
-- UPDATE directo desde el cliente queda bloqueado.

grant execute on function public.fn_decidir_etapa, public.fn_dias_habiles to authenticated;
