-- =============================================================================
-- Rua · 14 — Corrección del flujo y configuración desde la interfaz
--
-- Dos cosas estaban mal en la migración 13:
--
--   1. Coordinación Académica figuraba como primera FIRMA. No lo es: es quien
--      SOLICITA la creación de los códigos. Ponerla a aprobar su propia
--      petición era, literalmente, pedirle que se firmara a sí misma.
--
--   2. Faltaba el final del proceso. Aprobar dejaba la solicitud en verde pero
--      la actividad no existía en la plataforma: alguien tenía que crearla a
--      mano y nadie sabía si se había hecho. Ahora la creación ES la última
--      etapa, y la firma del administrador la materializa en la misma
--      transacción.
--
-- Además, la cadena deja de estar grabada en una migración: el administrador
-- la configura desde la interfaz —qué etapas, en qué orden y qué roles firman
-- cada una—, porque quién valida qué cambia con cada reorganización.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Una etapa puede MATERIALIZAR el cambio, no sólo aprobarlo
-- -----------------------------------------------------------------------------
alter table public.etapas_flujo
  add column if not exists materializa boolean not null default false;

comment on column public.etapas_flujo.materializa is
  'Si es cierto, aprobar esta etapa aplica el cambio sobre `actividades`. Sólo debería haber una, y al final de la cadena.';

-- Como mucho una etapa materializa: dos aplicarían el cambio dos veces.
create unique index if not exists etapas_flujo_una_materializa
  on public.etapas_flujo ((materializa))
  where materializa;

-- -----------------------------------------------------------------------------
-- Coordinación Académica sale de la cadena de firmas
--
-- Se desactiva en vez de borrarse si ya hay expedientes que la atravesaron:
-- borrar la etapa dejaría esas firmas sin referencia y reescribiría la
-- historia de solicitudes ya resueltas.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.solicitud_etapas where etapa_codigo = 'coordinacion') then
    update public.etapas_flujo set activa = false where codigo = 'coordinacion';
  else
    delete from public.etapas_flujo where codigo = 'coordinacion';
  end if;
end
$$;

-- `solicitudes.revisar` deja de significar «aprobar». Ahora es visibilidad:
-- quién puede consultar TODAS las solicitudes, no sólo las suyas.
update public.permisos
set descripcion = 'Consultar todas las solicitudes del sistema'
where codigo = 'solicitudes.revisar';

-- -----------------------------------------------------------------------------
-- Cadena por defecto
--
-- Coordinación solicita · Financiera valida · Auditoría valida ·
-- Administración crea la actividad en la plataforma.
-- -----------------------------------------------------------------------------
-- `orden` es único, así que se desplaza TODO fuera de rango antes de
-- renumerar. Incluidas las etapas desactivadas: si se quedan en su sitio,
-- chocan con la primera que vuelva a ocupar ese número.
update public.etapas_flujo set orden = orden + 1000;

insert into public.etapas_flujo (codigo, nombre, descripcion, orden, permiso_codigo, materializa)
values (
  'ejecucion',
  'Creación en la plataforma',
  'La administración da de alta la actividad en la estructura maestra. Al firmar, el cambio se aplica.',
  2000,
  'actividades.crear',
  true
)
on conflict (codigo) do update
  set nombre         = excluded.nombre,
      descripcion    = excluded.descripcion,
      permiso_codigo = excluded.permiso_codigo,
      materializa    = excluded.materializa;

update public.etapas_flujo set orden = 1, activa = true where codigo = 'financiera';
update public.etapas_flujo set orden = 2, activa = true where codigo = 'auditoria';
update public.etapas_flujo set orden = 3, activa = true where codigo = 'ejecucion';

-- Lo que siga desplazado —etapas desactivadas o añadidas antes— se apila
-- detrás, conservando su orden relativo.
with resto as (
  select codigo, (row_number() over (order by orden))::smallint + 3 as i
  from public.etapas_flujo
  where orden > 1000
)
update public.etapas_flujo e
set orden = r.i
from resto r
where e.codigo = r.codigo;

-- -----------------------------------------------------------------------------
-- Catálogo de permisos ampliable por el administrador
--
-- Añadir una etapa nueva exige un permiso nuevo. Se permite crearlos, pero
-- SÓLO con el prefijo de validación: el resto del catálogo sigue siendo
-- cerrado, porque un permiso inventado que nadie comprueba es una puerta
-- abierta que parece cerrada.
-- -----------------------------------------------------------------------------
create policy "permisos_alta_validaciones" on public.permisos
  for insert to authenticated
  with check (
    public.fn_soy_admin()
    and codigo like 'solicitudes.validar\_%'
    and modulo = 'solicitudes'
  );

