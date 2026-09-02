-- =============================================================================
-- Rua · 18 — Que cada oficina vea lo que tiene que firmar
--
-- El flujo repartía las firmas por PERMISO, pero la visibilidad seguía atada a
-- `solicitudes.revisar`, que es otra cosa: «consultar todas las solicitudes
-- del sistema». Ni la Vicerrectoría Administrativa y Financiera ni Auditoría
-- lo tienen —no deben tenerlo, no es su papel mirar el sistema entero—, así
-- que los expedientes que estaban esperando su concepto no les llegaban.
--
-- No es que faltara un botón: la fila no salía de la base. Quien tenía que
-- responder veía una bandeja vacía y el expediente se quedaba parado sin que
-- nadie supiera por qué.
--
-- La regla que faltaba es la evidente: SE VE LO QUE SE TIENE QUE FIRMAR. Y se
-- sigue viendo después de firmado, porque una oficina necesita consultar lo
-- que ella misma conceptuó.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ¿Interviene mi oficina en este expediente?
--
-- DEFINER a propósito, y no por comodidad: la llama la política de lectura de
-- `solicitudes`, y `solicitud_etapas` hereda su visibilidad de esa misma
-- política. Sin definer, comprobar el permiso exigiría leer las etapas, leer
-- las etapas exigiría pasar por la política, y la política volvería a llamar
-- aquí. Recursión infinita.
-- -----------------------------------------------------------------------------
create or replace function public.fn_intervengo_en_solicitud(p_solicitud_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.solicitud_etapas se
    join public.etapas_flujo e on e.codigo = se.etapa_codigo
    where se.solicitud_id = p_solicitud_id
      and public.fn_tengo_permiso(e.permiso_codigo)
  );
$fn$;

comment on function public.fn_intervengo_en_solicitud is
  'Cierto si alguna etapa de este expediente la firma un permiso que tengo. Es la regla de visibilidad de quien valida sin ser revisor general.';

grant execute on function public.fn_intervengo_en_solicitud to authenticated;

-- -----------------------------------------------------------------------------
-- La política de lectura suma ese caso
-- -----------------------------------------------------------------------------
drop policy if exists "solicitudes_lectura" on public.solicitudes;

create policy "solicitudes_lectura" on public.solicitudes
  for select to authenticated
  using (
    public.fn_estoy_activo()
    and (
      solicitante_id = auth.uid()
      or public.fn_tengo_permiso('solicitudes.revisar')
      -- Interviene mi oficina en la cadena: lo veo, antes y después de firmar.
      or public.fn_intervengo_en_solicitud(solicitudes.id)
      or exists (
        select 1 from public.perfiles p
        where p.id = solicitudes.solicitante_id
          and p.vicerrectoria_id is not null
          and p.vicerrectoria_id = public.fn_mi_vicerrectoria_id()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- La bandeja necesita saber DE QUIÉN es el turno
--
-- Sin esto la lista no puede distinguir «te toca responder» de «ya respondiste»
-- de «no es tu turno», y las tres acaban con el mismo botón genérico. Son tres
-- situaciones distintas y el usuario tiene que verlas distintas.
--
-- `create or replace view` sólo admite AÑADIR columnas al final: las nuevas van
-- las últimas por eso, no por gusto.
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
  rp.nombre_completo as resuelto_por_nombre,

  -- Etapa que está esperando concepto, si el expediente sigue en curso.
  etapa.codigo         as etapa_vigente_codigo,
  etapa.nombre         as etapa_vigente_nombre,
  etapa.permiso_codigo as etapa_vigente_permiso,

  -- ¿Ya emití yo mi concepto en este expediente? Es lo que apaga la acción
  -- hasta que la cadena llegue —si llega— a otra etapa que también me toque.
  exists (
    select 1 from public.solicitud_etapas mia
    where mia.solicitud_id = s.id and mia.revisor_id = auth.uid()
  ) as ya_respondi,

  -- Cuántas actividades toca. La bandeja enseña una; conviene decir si hay más.
  (select count(*) from public.solicitud_actividades sa where sa.solicitud_id = s.id)
    as total_actividades
from public.solicitudes s
join public.perfiles sp on sp.id = s.solicitante_id
left join public.vicerrectorias vic on vic.id = sp.vicerrectoria_id
left join public.actividades a on a.id = s.actividad_id
left join public.periodos per on per.id = s.periodo_id
left join public.perfiles rp on rp.id = s.resuelto_por
left join lateral (
  select e.codigo, e.nombre, e.permiso_codigo
  from public.solicitud_etapas se
  join public.etapas_flujo e on e.codigo = se.etapa_codigo
  where se.solicitud_id = s.id and se.estado = 'pendiente'
  order by se.orden
  limit 1
) etapa on true;

comment on view public.v_solicitudes_detalle is
  'Solicitudes con su solicitante, su objetivo y de quién es el turno de firmar. Alimenta la bandeja y el expediente.';
