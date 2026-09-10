-- =============================================================================
-- Rua · 29 — La sugerencia deja de costar más que la validación entera
--
-- Síntoma: «canceling statement due to statement timeout» al importar, incluso
-- con la hoja troceada y con la resolución de países ya indexada.
--
-- La culpa era del «¿querías decir…?».
--
-- Cuando un valor no se reconoce, la previsualización ofrece el más parecido. Y
-- así estaba escrito el buscador de parecidos:
--
--   where similarity(fn_normalizar(p.nombre), fn_normalizar(p_texto)) > 0.4
--   order by similarity(fn_normalizar(p.nombre), fn_normalizar(p_texto)) desc
--
-- Léelo contando operaciones. No hay índice que ayude, así que recorre los
-- doscientos países; a cada uno le quita las tildes y lo pasa a minúsculas DOS
-- veces —una en el `where` y otra en el `order by`—, y otras dos veces hace lo
-- mismo con el texto buscado. Son unas ochocientas normalizaciones para
-- responder UNA pregunta. Y la pregunta se hace UNA VEZ POR FILA.
--
-- Con doscientas cincuenta filas son doscientas mil normalizaciones por lote, y
-- eso ya no cabe en los segundos que PostgREST le da a una consulta. Lo peor es
-- que el coste dependía de cuántos valores NO se reconocieran: la carga iba bien
-- hasta que llegó una hoja cuyo vocabulario era ajeno —la de empleadores, con su
-- columna «Industry»— y entonces se disparó en todas las filas a la vez.
--
-- El arreglo es el que pedía a gritos: un índice trigram. Lo normalizado se
-- calcula UNA vez, al indexar, y la búsqueda de parecidos pasa de recorrer la
-- tabla a mirar el índice. De ochocientas operaciones por fila a un puñado.
--
-- pg_trgm ya estaba instalado y ya se usaba así en `perfiles` y en la propia
-- libreta de contactos. Sólo faltaba en los dos catálogos que se consultan al
-- importar, que son justo los que se consultan miles de veces seguidas.
-- =============================================================================

do $guardia$ begin
  if to_regclass('public.contactos_internacionales') is null then
    raise exception
      'Antes de ésta hay que aplicar las migraciones 24 a 28 del módulo de Internacionalización.';
  end if;
end $guardia$;

-- -----------------------------------------------------------------------------
-- No ejecutar fuera de orden
--
-- Reaplicar una migración anterior a la última NO es inocuo: `create or replace`
-- devuelve las funciones a su versión vieja, y Postgres se planta a mitad del
-- archivo dejando el trabajo hecho a medias.
-- -----------------------------------------------------------------------------
do $orden$
declare
  v_posterior text;
begin
  v_posterior := case
    when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'fn_asegurar_catalogo')
      then '30 · catalogo_que_aprende'
  end;

  if v_posterior is not null then
    raise exception
      'No ejecutes ésta: ya está aplicada la migración %, que es posterior. Reaplicar una anterior revertiría sus cambios. Si algo no funciona, ejecuta supabase/diagnostico-internacionalizacion.sql para ver qué falta de verdad.',
      v_posterior;
  end if;
end $orden$;

-- -----------------------------------------------------------------------------
-- Los índices que faltaban
--
-- Sobre la expresión YA normalizada, no sobre la columna: es lo que se compara,
-- y un índice sobre el texto crudo no serviría para buscar «mexico» y encontrar
-- «México».
-- -----------------------------------------------------------------------------
create index if not exists paises_nombre_trgm_idx on public.paises
  using gin (public.fn_normalizar(nombre) gin_trgm_ops);

create index if not exists catalogo_etiqueta_trgm_idx on public.contacto_catalogo
  using gin (public.fn_normalizar(etiqueta) gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Los buscadores de parecidos, apoyados en el índice
--
-- El operador `%` es lo que cambia todo: significa «se parece» según el umbral
-- de pg_trgm, y a diferencia de `similarity(...) > 0.4` SÍ puede usar el índice.
-- El `order by` sigue calculando la similitud para quedarse con el mejor, pero
-- ya sólo sobre el puñado de candidatos que el índice dejó pasar, no sobre la
-- tabla entera.
-- -----------------------------------------------------------------------------
create or replace function public.fn_pais_sugerencia(p_texto text)
returns text
language sql
stable
-- `similarity` y `%` los trae pg_trgm, que según la instalación vive en `public`
-- o en `extensions`. Se nombran las dos: un search_path que se queda corto sólo
-- falla en el servidor donde la extensión está en el otro sitio.
set search_path = public, extensions
as $fn$
  select p.nombre
  from public.paises p
  where p.activo
    and public.fn_normalizar(coalesce(p_texto, '')) <> ''
    and public.fn_normalizar(p.nombre) % public.fn_normalizar(coalesce(p_texto, ''))
  order by similarity(
    public.fn_normalizar(p.nombre),
    public.fn_normalizar(coalesce(p_texto, ''))
  ) desc
  limit 1;
$fn$;

comment on function public.fn_pais_sugerencia(text) is
  'El país que más se parece al texto dado, buscado por índice trigram. Devuelve nulo si nada se le parece lo bastante.';

create or replace function public.fn_catalogo_sugerencia(
  p_tipo  public.tipo_catalogo_contacto,
  p_texto text
)
returns text
language sql
stable
set search_path = public, extensions
as $fn$
  select c.etiqueta
  from public.contacto_catalogo c
  where c.tipo = p_tipo
    and c.activo
    and public.fn_normalizar(coalesce(p_texto, '')) <> ''
    and public.fn_normalizar(c.etiqueta) % public.fn_normalizar(coalesce(p_texto, ''))
  order by similarity(
    public.fn_normalizar(c.etiqueta),
    public.fn_normalizar(coalesce(p_texto, ''))
  ) desc
  limit 1;
$fn$;

comment on function public.fn_catalogo_sugerencia(public.tipo_catalogo_contacto, text) is
  'El valor del catálogo que más se parece al texto dado, buscado por índice trigram.';

grant execute on function public.fn_pais_sugerencia(text) to authenticated;
grant execute on function public.fn_catalogo_sugerencia(public.tipo_catalogo_contacto, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Que el planificador se entere
--
-- Los índices de expresión guardan estadísticas propias, y sin ellas el
-- planificador se los salta durante un rato aunque existan. Con tablas de
-- doscientas filas el análisis es instantáneo, y evita que la primera carga
-- después de la migración siga yendo lenta sin motivo aparente.
-- -----------------------------------------------------------------------------
analyze public.paises;
analyze public.contacto_catalogo;
