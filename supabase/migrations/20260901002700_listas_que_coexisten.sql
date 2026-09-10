-- =============================================================================
-- Rua · 27 — Las dos listas coexisten, y un vocabulario ajeno no bloquea la carga
--
-- Dos fallos de diseño, los dos míos, que aparecieron al cargar la segunda lista.
--
-- 1 · UN VOCABULARIO AJENO NO PUEDE BLOQUEAR LA CARGA.
--
--     La plantilla de empleadores trae una columna «Industry» con los sectores
--     que usa QUIEN LA ESCRIBE: «Banking», «Manufacturing», «Consulting». El
--     catálogo sembrado tiene diez sectores en español. Ninguno coincide, y con
--     la regla anterior —valor no reconocido igual a error— TODAS las filas
--     salían en rojo y el botón de importar se quedaba apagado. La lista era
--     imposible de cargar.
--
--     La regla estaba mal trazada. Un error tiene que ser lo que impide GUARDAR
--     el contacto: que no tenga nombre, que no tenga cargo, que el correo no sea
--     un correo, o que la fila esté repetida. País, rol y sector son
--     CLASIFICACIÓN: si no se reconocen, el contacto entra sin clasificar y se
--     completa después. Nada se pierde y nadie se queda fuera.
--
--     La comprobación no desaparece —era el requisito— sino que cambia de tono:
--     la previsualización sigue diciendo, valor por valor, cuál no reconoce y
--     cuál se le parece. Lo que ya no hace es tirar la fila por ello. Y como
--     ahora dice qué valores concretos le faltan al catálogo, la pantalla puede
--     ofrecer añadirlos de una vez antes de importar.
--
-- 2 · CARGAR UNA LISTA NO PUEDE REESCRIBIR LA OTRA.
--
--     El emparejamiento es por correo, así que una persona que aparece en las dos
--     plantillas era el mismo contacto, y la segunda carga le cambiaba el tipo, el
--     cargo y la organización. Las dos listas se pisaban.
--
--     A partir de aquí, un contacto que ya vino de una plantilla NO lo toca la
--     otra: se cuenta como omitido y la previsualización lo dice antes. Las dos
--     listas conviven en la misma libreta sin mezclarse, que es justo lo que se
--     les pide. Un contacto de alta manual sí adopta la plantilla que lo reclame:
--     ahí no hay nada que proteger, sólo información nueva sobre su origen.
-- =============================================================================

do $guardia$ begin
  if to_regclass('public.contactos_internacionales') is null then
    raise exception
      'Antes de ésta hay que aplicar las migraciones 24, 25 y 26 del módulo de Internacionalización.';
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
  end;

  if v_posterior is not null then
    raise exception
      'No ejecutes ésta: ya está aplicada la migración %, que es posterior. Reaplicar una anterior revertiría sus cambios. Si algo no funciona, ejecuta supabase/diagnostico-internacionalizacion.sql para ver qué falta de verdad.',
      v_posterior;
  end if;
end $orden$;

-- Todas las versiones anteriores, para que no queden firmas conviviendo.
drop function if exists public.fn_validar_importacion_contactos(jsonb);
drop function if exists public.fn_validar_importacion_contactos(jsonb, text);
drop function if exists public.fn_validar_importacion_contactos(jsonb, text, int);
drop function if exists public.fn_importar_contactos(jsonb, text);
drop function if exists public.fn_importar_contactos(jsonb, text, text);

