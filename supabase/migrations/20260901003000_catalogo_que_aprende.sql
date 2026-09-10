-- =============================================================================
-- Rua · 30 — El catálogo aprende de las listas
--
-- Hasta aquí, el vocabulario iba en la dirección equivocada: el catálogo mandaba
-- y las listas tenían que amoldarse. Pero el vocabulario de una plantilla de
-- nominación lo pone quien la escribe —«Banking», «Manufacturing», «Higher
-- Education»—, y pedirle a la oficina que lo traduzca antes de cargar es pedirle
-- que haga a mano lo que la base puede hacer sola.
--
-- A partir de ahora, al importar, cada rol y cada sector pasa por tres puertas,
-- en este orden:
--
--   1 · ¿Existe ya? Se compara normalizado —sin tildes, sin mayúsculas, sin
--       espacios de más—, así que «Educación Superior», «educacion superior» y
--       «EDUCACIÓN SUPERIOR» son el mismo sector y no tres.
--
--   2 · ¿Se parece muchísimo a uno que existe? Entonces es ése. Es lo que impide
--       que una errata funde un valor nuevo: «Bankng» no estrena sector, se
--       entiende como «Banking». El umbral es alto a propósito —0.8 de
--       similitud— porque el error de fundir dos valores distintos es peor que
--       el de crear uno de más: lo segundo se corrige borrando, lo primero exige
--       darse cuenta primero.
--
--   3 · ¿No se parece a nada? Se crea, con el texto EXACTO que trae la hoja.
--       «Banking» entra como «Banking», no como «banca»: es el vocabulario de
--       quien nomina, y traducirlo haría que la próxima carga no lo reconociera.
--
-- Nada de esto ocurre a escondidas: la previsualización dice, valor por valor,
-- cuál se entiende como otro y cuál se va a crear, y sigue sin escribirse nada
-- hasta que alguien confirma. Es la misma promesa de siempre, aplicada a una
-- cosa más.
--
-- El país recibe el mismo trato en la puerta 2 —una errata cercana se resuelve
-- sola— pero NO la 3: la lista de países del mundo no es una decisión de la
-- Universidad, y un país que no existe es un dato malo, no un valor nuevo.
-- =============================================================================

do $guardia$ begin
  if to_regclass('public.contactos_internacionales') is null then
    raise exception
      'Antes de ésta hay que aplicar las migraciones 24 a 29 del módulo de Internacionalización.';
  end if;
  if not exists (select 1 from pg_indexes
                 where schemaname = 'public' and indexname = 'paises_nombre_trgm_idx') then
    raise exception
      'Falta la migración 20260901002900_sugerencias_indexadas.sql: sin sus índices, la búsqueda de parecidos que usa ésta no termina a tiempo.';
  end if;
end $guardia$;

-- -----------------------------------------------------------------------------
-- El código estable a partir de la etiqueta
--
-- El mismo derivado que usa la pantalla del catálogo, ahora también en la base.
-- Se separan porque la etiqueta se puede renombrar —«ONG» a «Tercer sector»— sin
-- perder a qué apuntaban los contactos que ya la tenían.
-- -----------------------------------------------------------------------------
create or replace function public.fn_codigo_catalogo(p_texto text)
returns text
language sql
immutable
set search_path = public, extensions
as $fn$
  select left(
    regexp_replace(
      regexp_replace(public.fn_normalizar(coalesce(p_texto, '')), '[^a-z0-9]+', '_', 'g'),
      '^_+|_+$', '', 'g'
    ),
    40
  );
$fn$;

