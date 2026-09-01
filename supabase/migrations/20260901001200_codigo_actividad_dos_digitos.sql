-- =============================================================================
-- Rua · 12 — Códigos de actividad de dos caracteres
--
-- El mínimo era de 3 caracteres, elegido sin más razón que «parecía razonable».
-- La institución usa códigos cortos —A1, 10, B2— para las ramas de primer
-- nivel, así que el mínimo baja a 2.
--
-- No afecta a la integridad: lo que garantiza que no haya colisiones es el
-- índice único sobre `upper(codigo)`, no la longitud.
-- =============================================================================

alter table public.actividades
  drop constraint if exists actividades_codigo_formato;

alter table public.actividades
  add constraint actividades_codigo_formato
  check (codigo ~ '^[A-Z0-9-]{2,32}$');

comment on constraint actividades_codigo_formato on public.actividades is
  'Mayúsculas, números y guiones, de 2 a 32 caracteres. La unicidad la impone el índice, no esta longitud.';

-- -----------------------------------------------------------------------------
-- El validador de importación repetía el patrón por su cuenta. Se actualiza
-- aquí para que la previsualización y el CHECK digan lo mismo: si divergieran,
-- una fila podría pasar la previsualización y reventar al aplicar.
-- -----------------------------------------------------------------------------
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
      select 2, 'Código inválido: sólo mayúsculas, números y guiones, de 2 a 32 caracteres.'
        where e.codigo is not null and e.codigo !~ '^[A-Z0-9-]{2,32}$'
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
  'Diagnóstico fila a fila de una importación, sin escribir. Su regla de código debe coincidir siempre con el CHECK de actividades.';