-- =============================================================================
-- Previsualización
--
-- Devuelve además, por cada fila, si reconoció el país, el rol y el sector. No
-- es un detalle de presentación: es lo que permite a la pantalla juntar los
-- valores que faltan y ofrecer añadirlos al catálogo, sin tener que repetir aquí
-- y allí las reglas de cómo se comparan —que es como acaban discrepando—.
-- =============================================================================
create or replace function public.fn_validar_importacion_contactos(
  p_filas jsonb,
  p_tipo  text default 'general',   -- 'general' | 'academico' | 'empleador'
  p_desde int default 0             -- cuántas filas van ya validadas antes de ésta
)
returns table (
  linea      int,
  nombre     text,
  cargo      text,
  correo     text,
  pais       text,
  rol        text,
  sector     text,
  -- Falso cuando la celda traía algo que el catálogo no reconoce. Nulo cuando
  -- la celda venía vacía: no es lo mismo «no lo sé» que «lo dice mal».
  pais_ok    boolean,
  rol_ok     boolean,
  sector_ok  boolean,
  accion     text,   -- 'crear' | 'actualizar' | 'omitir' | 'error'
  severidad  text,   -- 'ok' | 'aviso' | 'error'
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
      public.fn_pais_codigo(c.f ->> 'pais')                as pais_codigo,
      public.fn_catalogo_id('rol', c.f ->> 'rol')          as rol_id,
      -- La plantilla académica no tiene columna de sector porque no le hace
      -- falta: todo el que está en ella trabaja en educación superior.
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
      min(b.linea) filter (where b.correo is not null)
        over (partition by lower(b.correo)) as primera_linea,
      (select ci.id from public.contactos_internacionales ci
        where lower(ci.correo) = lower(b.correo)) as existente,
      (select ci.tipo_contacto from public.contactos_internacionales ci
        where lower(ci.correo) = lower(b.correo)) as existente_tipo
    from base b
  ),
  diagnostico as (
    select
      e.*,
      -- Ya está en la libreta, y vino de la OTRA plantilla. No se toca.
      (e.existente is not null
        and p_tipo <> 'general'
        and e.existente_tipo <> 'general'
        and e.existente_tipo::text <> p_tipo) as de_otra_lista,

      -- ERROR: lo que impide guardar el contacto. Nada más.
      coalesce(
        e.p_nombre,
        e.p_cargo,
        e.p_correo,
        case
          when e.primera_linea is not null and e.linea > e.primera_linea then
            'Este correo ya aparece en la fila ' || e.primera_linea || ' de esta misma hoja.'
        end
      ) as problema,

      -- AVISO: lo que se puede completar después. Se dice todo, valor por valor,
      -- porque de eso salen las correcciones que el usuario hará antes de
      -- confirmar; lo que no se hace es tirar la fila por ello.
      nullif(concat_ws(' ',
        case
          when e.pais_texto is not null and e.pais_codigo is null then
            'País no reconocido: «' || e.pais_texto || '».' ||
            coalesce(' ¿Querías decir «' || public.fn_pais_sugerencia(e.pais_texto) || '»?', '')
        end,
        case
          when e.rol_texto is not null and e.rol_id is null then
            'Rol no reconocido: «' || e.rol_texto || '».' ||
            coalesce(
              ' ¿Querías decir «' || public.fn_catalogo_sugerencia('rol', e.rol_texto) || '»?', '')
        end,
        case
          when e.sector_texto is not null and e.sector_id is null then
            'Sector no reconocido: «' || e.sector_texto || '».' ||
            coalesce(
              ' ¿Querías decir «' || public.fn_catalogo_sugerencia('sector', e.sector_texto) || '»?', '')
        end,
        case
          when p_tipo = 'academico' and e.sector_texto is null and e.sector_id is not null then
            'Se clasificará en «Educación superior» por venir de la plantilla académica.'
        end,
        case
          when e.pais_codigo is null or e.rol_id is null or e.sector_id is null then
            'Entrará sin ' || concat_ws(', ',
              case when e.pais_codigo is null then 'país' end,
              case when e.rol_id is null then 'rol' end,
              case when e.sector_id is null then 'sector' end
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
    case when d.rol_texto    is null then null else d.rol_id      is not null end,
    case when d.sector_texto is null then null else d.sector_id   is not null end,
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
  'Previsualiza un trozo de la carga. Un error impide guardar el contacto; la clasificación que no se reconoce es sólo un aviso.';

grant execute on function public.fn_validar_importacion_contactos(jsonb, text, int) to authenticated;

-- =============================================================================
-- Importación
-- =============================================================================
create or replace function public.fn_importar_contactos(
  p_filas jsonb,
  p_modo  text default 'mezclar',   -- 'mezclar' | 'solo_crear' | 'solo_actualizar'
  p_tipo  text default 'general'    -- 'general' | 'academico' | 'empleador'
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

    -- Sólo se salta lo que impide guardar el contacto. Un país, un rol o un
    -- sector que el catálogo no reconoce ya no descarta la fila: entra sin
    -- clasificar, que es lo que la previsualización prometió.
    if public.fn_problema_nombre(v_f ->> 'nombre_completo') is not null
      or public.fn_problema_cargo(v_f ->> 'cargo') is not null
      or public.fn_problema_correo(v_f ->> 'correo') is not null
    then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    v_pais   := public.fn_pais_codigo(v_f ->> 'pais');
    v_rol    := public.fn_catalogo_id('rol', v_f ->> 'rol');
    v_sector := coalesce(
      public.fn_catalogo_id('sector', v_f ->> 'sector'),
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
          -- Con coalesce: una celda vacía significa «no lo sé», no «bórralo», y
          -- eso incluye la clasificación. Reimportar una hoja sin columna de rol
          -- no puede desclasificar a quien ya se clasificó a mano.
          pais_codigo        = coalesce(v_pais, c.pais_codigo),
          rol_id             = coalesce(v_rol, c.rol_id),
          sector_id          = coalesce(v_sector, c.sector_id),
          organizacion       = coalesce(v_f ->> 'organizacion', c.organizacion),
          departamento       = coalesce(v_f ->> 'departamento', c.departamento),
          area_conocimiento  = coalesce(v_f ->> 'area_conocimiento', c.area_conocimiento),
          fuente             = coalesce(v_f ->> 'fuente', c.fuente),
          telefono           = coalesce(v_f ->> 'telefono', c.telefono),
          notas              = coalesce(v_f ->> 'notas', c.notas),
          -- Un contacto de alta manual adopta la plantilla que lo reclama: ahí
          -- no hay nada que proteger, sólo información nueva sobre su origen.
          tipo_contacto      = case when v_tipo = 'general' then c.tipo_contacto else v_tipo end
      where c.id = v_id;
      v_actual := v_actual + 1;
    end if;
  end loop;

  return query select v_creados, v_actual, v_omitidos;
end;
$fn$;

comment on function public.fn_importar_contactos(jsonb, text, text) is
  'Crea o actualiza contactos desde una plantilla. Nunca convierte un contacto de una lista en el de la otra, y una celda vacía nunca borra un dato existente.';

grant execute on function public.fn_importar_contactos(jsonb, text, text) to authenticated;