-- -----------------------------------------------------------------------------
-- Reordenar la cadena
--
-- `orden` es único, así que reasignarlo fila a fila choca a mitad de camino.
-- Se desplaza todo fuera de rango y se vuelve a numerar desde 1.
-- -----------------------------------------------------------------------------
create or replace function public.fn_reordenar_etapas(p_codigos text[])
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  if not public.fn_soy_admin() then
    raise exception 'Sólo un administrador puede reordenar el flujo.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_codigos is null or array_length(p_codigos, 1) is null then
    raise exception 'No se recibió ninguna etapa que reordenar.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.etapas_flujo set orden = orden + 1000;

  update public.etapas_flujo e
  set orden = pos.i::smallint
  from unnest(p_codigos) with ordinality as pos(codigo, i)
  where e.codigo = pos.codigo;

  -- Lo que no venía en la lista se apila al final, conservando su orden
  -- relativo. Así una etapa olvidada no desaparece ni bloquea la unicidad.
  with sobrantes as (
    select
      codigo,
      ((row_number() over (order by orden)) + array_length(p_codigos, 1))::smallint as i
    from public.etapas_flujo
    where orden > 1000
  )
  update public.etapas_flujo e
  set orden = s.i
  from sobrantes s
  where e.codigo = s.codigo;
end;
$fn$;

grant execute on function public.fn_reordenar_etapas to authenticated;

-- -----------------------------------------------------------------------------
-- Decisión sobre la etapa vigente, ahora con materialización
-- -----------------------------------------------------------------------------
drop function if exists public.fn_decidir_etapa(uuid, boolean, text);

create function public.fn_decidir_etapa(
  p_solicitud_id  uuid,
  p_aprobar       boolean,
  p_justificacion text
)
returns table (
  etapa_decidida   text,
  siguiente_etapa  text,
  estado_solicitud public.estado_solicitud,
  actividad_id     uuid
)
language plpgsql
-- DEFINER a propósito: `solicitud_etapas` no tiene política de escritura, así
-- que ésta es la ÚNICA vía para firmar. La autorización la hace la propia
-- función antes de tocar nada.
security definer
set search_path = public
as $fn$
declare
  v_etapa            record;
  v_solicitud        record;
  v_siguiente        record;
  v_siguiente_codigo text := null;
  v_estado           public.estado_solicitud;
  v_actividad_id     uuid := null;
  v_padre_id         uuid;
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

  select se.*, e.nombre, e.permiso_codigo, e.materializa
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

  -- ---------------------------------------------------------------------------
  -- Materialización: la firma que crea la actividad de verdad.
  --
  -- Va ANTES de marcar la etapa como aprobada: si el alta falla —código
  -- repetido, padre inexistente— la excepción revierte la transacción entera
  -- y el expediente queda como estaba, en vez de figurar aprobado sin que la
  -- actividad exista.
  -- ---------------------------------------------------------------------------
  if p_aprobar and v_etapa.materializa then
    if v_solicitud.tipo = 'crear' then
      v_padre_id := v_solicitud.actividad_principal_id;

      insert into public.actividades (codigo, nomenclatura, tipo, padre_id, estado, creado_por)
      values (
        upper(coalesce(
          nullif(trim(v_solicitud.propuesta_codigo), ''),
          -- Sin código propuesto se genera uno trazable al folio.
          'ACT-' || right(v_solicitud.folio, 4)
        )),
        trim(v_solicitud.propuesta_nomenclatura),
        coalesce(v_solicitud.propuesta_tipo, case when v_padre_id is null then 'principal' else 'directa' end),
        v_padre_id,
        'activa',
        auth.uid()
      )
      returning id into v_actividad_id;

    elsif v_solicitud.tipo = 'editar' and v_solicitud.actividad_id is not null then
      update public.actividades
      set nomenclatura = coalesce(nullif(trim(v_solicitud.propuesta_nomenclatura), ''), nomenclatura),
          codigo       = upper(coalesce(nullif(trim(v_solicitud.propuesta_codigo), ''), codigo)),
          estado       = 'activa'
      where id = v_solicitud.actividad_id
      returning id into v_actividad_id;

    elsif v_solicitud.tipo = 'eliminar' and v_solicitud.actividad_id is not null then
      -- Se ARCHIVA, no se borra. Un borrado arrastraría en cascada las
      -- subactividades y las referencias de otros expedientes; archivar es
      -- reversible y conserva el histórico.
      update public.actividades
      set estado = 'archivada'
      where id = v_solicitud.actividad_id
      returning id into v_actividad_id;
    end if;
  end if;

  update public.solicitud_etapas
  set estado        = case when p_aprobar then 'aprobada' else 'denegada' end::public.estado_etapa,
      revisor_id    = auth.uid(),
      justificacion = trim(p_justificacion),
      decidida_en   = now()
  where id = v_etapa.id;

  if p_aprobar then
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
      v_estado := 'aprobada';
    end if;
  else
    update public.solicitud_etapas
    set estado = 'omitida'
    where solicitud_id = p_solicitud_id and estado = 'bloqueada';
    v_estado := 'denegada';
  end if;

  update public.solicitudes
  set estado                = v_estado,
      actividad_id          = coalesce(v_actividad_id, actividad_id),
      resuelto_por          = case when v_estado in ('aprobada', 'denegada') then auth.uid() end,
      resuelto_en           = case when v_estado in ('aprobada', 'denegada') then now() end,
      comentario_resolucion = case when v_estado in ('aprobada', 'denegada') then trim(p_justificacion) end
  where id = p_solicitud_id;

  insert into public.solicitud_revisiones
    (solicitud_id, revisor_id, estado_anterior, estado_nuevo, comentario, etapa_codigo)
  values
    (p_solicitud_id, auth.uid(), v_solicitud.estado, v_estado, trim(p_justificacion), v_etapa.etapa_codigo);

  return query select v_etapa.etapa_codigo, v_siguiente_codigo, v_estado, v_actividad_id;
