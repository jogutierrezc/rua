-- =============================================================================
-- Rua · 26 — La importación deja de agotar el reloj
--
-- Síntoma: «canceling statement due to statement timeout» al importar.
--
-- PostgREST corta cualquier consulta que pase de unos segundos, y con razón: es
-- lo que impide que una llamada mal hecha bloquee la base para todos. Así que el
-- arreglo no es pedir más tiempo, es no necesitarlo.
--
-- Había dos culpables, y el segundo se arregla en el cliente:
--
-- 1 · La resolución del país. `fn_pais_codigo` recorría la tabla entera de
--     doscientos países aplicando `fn_normalizar` a cada nombre y a cada alias
--     —quitar tildes, pasar a minúsculas— UNA VEZ POR CADA FILA de la hoja. Con
--     mil contactos son doscientas mil normalizaciones para responder mil
--     preguntas. El `or` de la condición impedía además usar el índice que ya
--     existía. Se resuelve normalizando una sola vez, al sembrar: una tabla de
--     búsqueda donde cada forma de escribir un país es una clave primaria.
--
-- 2 · El tamaño del lote. Aunque cada fila sea barata, cuarenta mil no caben en
--     una llamada. La hoja se trocea en el cliente, que además puede así pintar
--     el avance en vez de dejar un reloj de arena de dos minutos.
--
-- Para lo segundo, la validación necesita saber por qué fila va cada trozo: sin
-- eso, el aviso de «este correo ya aparece en la fila 3» señalaría la fila 3 del
-- TROZO, que en la hoja es la 403. De ahí el parámetro nuevo.
-- =============================================================================

do $guardia$ begin
  if to_regclass('public.contactos_internacionales') is null then
    raise exception
      'Antes de ésta hay que aplicar las migraciones 20260901002400_internacionalizacion.sql y 20260901002500_plantillas_nominacion.sql.';
  end if;
end $guardia$;

-- -----------------------------------------------------------------------------
-- No ejecutar fuera de orden
--
-- Reaplicar una migración anterior a la última NO es inocuo: `create or replace`
-- devuelve las funciones a su versión vieja, y en cuanto una de ellas cambió de
-- argumentos o de columnas de salida, Postgres se planta a mitad del archivo
-- —«function name is not unique», «cannot change return type»— dejando el
-- trabajo hecho a medias.
--
-- Los errores que da por su cuenta son ciertos pero no dicen lo único que hace
-- falta saber: que el problema no es el archivo, es el ORDEN. Se comprueba aquí,
-- antes de tocar nada, para poder decirlo con palabras.
-- -----------------------------------------------------------------------------
do $orden$
declare
  v_posterior text;
begin
  v_posterior := case
    when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'fn_asegurar_catalogo')
      then '30 · catalogo_que_aprende'
    when exists (select 1 from pg_indexes
                 where schemaname = 'public' and indexname = 'paises_nombre_trgm_idx')
      then '29 · sugerencias_indexadas'
    when exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'contactos_internacionales'
                   and column_name = 'riesgo')
      then '28 · email_reputation'
    when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'fn_validar_importacion_contactos'
                   and 'sector_ok' = any (p.proargnames))
      then '27 · listas_que_coexisten'
  end;

  if v_posterior is not null then
    raise exception
      'No ejecutes ésta: ya está aplicada la migración %, que es posterior. Reaplicar una anterior revertiría sus cambios. Si algo no funciona, ejecuta supabase/diagnostico-internacionalizacion.sql para ver qué falta de verdad.',
      v_posterior;
  end if;
end $orden$;

-- -----------------------------------------------------------------------------
-- Tabla de búsqueda de países
--
-- Una fila por cada forma admitida de escribir un país: su nombre, su código y
-- cada uno de sus alias, ya normalizados. Es un índice materializado a mano, y
-- se justifica porque la alternativa —normalizar en cada consulta— es
-- exactamente lo que hacía que la importación no terminara.
--
-- Se deriva de `paises` y no se edita: cualquier cambio en el catálogo la
-- reconstruye sola.
-- -----------------------------------------------------------------------------
create table if not exists public.paises_busqueda (
  clave  text primary key,
  codigo text not null references public.paises (codigo) on delete cascade
);

