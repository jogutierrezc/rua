-- =============================================================================
-- Rua · 07 — Importación masiva, edición en lote y borrado seguro
--
-- Todo el trabajo pesado vive aquí y no en el cliente por tres razones:
--
--   1. Atomicidad. Importar 300 filas desde el navegador son 300 peticiones que
--      pueden fallar a la mitad y dejar el árbol partido. Una función es una
--      sola transacción: entra todo o no entra nada.
--   2. Verdad. La previsualización debe consultar el estado REAL de la base
--      (¿existe ya ese código? ¿existe el padre?), no lo que el cliente cree
--      recordar de su última consulta.
--   3. Seguridad. Son SECURITY INVOKER: las políticas RLS de actividades.crear
--      y actividades.editar se evalúan igual que en un INSERT normal. Importar
--      no es un atajo para saltarse permisos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Normalización de una fila cruda del archivo.
--
-- El usuario pega lo que sea: minúsculas, espacios de sobra, comillas de Excel.
-- Todo se limpia en un solo sitio para que validación e importación coincidan
-- exactamente; si divergieran, la previsualización mentiría.
-- -----------------------------------------------------------------------------
create or replace function public.fn_normalizar_fila_importacion(p_fila jsonb)
returns jsonb
language sql
immutable
parallel safe
as $fn$
  select jsonb_build_object(
    'codigo',       upper(nullif(btrim(coalesce(p_fila ->> 'codigo', '')), '')),
    'nomenclatura', nullif(btrim(coalesce(p_fila ->> 'nomenclatura', '')), ''),
    'tipo',         lower(nullif(btrim(coalesce(p_fila ->> 'tipo', '')), '')),
    'padre_codigo', upper(nullif(btrim(coalesce(p_fila ->> 'padre_codigo', '')), '')),
    'estado',       lower(nullif(btrim(coalesce(p_fila ->> 'estado', '')), '')),
    'descripcion',  nullif(btrim(coalesce(p_fila ->> 'descripcion', '')), '')
  );
$fn$;

-- -----------------------------------------------------------------------------
-- Validación previa (no escribe nada)
--
-- Devuelve un diagnóstico por fila. La interfaz lo pinta tal cual: el usuario
-- ve qué se creará, qué se actualizará y qué está roto ANTES de confirmar.
-- -----------------------------------------------------------------------------
-- SUPERADA por la migración 12, que redefine esta función con el mínimo de 2.
create or replace function public.fn_validar_importacion(p_filas jsonb)
returns table (
  linea        int,
  codigo       text,
  nomenclatura text,
  tipo         text,
  padre_codigo text,
  estado       text,
  descripcion  text,
  accion       text,   -- 'crear' | 'actualizar' | 'error'
  severidad    text,   -- 'ok' | 'aviso' | 'error'
  mensaje      text
)
language sql
stable
security invoker
set search_path = public
as $fn$
  with crudas as (
    select
      (orden)::int                                    as linea,
      public.fn_normalizar_fila_importacion(fila)     as f
    from jsonb_array_elements(p_filas) with ordinality as t(fila, orden)
  ),
  campos as (
    select
      linea,
      f ->> 'codigo'       as codigo,
      f ->> 'nomenclatura' as nomenclatura,
      f ->> 'tipo'         as tipo,
      f ->> 'padre_codigo' as padre_codigo,
      coalesce(f ->> 'estado', 'activa') as estado,
      f ->> 'descripcion'  as descripcion
    from crudas
  ),
  -- Un código repetido DENTRO del archivo: la segunda aparición pisaría a la
  -- primera en silencio, así que se marca como error en ambas.
  duplicados as (
    select codigo
    from campos
    where codigo is not null
    group by codigo
    having count(*) > 1
  ),
  evaluadas as (
    select
      c.*,
      exists (select 1 from public.actividades a where upper(a.codigo) = c.codigo) as ya_existe,
      -- El padre puede venir de la base o de una fila anterior del propio archivo
      (
        exists (select 1 from public.actividades a where upper(a.codigo) = c.padre_codigo)
        or exists (select 1 from campos p where p.codigo = c.padre_codigo)
      ) as padre_resoluble,
      exists (select 1 from duplicados d where d.codigo = c.codigo) as duplicado
    from campos c
  )
  select
    e.linea,
    e.codigo,
    e.nomenclatura,
    e.tipo,
    e.padre_codigo,
    e.estado,
    e.descripcion,
    case
      when v.mensaje is not null then 'error'
      when e.ya_existe            then 'actualizar'
      else 'crear'
    end as accion,
    case
      when v.mensaje is not null then 'error'
      when e.ya_existe            then 'aviso'
      else 'ok'
    end as severidad,
    coalesce(
      v.mensaje,
      case when e.ya_existe
        then 'Ya existe: se actualizará la nomenclatura, el estado y la descripción.'
      end
    ) as mensaje
  from evaluadas e
  -- Primer error que aplique, por orden de gravedad. Mostrar sólo uno evita
  -- una columna de mensajes ilegible; al corregirlo aparece el siguiente.
  left join lateral (
    select msg as mensaje
    from (
      select 1 as prio, 'Falta el código.' as msg
        where e.codigo is null
      union all
      select 2, 'Código inválido: sólo mayúsculas, números y guiones, de 3 a 32 caracteres.'
        where e.codigo is not null and e.codigo !~ '^[A-Z0-9-]{3,32}$'
      union all
      select 3, 'Código repetido dentro del archivo.'
        where e.duplicado
      union all
      select 4, 'Falta la nomenclatura (mínimo 3 caracteres).'
        where e.nomenclatura is null or length(e.nomenclatura) < 3
      union all
      select 5, 'Tipo inválido: usa principal, directa o apoyo.'
        where e.tipo is null or e.tipo not in ('principal', 'directa', 'apoyo')
      union all
      select 6, 'Estado inválido: usa borrador, activa, revision o archivada.'
        where e.estado not in ('borrador', 'activa', 'revision', 'archivada')
      union all
      select 7, 'Una actividad principal no puede tener padre.'
        where e.tipo = 'principal' and e.padre_codigo is not null
      union all
      select 8, 'Las actividades directas y de apoyo necesitan un código de padre.'
        where e.tipo in ('directa', 'apoyo') and e.padre_codigo is null
      union all
      select 9, 'El padre "' || coalesce(e.padre_codigo, '') || '" no existe ni en el sistema ni en este archivo.'
        where e.padre_codigo is not null and not e.padre_resoluble
      union all
      select 10, 'Una actividad no puede ser su propio padre.'
        where e.padre_codigo is not null and e.padre_codigo = e.codigo
    ) errores
    order by prio
    limit 1
  ) v on true
  order by e.linea;
