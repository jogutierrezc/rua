-- =============================================================================
-- Rua · 25 — Las plantillas de nominación mandan
--
-- La libreta de la migración 24 se diseñó sobre los seis datos que pedía el
-- módulo. Pero los datos no nacen aquí: llegan en las plantillas de nominación
-- —la académica y la de empleadores—, y esas plantillas tienen su propia forma:
--
--   Académica:  Source · Title · First Name · Last Name · Job Title ·
--               Department · Institution · Country or Territory · Email ·
--               Subject · Phone (Optional)
--   Empleadores: Source · Title · First Name · Last Name · Position ·
--               Industry · Company Name · Country or Territory · Email ·
--               Phone (Optional)
--
-- Hasta ahora se importaban a costa de perder cosas: «Source» y «Title» se
-- tiraban, «Department» y «Subject» acababan amontonados en las notas, y el
-- nombre partido en dos columnas se unía sin guardar por dónde estaba partido.
-- Eso vale para meter datos, pero no para SACARLOS: exportar de vuelta en el
-- formato de la plantilla exige conservar cada campo en su sitio.
--
-- Ésa es la decisión de esta migración: lo que la plantilla trae se guarda tal
-- como viene, y el nombre completo pasa a ser lo derivado, no lo original.
-- Un directorio que no puede devolver lo que le dieron obliga a rehacer el
-- trabajo a mano cada vez que hay que reportar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Esta migración MODIFICA lo que crea la 24. Sin ella no hay nada que ampliar.
--
-- El error que da Postgres por su cuenta —«relation "public.contactos_
-- internacionales" does not exist»— es cierto pero inútil: no dice que el
-- problema sea el ORDEN, ni cuál es el archivo que falta. Se comprueba aquí para
-- poder decirlo con palabras.
-- -----------------------------------------------------------------------------
do $guardia$ begin
  if to_regclass('public.contactos_internacionales') is null then
    raise exception
      'Antes de ésta hay que aplicar la migración 20260901002400_internacionalizacion.sql, que es la que crea la libreta de contactos. Aplícala entera y vuelve con ésta.';
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
    when to_regclass('public.paises_busqueda') is not null
      then '26 · importacion_rapida'
  end;

  if v_posterior is not null then
    raise exception
      'No ejecutes ésta: ya está aplicada la migración %, que es posterior. Reaplicar una anterior revertiría sus cambios. Si algo no funciona, ejecuta supabase/diagnostico-internacionalizacion.sql para ver qué falta de verdad.',
      v_posterior;
  end if;
end $orden$;

-- -----------------------------------------------------------------------------
-- De qué plantilla viene el contacto
--
-- `general` es quien se dio de alta a mano o vino de una hoja propia. No es un
-- residuo: es la mayoría de la libreta el día que sólo se usa el formulario, y
-- necesita un nombre para no tener que preguntarse qué significa un nulo.
-- -----------------------------------------------------------------------------
do $tipo$ begin
  create type public.tipo_contacto_internacional as enum ('general', 'academico', 'empleador');
exception when duplicate_object then null;
end $tipo$;

alter table public.contactos_internacionales
  add column if not exists tipo_contacto public.tipo_contacto_internacional
    not null default 'general',
  -- Title: Dr., Prof., Mr., Ms. Se guarda aparte del nombre porque en la
  -- plantilla va en su propia columna, y meterlo dentro del nombre lo
  -- convertiría en algo imposible de volver a separar al exportar.
  add column if not exists tratamiento text,
  add column if not exists nombres   text,
  add column if not exists apellidos text,
  -- Source: de dónde salió la nominación. Es lo que permite rendir cuentas de
  -- una lista meses después, cuando ya nadie recuerda quién la propuso.
  add column if not exists fuente text,
  add column if not exists departamento      text,
  add column if not exists area_conocimiento text;

comment on column public.contactos_internacionales.tipo_contacto is
  'Plantilla de la que vino el contacto. Decide con qué columnas se exporta.';
comment on column public.contactos_internacionales.nombres is
  'First Name, tal como vino. Si la hoja traía el nombre entero, se deriva.';
comment on column public.contactos_internacionales.area_conocimiento is
  'Subject de la plantilla académica: la disciplina sobre la que se le nomina.';

create index if not exists contactos_tipo_idx
  on public.contactos_internacionales (tipo_contacto, nombre_completo);