end;
$fn$;

comment on function public.fn_decidir_etapa is
  'Firma la etapa vigente, materializa el cambio si la etapa lo exige, y avanza el expediente. Todo en una transacción.';

grant execute on function public.fn_decidir_etapa to authenticated;

-- -----------------------------------------------------------------------------
-- Vista de configuración: cada etapa con los roles que la firman
--
-- El administrador razona en roles («¿quién valida lo financiero?»), no en
-- códigos de permiso. La vista traduce entre ambos para que la pantalla pueda
-- hablar su idioma sin que el modelo deje de ser por capacidad.
-- -----------------------------------------------------------------------------
create or replace view public.v_etapas_configuracion
with (security_invoker = true) as
select
  e.codigo,
  e.nombre,
  e.descripcion,
  e.orden,
  e.permiso_codigo,
  e.obligatoria,
  e.activa,
  e.materializa,
  coalesce(
    (
      select array_agg(r.nombre order by r.nombre)
      from public.rol_permisos rp
      join public.roles r on r.id = rp.rol_id
      where rp.permiso_codigo = e.permiso_codigo and r.estado = 'activo'
    ),
    '{}'::text[]
  ) as roles,
  coalesce(
    (
      select array_agg(rp.rol_id)
      from public.rol_permisos rp
      join public.roles r on r.id = rp.rol_id
      where rp.permiso_codigo = e.permiso_codigo and r.estado = 'activo'
    ),
    '{}'::uuid[]
  ) as rol_ids,
  (
    select count(*)
    from public.solicitud_etapas se
    where se.etapa_codigo = e.codigo and se.estado = 'pendiente'
  ) as expedientes_esperando
from public.etapas_flujo e;

comment on view public.v_etapas_configuracion is
  'Etapas con los roles que las firman, resueltos desde rol_permisos. Alimenta la pantalla de configuración del flujo.';

-- -----------------------------------------------------------------------------
-- La vista de seguimiento expone si la etapa materializa, para que la interfaz
-- pueda avisar de que esa firma CREA la actividad y no sólo la aprueba.
--
-- `create or replace view` sólo admite AÑADIR columnas al final, nunca
-- intercalarlas ni renombrarlas. La columna nueva va la última por eso, no por
-- gusto.
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
  r.nombre          as revisor_rol,

  e.materializa
from public.solicitud_etapas se
join public.etapas_flujo e on e.codigo = se.etapa_codigo
left join public.perfiles p on p.id = se.revisor_id
left join public.roles r on r.id = p.rol_id;