comment on table public.paises_busqueda is
  'Cada forma de escribir un país —nombre, código o alias—, ya normalizada. Derivada de `paises`: la reconstruye un trigger.';

create index if not exists paises_busqueda_codigo_idx on public.paises_busqueda (codigo);

create or replace function public.fn_reconstruir_paises_busqueda()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from public.paises_busqueda;

  insert into public.paises_busqueda (clave, codigo)
  select t.clave, min(t.codigo)
  from (
    select public.fn_normalizar(p.nombre) as clave, p.codigo from public.paises p
    union all
    select lower(p.codigo), p.codigo from public.paises p
    union all
    select public.fn_normalizar(a), p.codigo
    from public.paises p, unnest(p.alias) as a
    where btrim(a) <> ''
  ) t
  where t.clave is not null and t.clave <> ''
  -- Un alias compartido por dos países sería ambiguo: gana el menor por código
  -- y se deja de adivinar. Es preferible a que la misma palabra resuelva a un
  -- país distinto según el orden en que se leyó la tabla.
  group by t.clave;
end;
$fn$;

-- El catálogo de países no lo edita la interfaz, pero sí lo pueden tocar futuras
-- migraciones. El trigger evita que la tabla derivada se quede vieja en silencio.
create or replace function public.fn_paises_reconstruir()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.fn_reconstruir_paises_busqueda();
  return null;
end;
$fn$;

drop trigger if exists trg_paises_reconstruir on public.paises;
create trigger trg_paises_reconstruir
  after insert or update or delete on public.paises
  for each statement execute function public.fn_paises_reconstruir();

select public.fn_reconstruir_paises_busqueda();

alter table public.paises_busqueda enable row level security;

drop policy if exists "paises_busqueda_lectura" on public.paises_busqueda;
create policy "paises_busqueda_lectura" on public.paises_busqueda
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- La resolución, ahora en una búsqueda por clave primaria
-- -----------------------------------------------------------------------------
create or replace function public.fn_pais_codigo(p_texto text)
returns text
language sql
stable
set search_path = public, extensions
as $fn$
  select b.codigo
  from public.paises_busqueda b
  where b.clave = public.fn_normalizar(coalesce(p_texto, ''))
  limit 1;
$fn$;

comment on function public.fn_pais_codigo(text) is
  'Resuelve un país por su nombre, su código ISO o cualquiera de sus alias, en una búsqueda por clave.';

-- -----------------------------------------------------------------------------
-- Rol y sector: las dos búsquedas, separadas
--
-- El `or` que las unía obligaba a recorrer el catálogo entero. Separadas, cada
-- una usa su índice: la primera el de (tipo, etiqueta normalizada), la segunda
-- el de (tipo, código).
-- -----------------------------------------------------------------------------
create or replace function public.fn_catalogo_id(
  p_tipo  public.tipo_catalogo_contacto,
  p_texto text
)
returns uuid
language sql
stable
set search_path = public, extensions
as $fn$
  select coalesce(
    (select c.id from public.contacto_catalogo c
      where c.tipo = p_tipo
        and c.activo
        and public.fn_normalizar(c.etiqueta) = public.fn_normalizar(coalesce(p_texto, ''))
      limit 1),
    (select c.id from public.contacto_catalogo c
      where c.tipo = p_tipo
        and c.activo
        and c.codigo = lower(btrim(coalesce(p_texto, '')))
      limit 1)
  );
$fn$;

grant execute on function public.fn_pais_codigo(text) to authenticated;
grant execute on function public.fn_catalogo_id(public.tipo_catalogo_contacto, text) to authenticated;