-- -----------------------------------------------------------------------------
-- Puertas 1 y 2: el que ya existe, o el que se le parece muchísimo
-- -----------------------------------------------------------------------------
create or replace function public.fn_catalogo_equivalente(
  p_tipo  public.tipo_catalogo_contacto,
  p_texto text
)
returns uuid
language sql
stable
set search_path = public, extensions
as $fn$
  select coalesce(
    -- Puerta 1: coincidencia exacta una vez normalizado.
    public.fn_catalogo_id(p_tipo, p_texto),
    -- Puerta 2: el más parecido, si se parece lo bastante. `%` usa el índice
    -- trigram; sin él esto recorrería el catálogo entero por cada fila.
    (select c.id
     from public.contacto_catalogo c
     where c.tipo = p_tipo
       and c.activo
       and public.fn_normalizar(coalesce(p_texto, '')) <> ''
       and public.fn_normalizar(c.etiqueta) % public.fn_normalizar(coalesce(p_texto, ''))
       and similarity(
             public.fn_normalizar(c.etiqueta),
             public.fn_normalizar(coalesce(p_texto, ''))
           ) >= 0.8
     order by similarity(
       public.fn_normalizar(c.etiqueta),
       public.fn_normalizar(coalesce(p_texto, ''))
     ) desc
     limit 1)
  );
$fn$;

comment on function public.fn_catalogo_equivalente(public.tipo_catalogo_contacto, text) is
  'El valor del catálogo que corresponde a un texto: el mismo ya normalizado, o uno casi idéntico. Nulo si no hay ninguno.';

-- El mismo criterio para el país, sin la puerta de crear: la lista de países
-- del mundo no la decide la Universidad.
create or replace function public.fn_pais_equivalente(p_texto text)
returns text
language sql
stable
set search_path = public, extensions
as $fn$
  select coalesce(
    public.fn_pais_codigo(p_texto),
    (select p.codigo
     from public.paises p
     where p.activo
       and public.fn_normalizar(coalesce(p_texto, '')) <> ''
       and public.fn_normalizar(p.nombre) % public.fn_normalizar(coalesce(p_texto, ''))
       and similarity(
             public.fn_normalizar(p.nombre),
             public.fn_normalizar(coalesce(p_texto, ''))
           ) >= 0.8
     order by similarity(
       public.fn_normalizar(p.nombre),
       public.fn_normalizar(coalesce(p_texto, ''))
     ) desc
     limit 1)
  );
$fn$;

comment on function public.fn_pais_equivalente(text) is
  'El país que corresponde a un texto: por nombre, código o alias, o el casi idéntico si hubo una errata.';

-- -----------------------------------------------------------------------------
-- Puerta 3: crear el que no existe
--
-- Sin `security definer`: escribe con los permisos de quien importa, y la
-- política de RLS del catálogo exige `internacionalizacion.administrar`. Quien
-- puede cargar una lista puede ampliar el vocabulario con el que se clasifica;
-- quien no, no — y no hace falta ninguna regla nueva para que sea así.
-- -----------------------------------------------------------------------------
create or replace function public.fn_asegurar_catalogo(
  p_tipo  public.tipo_catalogo_contacto,
  p_texto text
)
returns uuid
language plpgsql
volatile
set search_path = public, extensions
as $fn$
declare
  v_id       uuid;
  v_etiqueta text := btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'));
  v_codigo   text;
begin
  if v_etiqueta = '' then
    return null;
  end if;

  v_id := public.fn_catalogo_equivalente(p_tipo, v_etiqueta);
  if v_id is not null then
    return v_id;
  end if;

  v_codigo := public.fn_codigo_catalogo(v_etiqueta);

  -- Un valor del que no sale un código —«&», «---»— no se puede guardar. Se
  -- devuelve nulo y el contacto entra sin clasificar, que es mejor que crear una
  -- entrada de catálogo sin nombre utilizable.
  if length(v_codigo) < 2 or length(v_etiqueta) > 60 then
    return null;
  end if;

  insert into public.contacto_catalogo (tipo, codigo, etiqueta, orden)
  values (p_tipo, v_codigo, v_etiqueta, 100)
  on conflict (tipo, codigo) do nothing
  returning id into v_id;

  -- El `do nothing` deja `v_id` nulo si el código ya estaba —dos etiquetas
  -- distintas pueden derivar en el mismo, «Banking & Finance» y «Banking /
  -- Finance»—. Se busca el que ganó: compartir entrada es correcto, quedarse
  -- sin ninguna no.
  if v_id is null then
    select c.id into v_id
    from public.contacto_catalogo c
    where c.tipo = p_tipo and c.codigo = v_codigo;
  end if;

  return v_id;
end;
$fn$;

