-- =============================================================================
-- Rua · 10 — Gestión de periodos académicos
--
-- Abrir un periodo NO es cambiar una columna. El índice `periodos_uno_abierto`
-- garantiza que sólo haya uno abierto a la vez, así que un UPDATE ingenuo desde
-- el cliente choca contra una violación de unicidad y el usuario recibe un
-- «ya existe un registro con esos datos» que no explica nada.
--
-- La apertura es, en realidad, una transición: cerrar el vigente y abrir el
-- nuevo, atómicamente. Eso es una función, no un formulario.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vista con el estado real de cada periodo
--
-- Antes de cerrar un periodo hay que poder ver qué queda dentro: cuántas
-- actividades siguen sin ejecutar y cuántas solicitudes están sin resolver.
-- -----------------------------------------------------------------------------
create or replace view public.v_periodos_detalle
with (security_invoker = true) as
select
  p.id,
  p.codigo,
  p.nombre,
  p.fecha_inicio,
  p.fecha_fin,
  p.estado,
  p.creado_en,
  p.actualizado_en,

  (p.fecha_fin - p.fecha_inicio)                             as dias_totales,
  greatest(0, p.fecha_fin - current_date)                    as dias_restantes,
  (current_date between p.fecha_inicio and p.fecha_fin)      as en_curso,

  coalesce(ap.total, 0)         as actividades,
  coalesce(ap.pendientes, 0)    as actividades_pendientes,
  coalesce(s.total, 0)          as solicitudes,
  coalesce(s.sin_resolver, 0)   as solicitudes_sin_resolver
from public.periodos p
left join lateral (
  select
    count(*)                                                          as total,
    count(*) filter (where estado in ('planificada', 'en_curso'))     as pendientes
  from public.actividad_periodo x
  where x.periodo_id = p.id
) ap on true
left join lateral (
  select
    count(*)                                                          as total,
    count(*) filter (where estado in ('pendiente', 'revision'))       as sin_resolver
  from public.solicitudes y
  where y.periodo_id = p.id
) s on true;

comment on view public.v_periodos_detalle is
  'Periodos con el recuento de actividades y solicitudes que contienen. Alimenta la pantalla de administración.';

-- -----------------------------------------------------------------------------
-- Abrir un periodo
--
-- Cierra el que estuviera abierto y abre el indicado, en una sola transacción.
-- Opcionalmente arrastra las actividades activas, porque un periodo recién
-- abierto y vacío no le sirve a nadie: la pantalla «Actividades del Periodo»
-- saldría sin una sola fila.
-- -----------------------------------------------------------------------------
create or replace function public.fn_abrir_periodo(
  p_id uuid,
  p_copiar_actividades boolean default true
)
returns table (
  cerrado_codigo      text,
  actividades_creadas int
)
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_cerrado text;
  v_creadas int := 0;
  v_periodo record;
begin
  select * into v_periodo from public.periodos where id = p_id;
  if not found then
    raise exception 'El periodo indicado no existe.'
      using errcode = 'no_data_found';
  end if;

  if v_periodo.estado = 'abierto' then
    raise exception 'El periodo % ya está abierto.', v_periodo.codigo
      using errcode = 'check_violation';
  end if;

  -- Primero se cierra el vigente. El orden importa: hacerlo al revés violaría
  -- el índice único a mitad de la transacción.
  update public.periodos
  set estado = 'cerrado'
  where estado = 'abierto'
  returning codigo into v_cerrado;

  update public.periodos
  set estado = 'abierto'
  where id = p_id;

  if p_copiar_actividades then
    -- Sólo las activas, y sólo las que no estuvieran ya: reabrir un periodo
    -- no debe duplicar lo que ya tenía dentro.
    insert into public.actividad_periodo (actividad_id, periodo_id, estado)
    select a.id, p_id, 'planificada'
    from public.actividades a
    where a.estado = 'activa'
    on conflict (actividad_id, periodo_id) do nothing;

    get diagnostics v_creadas = row_count;
  end if;

  return query select v_cerrado, v_creadas;
end;
$fn$;

comment on function public.fn_abrir_periodo is
  'Transición atómica: cierra el periodo vigente, abre el indicado y, si se pide, arrastra las actividades activas.';

-- -----------------------------------------------------------------------------
-- Cerrar un periodo
-- -----------------------------------------------------------------------------
create or replace function public.fn_cerrar_periodo(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_estado public.estado_periodo;
begin
  select estado into v_estado from public.periodos where id = p_id;
  if not found then
    raise exception 'El periodo indicado no existe.' using errcode = 'no_data_found';
  end if;
  if v_estado = 'cerrado' then
    raise exception 'El periodo ya está cerrado.' using errcode = 'check_violation';
  end if;

  update public.periodos set estado = 'cerrado' where id = p_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Poblar un periodo con las actividades activas
--
-- Se expone aparte de la apertura para poder recargar un periodo YA abierto
-- después de haber creado actividades nuevas, sin tener que cerrarlo y volver
-- a abrirlo.
-- -----------------------------------------------------------------------------
create or replace function public.fn_poblar_periodo(p_id uuid)
returns int
language sql
security invoker
set search_path = public
as $fn$
  with insertadas as (
    insert into public.actividad_periodo (actividad_id, periodo_id, estado)
    select a.id, p_id, 'planificada'
    from public.actividades a
    where a.estado = 'activa'
    on conflict (actividad_id, periodo_id) do nothing
    returning 1
  )
  select count(*)::int from insertadas;
$fn$;

comment on function public.fn_poblar_periodo is
  'Añade al periodo las actividades activas que aún no estén en él. Idempotente.';

grant execute on function
  public.fn_abrir_periodo,
  public.fn_cerrar_periodo,
  public.fn_poblar_periodo
to authenticated;

-- -----------------------------------------------------------------------------
-- Solapamiento de fechas
--
-- Dos periodos no deberían pisarse en el calendario: una actividad no puede
-- pertenecer a dos semestres a la vez. Se avisa con un trigger y no con un
-- EXCLUDE constraint porque hay correcciones legítimas —prorrogar un cierre—
-- que no deben quedar bloqueadas de raíz.
-- -----------------------------------------------------------------------------
create or replace function public.fn_periodo_validar_rango()
returns trigger
language plpgsql
as $fn$
declare
  v_choque text;
begin
  select codigo into v_choque
  from public.periodos
  where id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and estado <> 'cerrado'
    and new.estado <> 'cerrado'
    and daterange(fecha_inicio, fecha_fin, '[]') && daterange(new.fecha_inicio, new.fecha_fin, '[]')
  limit 1;

  if v_choque is not null then
    raise exception 'Las fechas se solapan con el periodo %.', v_choque
      using errcode = 'check_violation',
            hint = 'Cierra ese periodo primero o ajusta las fechas.';
  end if;

  return new;
end;
$fn$;

create trigger trg_periodo_validar_rango
  before insert or update of fecha_inicio, fecha_fin, estado on public.periodos
  for each row execute function public.fn_periodo_validar_rango();