$fn$;

comment on function public.fn_validar_importacion is
  'Diagnóstico fila a fila de una importación, sin escribir. Alimenta la previsualización.';

-- -----------------------------------------------------------------------------
-- Importación
--
-- Se resuelve en pasadas: en cada vuelta se procesan las filas cuyo padre ya
-- existe en la base. Así un archivo puede traer padres e hijos en cualquier
-- orden, a cualquier profundidad, sin exigirle al usuario que los ordene.
-- -----------------------------------------------------------------------------
create or replace function public.fn_importar_actividades(
  p_filas jsonb,
  p_modo  text default 'mezclar'   -- 'mezclar' | 'solo_crear' | 'solo_actualizar'
)
returns table (creadas int, actualizadas int, omitidas int)
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_creadas      int := 0;
  v_actualizadas int := 0;
  v_omitidas     int := 0;
  v_avance       int;
  v_pasadas      int := 0;
  v_fila         record;
  v_padre_id     uuid;
  v_existente    uuid;
begin
  if p_modo not in ('mezclar', 'solo_crear', 'solo_actualizar') then
    raise exception 'Modo de importación desconocido: %', p_modo
      using errcode = 'invalid_parameter_value';
  end if;

  -- Se aborta ante el primer error de validación: importar "lo que se pueda"
  -- deja un árbol a medias que nadie sabe cómo quedó.
  if exists (select 1 from public.fn_validar_importacion(p_filas) where severidad = 'error') then
    raise exception 'La importación tiene filas con errores. Corrígelas antes de aplicar.'
      using errcode = 'check_violation';
  end if;

  create temporary table _importacion on commit drop as
  select
    linea,
    codigo,
    nomenclatura,
    tipo::public.tipo_actividad     as tipo,
    padre_codigo,
    estado::public.estado_actividad as estado,
    descripcion,
    false as procesada
  from public.fn_validar_importacion(p_filas);

  loop
    v_avance  := 0;
    v_pasadas := v_pasadas + 1;

    -- Cinturón de seguridad: la validación ya descarta ciclos y padres
    -- inexistentes, pero un bucle infinito en producción es inaceptable.
    if v_pasadas > 32 then
      raise exception 'No se pudo resolver la jerarquía de la importación (¿referencias circulares?)'
        using errcode = 'check_violation';
    end if;

    for v_fila in
      select * from _importacion i
      where not i.procesada
        and (
          i.padre_codigo is null
          or exists (select 1 from public.actividades a where upper(a.codigo) = i.padre_codigo)
        )
      order by i.linea
    loop
      select id into v_padre_id
      from public.actividades
      where upper(codigo) = v_fila.padre_codigo;

      select id into v_existente
      from public.actividades
      where upper(codigo) = v_fila.codigo;

      if v_existente is not null then
        if p_modo = 'solo_crear' then
          v_omitidas := v_omitidas + 1;
        else
          update public.actividades
          set nomenclatura = v_fila.nomenclatura,
              descripcion  = coalesce(v_fila.descripcion, descripcion),
              estado       = v_fila.estado,
              tipo         = v_fila.tipo,
              padre_id     = v_padre_id
          where id = v_existente;
          v_actualizadas := v_actualizadas + 1;
        end if;
      else
        if p_modo = 'solo_actualizar' then
          v_omitidas := v_omitidas + 1;
        else
          insert into public.actividades (codigo, nomenclatura, descripcion, tipo, padre_id, estado, creado_por)
          values (
            v_fila.codigo,
            v_fila.nomenclatura,
            v_fila.descripcion,
            v_fila.tipo,
            v_padre_id,
            v_fila.estado,
            auth.uid()
          );
          v_creadas := v_creadas + 1;
        end if;
      end if;

      update _importacion set procesada = true where linea = v_fila.linea;
      v_avance := v_avance + 1;
    end loop;

    exit when v_avance = 0;
  end loop;

  if exists (select 1 from _importacion where not procesada) then
    raise exception 'Quedaron filas sin procesar: su jerarquía no se pudo resolver.'
      using errcode = 'check_violation';
  end if;

  return query select v_creadas, v_actualizadas, v_omitidas;