-- =============================================================================
-- Partir un nombre en dos
--
-- Sólo hace falta cuando la hoja NO venía partida: si trajo First Name y Last
-- Name, se respeta lo que dijo la fuente y esto no se usa. Es un respaldo para
-- que la exportación siempre tenga las dos columnas que la plantilla exige, no
-- una opinión sobre cómo se llama la gente.
--
-- La regla es la convención hispana, que es la que domina esta libreta: los dos
-- últimos apellidos, el resto nombre de pila. Con dos palabras, una y una.
-- Se equivocará con «John Fitzgerald Kennedy», y es un precio aceptable: lo
-- corrige quien lo vea, y sólo afecta a los contactos que nunca llegaron
-- partidos.
-- =============================================================================
create or replace function public.fn_nombre_pila(p_texto text)
returns text
language sql
immutable
as $fn$
  with p as (
    select regexp_split_to_array(
      btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), ' '
    ) as w
  )
  select case
    when p.w[1] = '' then null
    when array_length(p.w, 1) <= 2 then p.w[1]
    else array_to_string(p.w[1 : array_length(p.w, 1) - 2], ' ')
  end
  from p;
$fn$;

create or replace function public.fn_apellidos(p_texto text)
returns text
language sql
immutable
as $fn$
  with p as (
    select regexp_split_to_array(
      btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), ' '
    ) as w
  )
  select case
    when p.w[1] = '' or array_length(p.w, 1) = 1 then null
    when array_length(p.w, 1) = 2 then p.w[2]
    else array_to_string(p.w[array_length(p.w, 1) - 1 : array_length(p.w, 1)], ' ')
  end
  from p;
$fn$;