-- =============================================================================
-- La validación aprende por qué fila va
--
-- El cliente trocea la hoja y llama varias veces. Sin decirle desde qué fila va
-- cada trozo, los números que devuelve son los del trozo y no los de la hoja: el
-- usuario iría a corregir la fila 3 y encontraría un contacto correcto.
-- =============================================================================
-- Se tiran TODAS las versiones anteriores, no sólo la inmediata.
--
-- Cada migración le añadió un parámetro a esta función, y `create or replace` no
-- sustituye una firma por otra: crea una función NUEVA y deja viva la vieja. Con
-- dos versiones conviviendo, un `grant` o una llamada sin lista de argumentos se
-- vuelve ambigua y Postgres se planta —«function name is not unique»—. Nombrar
-- aquí las firmas viejas es lo que hace que volver a aplicar una migración
-- anterior por equivocación no deje la base a medias.
drop function if exists public.fn_validar_importacion_contactos(jsonb);
drop function if exists public.fn_validar_importacion_contactos(jsonb, text);
drop function if exists public.fn_importar_contactos(jsonb, text);

create or replace function public.fn_validar_importacion_contactos(
  p_filas jsonb,
  p_tipo  text default 'general',   -- 'general' | 'academico' | 'empleador'
  p_desde int default 0             -- cuántas filas van ya validadas antes de ésta
)
returns table (
  linea     int,
  nombre    text,
  cargo     text,
  correo    text,
  pais      text,
  rol       text,
  sector    text,
  accion    text,   -- 'crear' | 'actualizar' | 'error'
  severidad text,   -- 'ok' | 'aviso' | 'error'
  mensaje   text
)
language sql
stable
security invoker
set search_path = public, extensions
as $fn$
  with crudas as (
    select (orden + p_desde)::int as linea, public.fn_normalizar_fila_contacto(fila) as f
    from jsonb_array_elements(p_filas) with ordinality as t(fila, orden)
  ),
  base as (
    select
      c.linea,
      c.f ->> 'nombre_completo' as nombre_crudo,
      c.f ->> 'cargo'           as cargo_crudo,
      c.f ->> 'correo'          as correo,
      c.f ->> 'pais'            as pais_texto,
      c.f ->> 'rol'             as rol_texto,
      c.f ->> 'sector'          as sector_texto,
      public.fn_capitalizar(c.f ->> 'nombre_completo') as nombre,
      public.fn_capitalizar(c.f ->> 'cargo')           as cargo,
      public.fn_problema_nombre(c.f ->> 'nombre_completo') as p_nombre,
      public.fn_problema_cargo(c.f ->> 'cargo')            as p_cargo,
      public.fn_problema_correo(c.f ->> 'correo')          as p_correo,
      public.fn_pais_codigo(c.f ->> 'pais')                as pais_codigo,
      public.fn_catalogo_id('rol', c.f ->> 'rol')          as rol_id,
      -- La plantilla académica no tiene columna de sector porque no le hace
      -- falta: todo el que está en ella trabaja en educación superior. Se
      -- clasifica solo, y la previsualización lo dice para que no parezca magia.
      case
        when p_tipo = 'academico' and c.f ->> 'sector' is null then (
          select cc.id from public.contacto_catalogo cc
          where cc.tipo = 'sector' and cc.codigo = 'educacion_superior' and cc.activo
        )
        else public.fn_catalogo_id('sector', c.f ->> 'sector')
      end as sector_id
    from crudas c
  ),
  evaluadas as (
    select
      b.*,
      -- Los repetidos DENTRO del trozo. Los que se repiten de un trozo a otro
      -- los caza el cliente, que es el único que ve la hoja entera.
      min(b.linea) filter (where b.correo is not null)
        over (partition by lower(b.correo)) as primera_linea,
      (select ci.id from public.contactos_internacionales ci
        where lower(ci.correo) = lower(b.correo)) as existente
    from base b
  ),
  diagnostico as (
    select
      e.*,
      coalesce(
        e.p_nombre,
        e.p_cargo,
        e.p_correo,
        -- País, rol y sector se COMPRUEBAN, pero no se exigen. Es la diferencia
        -- entre «está mal escrito» y «no viene»: lo primero hay que corregirlo
        -- antes de guardar nada, lo segundo es una clasificación pendiente que
        -- se completa después.
        case
          when e.pais_texto is not null and e.pais_codigo is null then
            'País no reconocido: «' || e.pais_texto || '».' ||
            coalesce(' ¿Querías decir «' || public.fn_pais_sugerencia(e.pais_texto) || '»?', '')
        end,
        case
          when e.rol_texto is not null and e.rol_id is null then
            'Rol no reconocido: «' || e.rol_texto || '».' ||
            coalesce(
              ' ¿Querías decir «' || public.fn_catalogo_sugerencia('rol', e.rol_texto) || '»?',
              ' Si es un rol nuevo, añádelo antes en el catálogo.')
        end,
        case
          when e.sector_texto is not null and e.sector_id is null then
            'Sector no reconocido: «' || e.sector_texto || '».' ||
            coalesce(
              ' ¿Querías decir «' || public.fn_catalogo_sugerencia('sector', e.sector_texto) || '»?',
              ' Si es un sector nuevo, añádelo antes en el catálogo.')
        end,
        case
          when e.primera_linea is not null and e.linea > e.primera_linea then
            'Este correo ya aparece en la fila ' || e.primera_linea || ' de esta misma hoja.'
        end
      ) as problema,

      nullif(concat_ws(' ',
        case
          when p_tipo = 'academico' and e.sector_texto is null and e.sector_id is not null then
            'Se clasificará en «Educación superior» por venir de la plantilla académica.'
        end,
        case
          when e.pais_codigo is null or e.rol_id is null or e.sector_id is null then
            'Se importará sin ' || concat_ws(', ',
              case when e.pais_codigo is null then 'país' end,
              case when e.rol_id is null then 'rol' end,
              case when e.sector_id is null then 'sector' end
            ) || ': podrás clasificarlo después desde la ficha.'
        end,
        case when e.nombre is distinct from e.nombre_crudo then
          'Se corregirá la escritura del nombre a «' || e.nombre || '».' end,
        case when e.cargo is distinct from e.cargo_crudo then
          'Se corregirá la escritura del cargo a «' || e.cargo || '».' end,
        case when e.correo ~* '^(info|contacto|contact|admin|administracion|ventas|sales|soporte|support|hola|hello|office|secretaria|secretary|internacional|international|rrii)@' then
          'Es un buzón genérico: llega a una oficina, no a una persona.' end
      ), '') as aviso
    from evaluadas e
  )
  select
    d.linea,
    coalesce(d.nombre, d.nombre_crudo),
    coalesce(d.cargo, d.cargo_crudo),
    d.correo,
    coalesce((select p.nombre from public.paises p where p.codigo = d.pais_codigo), d.pais_texto),
    coalesce((select c.etiqueta from public.contacto_catalogo c where c.id = d.rol_id), d.rol_texto),
    coalesce((select c.etiqueta from public.contacto_catalogo c where c.id = d.sector_id), d.sector_texto),
    case
      when d.problema is not null then 'error'
      when d.existente is not null then 'actualizar'
      else 'crear'
    end,
    case
      when d.problema is not null then 'error'
      when d.aviso is not null then 'aviso'
      else 'ok'
    end,
    coalesce(
      d.problema,
      nullif(concat_ws(' ',
        case when d.existente is not null then 'Se actualizará el contacto existente.' end,
        d.aviso
      ), ''),
      'Se creará.'
    )
  from diagnostico d
  order by d.linea;
$fn$;

comment on function public.fn_validar_importacion_contactos(jsonb, text, int) is
  'Previsualiza un trozo de la carga. `p_desde` dice cuántas filas van antes, para que los números de fila sean los de la hoja y no los del trozo.';

grant execute on function public.fn_validar_importacion_contactos(jsonb, text, int) to authenticated;

-- -----------------------------------------------------------------------------
-- Si aun así se agotara el tiempo
--
-- Con las búsquedas por clave y la hoja troceada no debería volver a pasar. Si
-- pasara —una hoja enorme, un servidor cargado—, lo que hay que subir es el
-- tamaño del trozo en el cliente, NO el tiempo límite de la base:
--
--   alter role authenticated set statement_timeout = '30s';
--
-- Esa línea afecta a TODAS las consultas del portal, no sólo a la importación, y
-- lo que consigue es que una consulta lenta tarde treinta segundos en fallar en
-- vez de ocho. Queda escrita aquí para que se sepa que existe y por qué no está
-- aplicada.
-- -----------------------------------------------------------------------------