comment on function public.fn_asegurar_catalogo(public.tipo_catalogo_contacto, text) is
  'Devuelve el valor del catálogo que corresponde al texto, creándolo si no existe ni se parece a ninguno.';

grant execute on function public.fn_codigo_catalogo(text) to authenticated;
grant execute on function public.fn_catalogo_equivalente(public.tipo_catalogo_contacto, text) to authenticated;
grant execute on function public.fn_pais_equivalente(text) to authenticated;
grant execute on function public.fn_asegurar_catalogo(public.tipo_catalogo_contacto, text) to authenticated;

-- =============================================================================
-- Previsualización
--
-- Mismas columnas que antes, así que no hace falta tirarla y recrearla. Lo que
-- cambia es lo que cuenta: ahora `rol_ok` y `sector_ok` significan «ya resuelto»
-- —porque existía o porque se entendió como uno que existe— y `false` significa
-- «se va a crear». El texto dice cuál de las dos cosas pasa, valor por valor.
-- =============================================================================
create or replace function public.fn_validar_importacion_contactos(
  p_filas jsonb,
  p_tipo  text default 'general',
  p_desde int default 0
)
returns table (
  linea      int,
  nombre     text,
  cargo      text,
  correo     text,
  pais       text,
  rol        text,
  sector     text,
  pais_ok    boolean,
  rol_ok     boolean,
  sector_ok  boolean,
  accion     text,
  severidad  text,
  mensaje    text
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
      -- Ahora con equivalencia: una errata cercana se resuelve sola.
      public.fn_pais_equivalente(c.f ->> 'pais')           as pais_codigo,
      public.fn_catalogo_equivalente('rol', c.f ->> 'rol') as rol_id,
      case
        when p_tipo = 'academico' and c.f ->> 'sector' is null then (
          select cc.id from public.contacto_catalogo cc
          where cc.tipo = 'sector' and cc.codigo = 'educacion_superior' and cc.activo
        )
        else public.fn_catalogo_equivalente('sector', c.f ->> 'sector')
      end as sector_id
    from crudas c
  ),
  evaluadas as (
    select
      b.*,
      min(b.linea) filter (where b.correo is not null)
        over (partition by lower(b.correo)) as primera_linea,
      (select ci.id from public.contactos_internacionales ci
        where lower(ci.correo) = lower(b.correo)) as existente,
      (select ci.tipo_contacto from public.contactos_internacionales ci
        where lower(ci.correo) = lower(b.correo)) as existente_tipo,
      -- Lo que el importador va a crear: hay texto, no se resolvió, y del texto
      -- sale un código utilizable. Si no sale, el contacto entra sin clasificar.
      (b.rol_texto is not null and b.rol_id is null
        and length(public.fn_codigo_catalogo(b.rol_texto)) >= 2
        and length(b.rol_texto) <= 60) as crea_rol,
      (b.sector_texto is not null and b.sector_id is null
        and length(public.fn_codigo_catalogo(b.sector_texto)) >= 2
        and length(b.sector_texto) <= 60) as crea_sector,
      -- Se entendió como otro que ya existía: conviene decirlo, porque es la
      -- única decisión que la base toma por su cuenta sobre el texto.
      (b.rol_texto is not null and b.rol_id is not null
        and public.fn_catalogo_id('rol', b.rol_texto) is null) as rol_equivalente,
      (b.sector_texto is not null and b.sector_id is not null
        and public.fn_catalogo_id('sector', b.sector_texto) is null) as sector_equivalente,
      (b.pais_texto is not null and b.pais_codigo is not null
        and public.fn_pais_codigo(b.pais_texto) is null) as pais_equivalente
    from base b
  ),
  diagnostico as (
    select
      e.*,
      (e.existente is not null
        and p_tipo <> 'general'
        and e.existente_tipo <> 'general'
        and e.existente_tipo::text <> p_tipo) as de_otra_lista,

      coalesce(
        e.p_nombre,
        e.p_cargo,
        e.p_correo,
        case
          when e.primera_linea is not null and e.linea > e.primera_linea then
            'Este correo ya aparece en la fila ' || e.primera_linea || ' de esta misma hoja.'
        end
      ) as problema,

      nullif(concat_ws(' ',
        case when e.pais_equivalente then
          'El país «' || e.pais_texto || '» se entenderá como «' ||
          (select p.nombre from public.paises p where p.codigo = e.pais_codigo) || '».' end,
        case when e.rol_equivalente then
          'El rol «' || e.rol_texto || '» se entenderá como «' ||
          (select c.etiqueta from public.contacto_catalogo c where c.id = e.rol_id) || '».' end,
        case when e.sector_equivalente then
          'El sector «' || e.sector_texto || '» se entenderá como «' ||
          (select c.etiqueta from public.contacto_catalogo c where c.id = e.sector_id) || '».' end,
        case when e.crea_rol then
          'Se añadirá «' || e.rol_texto || '» al catálogo de roles.' end,
        case when e.crea_sector then
          'Se añadirá «' || e.sector_texto || '» al catálogo de sectores.' end,
        case
          when e.pais_texto is not null and e.pais_codigo is null then
            'País no reconocido: «' || e.pais_texto || '».' ||
            coalesce(' ¿Querías decir «' || public.fn_pais_sugerencia(e.pais_texto) || '»?', '')
        end,
        case
          when p_tipo = 'academico' and e.sector_texto is null and e.sector_id is not null then
            'Se clasificará en «Educación superior» por venir de la plantilla académica.'
        end,
        -- El rol sólo se echa en falta cuando la hoja PODÍA traerlo. Ninguna de
        -- las dos plantillas de nominación tiene columna de rol, así que decirlo
        -- en cada fila sería repetir cuatrocientas veces algo que no depende de
        -- la fila.
        case
          when e.pais_codigo is null
            or (e.sector_id is null and not e.crea_sector)
            or (p_tipo = 'general' and e.rol_id is null and not e.crea_rol) then
            'Entrará sin ' || concat_ws(', ',
              case when e.pais_codigo is null then 'país' end,
              case when p_tipo = 'general' and e.rol_id is null and not e.crea_rol
                   then 'rol' end,
              case when e.sector_id is null and not e.crea_sector then 'sector' end
            ) || '; puedes completarlo después desde la ficha.'
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
    case when d.pais_texto   is null then null else d.pais_codigo is not null end,
    case when d.rol_texto    is null then null else d.rol_id is not null end,
    case when d.sector_texto is null then null else d.sector_id is not null end,
    case
      when d.problema is not null then 'error'
      when d.de_otra_lista then 'omitir'
      when d.existente is not null then 'actualizar'
      else 'crear'
    end,
    case
      when d.problema is not null then 'error'
      when d.de_otra_lista or d.aviso is not null then 'aviso'
      else 'ok'
    end,
    coalesce(
      d.problema,
      case
        when d.de_otra_lista then
          'Ya está en la libreta como contacto ' ||
          case d.existente_tipo::text when 'academico' then 'académico' else 'de empleador' end ||
          '. No se tocará, para que las dos listas no se mezclen.'
      end,
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
  'Previsualiza un trozo de la carga, incluido qué valores del catálogo se reutilizan y cuáles se crean.';

grant execute on function public.fn_validar_importacion_contactos(jsonb, text, int) to authenticated;

-- =============================================================================
-- Importación
--
-- Lo único que cambia respecto a la 27: el rol y el sector pasan por
-- `fn_asegurar_catalogo` —que resuelve o crea— y el país por
-- `fn_pais_equivalente` —que resuelve, pero nunca crea—.
-- =============================================================================
create or replace function public.fn_importar_contactos(
  p_filas jsonb,
  p_modo  text default 'mezclar',
  p_tipo  text default 'general'
)
returns table (creados int, actualizados int, omitidos int)
language plpgsql
security invoker
set search_path = public, extensions
as $fn$
declare
  v_fila     jsonb;
  v_f        jsonb;
  v_id       uuid;
  v_tipo_old public.tipo_contacto_internacional;
  v_pais     text;
  v_rol      uuid;
  v_sector   uuid;
  v_defecto  uuid;
  v_tipo     public.tipo_contacto_internacional := p_tipo::public.tipo_contacto_internacional;
  v_creados  int := 0;
  v_actual   int := 0;
  v_omitidos int := 0;
begin
  if not public.fn_tengo_permiso('internacionalizacion.administrar') then
    raise exception 'No tienes permiso para importar contactos.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_tipo = 'academico' then
    select id into v_defecto
    from public.contacto_catalogo
    where tipo = 'sector' and codigo = 'educacion_superior' and activo;
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_f := public.fn_normalizar_fila_contacto(v_fila);

    if public.fn_problema_nombre(v_f ->> 'nombre_completo') is not null
      or public.fn_problema_cargo(v_f ->> 'cargo') is not null
      or public.fn_problema_correo(v_f ->> 'correo') is not null
    then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    v_pais   := public.fn_pais_equivalente(v_f ->> 'pais');
    v_rol    := public.fn_asegurar_catalogo('rol', v_f ->> 'rol');
    v_sector := coalesce(
      public.fn_asegurar_catalogo('sector', v_f ->> 'sector'),
      case when v_f ->> 'sector' is null then v_defecto end
    );

    select id, tipo_contacto into v_id, v_tipo_old
    from public.contactos_internacionales
    where lower(correo) = lower(v_f ->> 'correo');

    -- Ya vino de la otra plantilla: no se toca. Es la garantía de que cargar una
    -- lista no reescribe la otra.
    if v_id is not null
      and v_tipo <> 'general'
      and v_tipo_old <> 'general'
      and v_tipo_old <> v_tipo
    then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    if v_id is not null and p_modo = 'solo_crear' then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;
    if v_id is null and p_modo = 'solo_actualizar' then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    if v_id is null then
      insert into public.contactos_internacionales (
        nombre_completo, nombres, apellidos, tratamiento, cargo, correo,
        pais_codigo, rol_id, sector_id,
        organizacion, departamento, area_conocimiento, fuente,
        telefono, notas, tipo_contacto, creado_por
      ) values (
        public.fn_capitalizar(v_f ->> 'nombre_completo'),
        v_f ->> 'nombres',
        v_f ->> 'apellidos',
        v_f ->> 'tratamiento',
        public.fn_capitalizar(v_f ->> 'cargo'),
        v_f ->> 'correo',
        v_pais, v_rol, v_sector,
        v_f ->> 'organizacion',
        v_f ->> 'departamento',
        v_f ->> 'area_conocimiento',
        v_f ->> 'fuente',
        v_f ->> 'telefono',
        v_f ->> 'notas',
        v_tipo,
        auth.uid()
      );
      v_creados := v_creados + 1;
    else
      update public.contactos_internacionales c
      set nombre_completo    = public.fn_capitalizar(v_f ->> 'nombre_completo'),
          nombres            = coalesce(v_f ->> 'nombres', c.nombres),
          apellidos          = coalesce(v_f ->> 'apellidos', c.apellidos),
          tratamiento        = coalesce(v_f ->> 'tratamiento', c.tratamiento),
          cargo              = public.fn_capitalizar(v_f ->> 'cargo'),
          pais_codigo        = coalesce(v_pais, c.pais_codigo),
          rol_id             = coalesce(v_rol, c.rol_id),
          sector_id          = coalesce(v_sector, c.sector_id),
          organizacion       = coalesce(v_f ->> 'organizacion', c.organizacion),
          departamento       = coalesce(v_f ->> 'departamento', c.departamento),
          area_conocimiento  = coalesce(v_f ->> 'area_conocimiento', c.area_conocimiento),
          fuente             = coalesce(v_f ->> 'fuente', c.fuente),
          telefono           = coalesce(v_f ->> 'telefono', c.telefono),
          notas              = coalesce(v_f ->> 'notas', c.notas),
          tipo_contacto      = case when v_tipo = 'general' then c.tipo_contacto else v_tipo end
      where c.id = v_id;
      v_actual := v_actual + 1;
    end if;
  end loop;

  return query select v_creados, v_actual, v_omitidos;
end;
$fn$;

comment on function public.fn_importar_contactos(jsonb, text, text) is
  'Crea o actualiza contactos desde una plantilla, ampliando el catálogo de roles y sectores con el vocabulario que trae la hoja.';

grant execute on function public.fn_importar_contactos(jsonb, text, text) to authenticated;