grant execute on function public.fn_nombre_pila(text) to authenticated;
grant execute on function public.fn_apellidos(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Nombre completo y nombre partido, siempre de acuerdo
--
-- Se confía en las dos columnas SÓLO si vienen las dos y su unión es
-- exactamente el nombre completo. En cualquier otro caso manda el nombre
-- completo y las dos se recalculan.
--
-- Es lo que evita el desacuerdo silencioso: alguien corrige una errata en el
-- nombre desde el formulario, y la exportación seguiría mandando el apellido
-- viejo en su columna sin que nada lo delatara.
-- -----------------------------------------------------------------------------
create or replace function public.fn_contacto_partir_nombre()
returns trigger
language plpgsql
as $fn$
begin
  if new.nombres is not null
     and new.apellidos is not null
     and new.nombre_completo = btrim(new.nombres || ' ' || new.apellidos)
  then
    return new;
  end if;

  new.nombres   := public.fn_nombre_pila(new.nombre_completo);
  new.apellidos := public.fn_apellidos(new.nombre_completo);
  return new;
end;
$fn$;

drop trigger if exists trg_contacto_partir_nombre on public.contactos_internacionales;
create trigger trg_contacto_partir_nombre
  before insert or update of nombre_completo, nombres, apellidos
  on public.contactos_internacionales
  for each row execute function public.fn_contacto_partir_nombre();

-- Los que ya estaban en la libreta antes de existir estas columnas.
update public.contactos_internacionales
set nombres   = public.fn_nombre_pila(nombre_completo),
    apellidos = public.fn_apellidos(nombre_completo)
where nombres is null;

-- =============================================================================
-- El normalizador reconoce las plantillas enteras
--
-- Se reemplaza el de la migración 24. Cambia en tres cosas:
--
--   · El nombre partido gana al nombre entero. Antes, una hoja con «Nombres» y
--     «Apellidos» se leía por la primera columna y perdía la segunda.
--   · Title, Source, Department y Subject dejan de tirarse o de amontonarse en
--     las notas: cada uno tiene su columna.
--   · Las notas vuelven a ser sólo notas.
-- =============================================================================
create or replace function public.fn_normalizar_fila_contacto(p_fila jsonb)
returns jsonb
language sql
immutable
parallel safe
as $fn$
  select jsonb_build_object(
    -- El nombre llega de dos maneras: entero, o partido en dos columnas. Las
    -- plantillas de nominación lo parten SIEMPRE, así que la unión va primero:
    -- leer la columna de nombres e ignorar la de apellidos es perder la mitad
    -- del nombre sin avisar.
    'nombre_completo', nullif(btrim(coalesce(
      nullif(btrim(concat_ws(' ',
        nullif(btrim(coalesce(p_fila ->> 'first_name', p_fila ->> 'nombres',
                              p_fila ->> 'nombre_s', p_fila ->> 'nombres_pila', '')), ''),
        nullif(btrim(coalesce(p_fila ->> 'last_name', p_fila ->> 'apellidos',
                              p_fila ->> 'apellido', '')), '')
      )), ''),
      nullif(btrim(coalesce(
        p_fila ->> 'nombre_completo', p_fila ->> 'nombre',
        p_fila ->> 'nombre_y_apellidos', p_fila ->> 'nombre_del_contacto',
        p_fila ->> 'contacto', p_fila ->> 'full_name', p_fila ->> 'name', '')), ''),
      '')), ''),

    'nombres', nullif(btrim(coalesce(
      p_fila ->> 'first_name', p_fila ->> 'nombres', p_fila ->> 'nombre_s',
      p_fila ->> 'nombres_pila', '')), ''),
    'apellidos', nullif(btrim(coalesce(
      p_fila ->> 'last_name', p_fila ->> 'apellidos', p_fila ->> 'apellido', '')), ''),

    -- Dr., Prof., Mr. Se limita a lo que cabe en un tratamiento: si alguien
    -- puso el nombre entero en esta columna, se descarta en vez de arrastrarlo.
    'tratamiento', nullif(left(btrim(coalesce(
      p_fila ->> 'title', p_fila ->> 'tratamiento', p_fila ->> 'titulo', '')), 20), ''),

    'cargo', nullif(btrim(coalesce(
      p_fila ->> 'cargo', p_fila ->> 'puesto', p_fila ->> 'posicion',
      p_fila ->> 'cargo_posicion', p_fila ->> 'position', p_fila ->> 'job_title',
      p_fila ->> 'title_position', '')), ''),

    'correo', nullif(btrim(lower(coalesce(
      p_fila ->> 'correo', p_fila ->> 'correo_electronico', p_fila ->> 'email',
      p_fila ->> 'e_mail', p_fila ->> 'mail', ''))), ''),

    'pais', nullif(btrim(coalesce(
      p_fila ->> 'pais', p_fila ->> 'country', p_fila ->> 'nacion',
      p_fila ->> 'country_or_territory', p_fila ->> 'pais_o_territorio', '')), ''),

    'rol', nullif(btrim(coalesce(
      p_fila ->> 'rol', p_fila ->> 'rol_del_contacto', p_fila ->> 'tipo_de_contacto',
      p_fila ->> 'tipo_contacto', p_fila ->> 'role', '')), ''),

    'sector', nullif(btrim(coalesce(
      p_fila ->> 'sector', p_fila ->> 'sector_economico', p_fila ->> 'industria',
      p_fila ->> 'industry', p_fila ->> 'sector_industria', '')), ''),

    'organizacion', nullif(btrim(coalesce(
      p_fila ->> 'organizacion', p_fila ->> 'institucion', p_fila ->> 'entidad',
      p_fila ->> 'empresa', p_fila ->> 'universidad', p_fila ->> 'organization',
      p_fila ->> 'institution', p_fila ->> 'company_name', '')), ''),

    'departamento', nullif(btrim(coalesce(
      p_fila ->> 'departamento', p_fila ->> 'department', p_fila ->> 'unidad',
      p_fila ->> 'dependencia', '')), ''),

    'area_conocimiento', nullif(btrim(coalesce(
      p_fila ->> 'area_conocimiento', p_fila ->> 'subject', p_fila ->> 'area',
      p_fila ->> 'area_de_conocimiento', p_fila ->> 'disciplina', '')), ''),

    'fuente', nullif(btrim(coalesce(
      p_fila ->> 'fuente', p_fila ->> 'source', p_fila ->> 'origen', '')), ''),

    'telefono', nullif(btrim(coalesce(
      p_fila ->> 'telefono', p_fila ->> 'tel', p_fila ->> 'celular',
      p_fila ->> 'movil', p_fila ->> 'phone', p_fila ->> 'whatsapp',
      p_fila ->> 'phone_optional', '')), ''),

    'notas', nullif(btrim(coalesce(
      p_fila ->> 'notas', p_fila ->> 'observaciones', p_fila ->> 'comentarios',
      p_fila ->> 'notes', '')), '')
  );
$fn$;

-- =============================================================================
-- Validación e importación, ahora conscientes de la plantilla
--
-- Las dos ganan un parámetro. No se pueden reemplazar en el sitio: añadir un
-- argumento crea una función NUEVA en vez de sustituir a la vieja, y las dos
-- convivirían — con lo que una llamada por nombre de argumento se volvería
-- ambigua y fallaría. Se tiran primero, a propósito.
-- =============================================================================
drop function if exists public.fn_validar_importacion_contactos(jsonb);
drop function if exists public.fn_importar_contactos(jsonb, text);

create or replace function public.fn_validar_importacion_contactos(
  p_filas jsonb,
  p_tipo  text default 'general'   -- 'general' | 'academico' | 'empleador'
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
    select (orden)::int as linea, public.fn_normalizar_fila_contacto(fila) as f
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
        -- se completa después. Exigirlos dejaría fuera las propias plantillas de
        -- nominación, que no traen columna de rol.
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

comment on function public.fn_validar_importacion_contactos(jsonb, text) is
  'Previsualiza una carga de contactos según la plantilla de origen: qué se crea, qué se actualiza y qué está mal, sin escribir nada.';

grant execute on function public.fn_validar_importacion_contactos(jsonb, text) to authenticated;

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

  -- Se resuelve una vez y no dentro del bucle: en una hoja de quinientas filas
  -- son quinientas consultas idénticas por un valor que no cambia.
  if v_tipo = 'academico' then
    select id into v_defecto
    from public.contacto_catalogo
    where tipo = 'sector' and codigo = 'educacion_superior' and activo;
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_f := public.fn_normalizar_fila_contacto(v_fila);

    v_pais   := public.fn_pais_codigo(v_f ->> 'pais');
    v_rol    := public.fn_catalogo_id('rol', v_f ->> 'rol');
    v_sector := coalesce(
      public.fn_catalogo_id('sector', v_f ->> 'sector'),
      case when v_f ->> 'sector' is null then v_defecto end
    );

    -- Se salta lo que la previsualización marcó en rojo, y sólo eso: un valor
    -- que VIENE y no se reconoce es un error, pero uno que no viene es sólo una
    -- clasificación pendiente. La condición tiene que ser idéntica a la del
    -- validador, o la previsualización estaría prometiendo algo distinto de lo
    -- que va a pasar.
    if public.fn_problema_nombre(v_f ->> 'nombre_completo') is not null
      or public.fn_problema_cargo(v_f ->> 'cargo') is not null
      or public.fn_problema_correo(v_f ->> 'correo') is not null
      or (v_f ->> 'pais' is not null and v_pais is null)
      or (v_f ->> 'rol' is not null and v_rol is null)
      or (v_f ->> 'sector' is not null and v_sector is null)
    then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    select id into v_id
    from public.contactos_internacionales
    where lower(correo) = lower(v_f ->> 'correo');

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
      -- Los tres del núcleo los manda la hoja: si se está reimportando el
      -- directorio corregido, no tendría sentido conservar lo viejo. Todo lo
      -- demás va con coalesce, porque una celda vacía significa «no lo sé», no
      -- «bórralo» — y eso incluye la clasificación: reimportar una plantilla sin
      -- columna de rol no puede desclasificar a quien ya se clasificó a mano.
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
          -- Un contacto general que reaparece en una plantilla concreta pasa a
          -- ser de esa plantilla: es información nueva sobre su origen. Al revés
          -- no: importar una hoja propia no borra que vino de la académica.
          tipo_contacto      = case when v_tipo = 'general' then c.tipo_contacto else v_tipo end
      where c.id = v_id;
      v_actual := v_actual + 1;
    end if;
  end loop;

  return query select v_creados, v_actual, v_omitidos;
end;
$fn$;

comment on function public.fn_importar_contactos(jsonb, text, text) is
  'Crea o actualiza contactos desde una plantilla, emparejando por correo. Una celda vacía nunca borra un dato existente.';

grant execute on function public.fn_importar_contactos(jsonb, text, text) to authenticated;

-- =============================================================================
-- La vista, con las columnas nuevas
--
-- Se recrea entera y no se reemplaza: `create or replace view` no puede añadir
-- columnas, y con `select c.*` la lista quedó congelada en su definición.
-- =============================================================================
drop view if exists public.v_contactos_internacionales;

create view public.v_contactos_internacionales
with (security_invoker = true) as
select
  c.*,
  p.nombre  as pais_nombre,
  p.region  as pais_region,
  r.etiqueta as rol_etiqueta,
  s.etiqueta as sector_etiqueta,
  cp.nombre_completo as creado_por_nombre,
  vp.nombre_completo as verificado_por_nombre,
  case
    when c.verificacion_en is null then null
    else (current_date - c.verificacion_en::date)
  end as dias_desde_verificacion
from public.contactos_internacionales c
left join public.paises p            on p.codigo = c.pais_codigo
left join public.contacto_catalogo r on r.id = c.rol_id
left join public.contacto_catalogo s on s.id = c.sector_id
left join public.perfiles cp         on cp.id = c.creado_por
left join public.perfiles vp         on vp.id = c.verificacion_por;

comment on view public.v_contactos_internacionales is
  'Contactos con país, rol, sector y autores ya resueltos. Es la fuente de las pantallas del módulo.';

-- La bitácora sigue lo que edita una persona. Las columnas nuevas son datos de
-- la ficha como cualquier otro, así que entran en el mismo trigger.
drop trigger if exists trg_auditar_contactos_edicion on public.contactos_internacionales;
create trigger trg_auditar_contactos_edicion
  after update of nombre_completo, cargo, correo, pais_codigo, rol_id, sector_id,
                  organizacion, telefono, estado, tipo_contacto, tratamiento,
                  departamento, area_conocimiento, fuente
  on public.contactos_internacionales
  for each row execute function public.fn_auditar();