end;
$fn$;

comment on function public.fn_importar_actividades is
  'Importa actividades en una sola transacción, resolviendo padres por código en pasadas sucesivas.';

-- -----------------------------------------------------------------------------
-- Previsualización del borrado
--
-- El FK es ON DELETE CASCADE: borrar una rama se lleva por delante todo lo que
-- cuelga de ella. Antes de confirmar hay que poder decir exactamente qué.
-- -----------------------------------------------------------------------------
create or replace function public.fn_previsualizar_eliminacion(p_ids uuid[])
returns table (
  id            uuid,
  codigo        text,
  nomenclatura  text,
  tipo          public.tipo_actividad,
  nivel         smallint,
  seleccionada  boolean,
  solicitudes   bigint
)
language sql
stable
security invoker
set search_path = public
as $fn$
  with recursive afectadas as (
    select a.id, a.codigo, a.nomenclatura, a.tipo, a.nivel, true as seleccionada
    from public.actividades a
    where a.id = any(p_ids)

    union

    select h.id, h.codigo, h.nomenclatura, h.tipo, h.nivel, false
    from public.actividades h
    join afectadas an on an.id = h.padre_id
  )
  select
    af.id,
    af.codigo,
    af.nomenclatura,
    af.tipo,
    af.nivel,
    bool_or(af.seleccionada) as seleccionada,
    (
      select count(*)
      from public.solicitudes s
      where s.actividad_id = af.id
    ) as solicitudes
  from afectadas af
  group by af.id, af.codigo, af.nomenclatura, af.tipo, af.nivel
  order by af.nivel, af.codigo;
$fn$;

comment on function public.fn_previsualizar_eliminacion is
  'Lista todo lo que desaparecería al borrar las actividades dadas, incluidos los descendientes en cascada.';

-- -----------------------------------------------------------------------------
-- Cambio de estado en lote
--
-- Archivar es la operación reversible; borrar no lo es. Se ofrece como primera
-- opción en la interfaz precisamente por eso.
-- -----------------------------------------------------------------------------
create or replace function public.fn_cambiar_estado_actividades(
  p_ids    uuid[],
  p_estado public.estado_actividad,
  p_incluir_descendientes boolean default false
)
returns int
language sql
security invoker
set search_path = public
as $fn$
  with recursive objetivo as (
    select a.id from public.actividades a where a.id = any(p_ids)
    union
    select h.id
    from public.actividades h
    join objetivo o on o.id = h.padre_id
    where p_incluir_descendientes
  ),
  actualizadas as (
    update public.actividades
    set estado = p_estado
    where id in (select id from objetivo)
    returning 1
  )
  select count(*)::int from actualizadas;
$fn$;

grant execute on function
  public.fn_normalizar_fila_importacion,
  public.fn_validar_importacion,
  public.fn_importar_actividades,
  public.fn_previsualizar_eliminacion,
  public.fn_cambiar_estado_actividades
to authenticated;
