-- =============================================================================
-- Rua · 24 — Internacionalización
--
-- Una libreta de contactos internacionales: quién es, qué cargo tiene, en qué
-- país está, a qué sector pertenece y —lo que de verdad importa— si su correo
-- SIRVE. Un directorio de aliados no vale por cuántas filas tiene, sino por
-- cuántas de ellas responden cuando se les escribe.
--
-- Tres decisiones ordenan el diseño:
--
-- 1 · País, rol y sector NO son texto libre. Sobre ellos se filtra y se agrega,
--     y con texto libre acaban conviviendo «Colombia», «colombia» y «COL» como
--     si fueran tres países. El país sale de un catálogo cerrado (ISO 3166-1);
--     el rol y el sector, de uno EDITABLE, porque cada institución nombra sus
--     sectores a su manera y congelarlos en un enum obligaría a una migración
--     cada vez que aparece uno nuevo.
--
-- 2 · La validación de la carga tiene dos niveles, y son distintos a propósito.
--     Al subir la hoja se comprueba lo que se puede comprobar sin salir de aquí:
--     que el correo tenga estructura de correo, que el nombre parezca un nombre,
--     que el cargo parezca un cargo, y que país, rol y sector existan en su
--     catálogo. Que el buzón EXISTA y esté activo no se puede saber sin
--     preguntárselo a alguien de fuera, y eso cuesta dinero por consulta: es un
--     segundo paso, deliberado, que dispara una persona.
--
-- 3 · El resultado de esa verificación se guarda en la fila, no se recalcula.
--     Es un hecho fechado —«el 12 de marzo este buzón aceptaba correo»—, no una
--     propiedad eterna de la dirección. Por eso se guarda CUÁNDO y QUIÉN, y por
--     eso cambiar el correo de un contacto borra su verificación: si no, pasaría
--     a lucir el veredicto de una dirección que ya no es la suya.
-- =============================================================================

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
    when exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'contactos_internacionales'
                   and column_name = 'tipo_contacto')
      then '25 · plantillas_nominacion'
  end;

  if v_posterior is not null then
    raise exception
      'No ejecutes ésta: ya está aplicada la migración %, que es posterior. Reaplicar una anterior revertiría sus cambios. Si algo no funciona, ejecuta supabase/diagnostico-internacionalizacion.sql para ver qué falta de verdad.',
      v_posterior;
  end if;
end $orden$;

-- -----------------------------------------------------------------------------
-- Enumeraciones
-- -----------------------------------------------------------------------------

-- Qué clase de catálogo editable es. Rol y sector comparten tabla porque
-- comparten forma y comparten pantalla: dos tablas idénticas serían dos veces
-- el mismo CRUD.
do $tipo$ begin
  create type public.tipo_catalogo_contacto as enum ('rol', 'sector');
exception when duplicate_object then null;
end $tipo$;

-- El veredicto sobre un buzón.
--
-- `riesgoso` existe porque la realidad tiene tres respuestas y no dos: hay
-- direcciones que el proveedor no confirma ni desmiente —dominios que aceptan
-- todo, buzones temporales, servidores que no contestan a tiempo—. Meterlas en
-- `valido` haría creer que llegan; meterlas en `invalido` haría borrar contactos
-- buenos. Merecen su propio color.
do $tipo$ begin
  create type public.estado_verificacion as enum (
    'sin_verificar',
    'valido',
    'riesgoso',
    'invalido',
    'error'
  );
exception when duplicate_object then null;
end $tipo$;

-- -----------------------------------------------------------------------------
-- Países
--
-- Catálogo cerrado, sembrado por la migración y no editable desde la interfaz:
-- la lista de países del mundo no es una decisión de la Universidad.
--
-- `alias` es lo que hace que la importación no sea un muro. Las hojas de
-- internacionalización vienen de congresos y de convenios, y ahí «Estados
-- Unidos» llega escrito como USA, EE.UU. o United States. Todas son el mismo
-- país, y rechazar la fila por eso sería teatro.
-- -----------------------------------------------------------------------------
create table if not exists public.paises (
  codigo text primary key,
  nombre text not null,
  region text not null,
  alias  text[] not null default '{}',
  activo boolean not null default true,

  constraint paises_codigo_formato check (codigo ~ '^[A-Z]{2}$'),
  constraint paises_nombre_no_vacio check (length(trim(nombre)) >= 3)
);

create unique index if not exists paises_nombre_unico on public.paises (public.fn_normalizar(nombre));
create index if not exists paises_region_idx on public.paises (region, nombre);

comment on table public.paises is
  'ISO 3166-1 alfa-2 en español. Catálogo cerrado: lo siembra la migración, no lo edita la interfaz.';
comment on column public.paises.alias is
  'Otras formas de escribir el mismo país que la importación debe aceptar (USA, EE.UU., United States).';

-- -----------------------------------------------------------------------------
-- Catálogo de roles y sectores
--
-- Editable a propósito. Los valores sembrados son un punto de partida
-- razonable, no una verdad: la oficina de Internacionalización añadirá los
-- suyos, y hacerlo no puede exigir un despliegue.
--
-- `codigo` es la clave estable y `etiqueta` lo que se lee. Separarlos permite
-- renombrar «ONG» a «Tercer sector» sin perder a qué apuntaban los contactos
-- que ya lo tenían.
-- -----------------------------------------------------------------------------
create table if not exists public.contacto_catalogo (
  id          uuid primary key default gen_random_uuid(),
  tipo        public.tipo_catalogo_contacto not null,
  codigo      text not null,
  etiqueta    text not null,
  descripcion text,

  orden      smallint not null default 0,
  activo     boolean not null default true,
  -- Los de fábrica no se borran: hay contactos apuntando a ellos, y borrarlos
  -- los dejaría sin clasificar. Renombrarlos y desactivarlos sí.
  es_sistema boolean not null default false,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint catalogo_codigo_formato check (codigo ~ '^[a-z0-9_]{2,40}$'),
  constraint catalogo_etiqueta_valida check (length(trim(etiqueta)) between 2 and 60),

  unique (tipo, codigo)
);

-- Dos sectores que sólo se distinguen por una tilde son el mismo sector escrito
-- de dos maneras, que es exactamente lo que hay que impedir.
create unique index if not exists catalogo_etiqueta_unica
  on public.contacto_catalogo (tipo, public.fn_normalizar(etiqueta));

create index if not exists catalogo_tipo_idx on public.contacto_catalogo (tipo, orden, etiqueta);

comment on table public.contacto_catalogo is
  'Roles y sectores de los contactos internacionales. Editable: cada institución nombra los suyos.';

drop trigger if exists trg_catalogo_actualizado on public.contacto_catalogo;
create trigger trg_catalogo_actualizado before update on public.contacto_catalogo
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- Contactos
--
-- El correo es la identidad. No el nombre: dos personas se llaman igual, y la
-- misma persona aparece como «Ana María Gómez» en una hoja y «Ana M. Gomez» en
-- la siguiente. La dirección es lo único que identifica a un contacto sin
-- ambigüedad, y por eso es la clave con la que la importación decide si crea una
-- fila nueva o actualiza la que ya estaba.
-- -----------------------------------------------------------------------------
create table if not exists public.contactos_internacionales (
  id uuid primary key default gen_random_uuid(),

  nombre_completo text not null,
  cargo           text not null,
  correo          text not null,

  pais_codigo text references public.paises (codigo) on delete restrict,
  rol_id      uuid references public.contacto_catalogo (id) on delete set null,
  sector_id   uuid references public.contacto_catalogo (id) on delete set null,

  -- Complementarios: la libreta se queda corta enseguida sin ellos, pero
  -- ninguno es obligatorio, porque ninguno hace falta para escribirle a alguien.
  organizacion text,
  telefono     text,
  notas        text,

  estado public.estado_registro not null default 'activo',

  -- ---------------------------------------------------------------------------
  -- La verificación
  --
  -- Todo esto lo escribe la Edge Function y nadie más. Se guarda desglosado y no
  -- sólo el veredicto porque las razones son accionables por separado: a un
  -- correo genérico (info@) se le escribe distinto que a uno desechable, aunque
  -- los dos salgan como «riesgoso».
  -- ---------------------------------------------------------------------------
  verificacion_estado  public.estado_verificacion not null default 'sin_verificar',
  verificacion_en      timestamptz,
  verificacion_por     uuid references public.perfiles (id) on delete set null,
  verificacion_mensaje text,

  -- Lo que dijo el proveedor, campo a campo.
  entregable     text,          -- DELIVERABLE | UNDELIVERABLE | RISKY | UNKNOWN
  calidad        numeric(3, 2),
  formato_valido boolean,
  buzon_smtp     boolean,
  dominio_mx     boolean,
  es_desechable  boolean,       -- buzón temporal, de usar y tirar
  es_gratuito    boolean,       -- gmail, hotmail… no es malo, es contexto
  es_generico    boolean,       -- info@, contacto@ — es un buzón, no una persona
  acepta_todo    boolean,       -- el dominio acepta cualquier dirección
  correccion     text,          -- la corrección que sugiere el proveedor

  -- La respuesta cruda. Ocupa poco y evita la migración del día que haga falta
  -- un campo que hoy no se guarda.
  verificacion_detalle jsonb,

  creado_por     uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint contacto_correo_valido check (
    correo ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$'
  ),
  constraint contacto_nombre_valido check (length(trim(nombre_completo)) between 3 and 160),
  constraint contacto_cargo_valido check (length(trim(cargo)) between 2 and 120),
  constraint contacto_calidad_rango check (calidad is null or calidad between 0 and 1)
);

-- La identidad es el correo, sin distinguir mayúsculas: Ana@u.edu y ana@u.edu
-- son el mismo buzón.
create unique index if not exists contactos_correo_unico
  on public.contactos_internacionales (lower(correo));

create index if not exists contactos_pais_idx on public.contactos_internacionales (pais_codigo, nombre_completo);
create index if not exists contactos_rol_idx on public.contactos_internacionales (rol_id);
create index if not exists contactos_sector_idx on public.contactos_internacionales (sector_id);
create index if not exists contactos_verificacion_idx on public.contactos_internacionales (verificacion_estado);
-- Búsqueda por nombre tolerante a tildes y a erratas, como en perfiles.
create index if not exists contactos_nombre_trgm_idx on public.contactos_internacionales
  using gin (public.fn_normalizar(nombre_completo) gin_trgm_ops);

comment on table public.contactos_internacionales is
  'Libreta de contactos internacionales. El correo es la identidad: es la clave con la que empareja la importación.';

drop trigger if exists trg_contactos_actualizado on public.contactos_internacionales;
create trigger trg_contactos_actualizado before update on public.contactos_internacionales
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- Cambiar el correo invalida el veredicto
--
-- Sin esto, corregir una errata en la dirección dejaría al contacto luciendo un
-- «verificado» que se ganó otra dirección distinta. Es la misma clase de error
-- que un sello de calidad heredado.
-- -----------------------------------------------------------------------------
create or replace function public.fn_contacto_reiniciar_verificacion()
returns trigger
language plpgsql
as $fn$
begin
  if lower(new.correo) is distinct from lower(old.correo) then
    new.verificacion_estado  := 'sin_verificar';
    new.verificacion_en      := null;
    new.verificacion_por     := null;
    new.verificacion_mensaje := null;
    new.entregable     := null;
    new.calidad        := null;
    new.formato_valido := null;
    new.buzon_smtp     := null;
    new.dominio_mx     := null;
    new.es_desechable  := null;
    new.es_gratuito    := null;
    new.es_generico    := null;
    new.acepta_todo    := null;
    new.correccion     := null;
    new.verificacion_detalle := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_contacto_reiniciar_verificacion on public.contactos_internacionales;
create trigger trg_contacto_reiniciar_verificacion
  before update of correo on public.contactos_internacionales
  for each row execute function public.fn_contacto_reiniciar_verificacion();

-- La bitácora sigue lo que edita una persona, no lo que escribe la verificación.
-- Auditar también el veredicto añadiría quinientas filas cada vez que alguien
-- verifica un lote, y enterraría los cambios que sí importan.
drop trigger if exists trg_auditar_contactos on public.contactos_internacionales;
create trigger trg_auditar_contactos
  after insert or delete on public.contactos_internacionales
  for each row execute function public.fn_auditar();

drop trigger if exists trg_auditar_contactos_edicion on public.contactos_internacionales;
create trigger trg_auditar_contactos_edicion
  after update of nombre_completo, cargo, correo, pais_codigo, rol_id, sector_id,
                  organizacion, telefono, estado
  on public.contactos_internacionales
  for each row execute function public.fn_auditar();

-- =============================================================================
-- Siembra de países
--
-- ISO 3166-1 alfa-2 con el nombre en español. Los alias se ponen sólo donde
-- hacen falta de verdad: los países con los que se firman convenios y que las
-- hojas de cálculo escriben en inglés o abreviados.
-- =============================================================================
insert into public.paises (codigo, nombre, region, alias) values
  -- América
  ('AR', 'Argentina', 'América', '{argentina}'),
  ('BO', 'Bolivia', 'América', '{bolivia}'),
  ('BR', 'Brasil', 'América', '{brazil,brasil}'),
  ('CA', 'Canadá', 'América', '{canada}'),
  ('CL', 'Chile', 'América', '{chile}'),
  ('CO', 'Colombia', 'América', '{colombia}'),
  ('CR', 'Costa Rica', 'América', '{costa rica}'),
  ('CU', 'Cuba', 'América', '{cuba}'),
  ('EC', 'Ecuador', 'América', '{ecuador}'),
  ('SV', 'El Salvador', 'América', '{el salvador,salvador}'),
  ('US', 'Estados Unidos', 'América',
   '{usa,ee uu,eeuu,ee.uu.,united states,united states of america,estados unidos de america}'),
  ('GT', 'Guatemala', 'América', '{guatemala}'),
  ('HN', 'Honduras', 'América', '{honduras}'),
  ('MX', 'México', 'América', '{mexico,mejico}'),
  ('NI', 'Nicaragua', 'América', '{nicaragua}'),
  ('PA', 'Panamá', 'América', '{panama}'),
  ('PY', 'Paraguay', 'América', '{paraguay}'),
  ('PE', 'Perú', 'América', '{peru}'),
  ('PR', 'Puerto Rico', 'América', '{puerto rico}'),
  ('DO', 'República Dominicana', 'América', '{republica dominicana,dominican republic}'),
  ('UY', 'Uruguay', 'América', '{uruguay}'),
  ('VE', 'Venezuela', 'América', '{venezuela}'),
  ('BZ', 'Belice', 'América', '{belize}'),
  ('GY', 'Guyana', 'América', '{guyana}'),
  ('SR', 'Surinam', 'América', '{suriname}'),
  ('HT', 'Haití', 'América', '{haiti}'),
  ('JM', 'Jamaica', 'América', '{jamaica}'),
  ('TT', 'Trinidad y Tobago', 'América', '{trinidad and tobago,trinidad}'),
  ('BS', 'Bahamas', 'América', '{bahamas}'),
  ('BB', 'Barbados', 'América', '{barbados}'),
  ('AG', 'Antigua y Barbuda', 'América', '{antigua and barbuda}'),
  ('DM', 'Dominica', 'América', '{dominica}'),
  ('GD', 'Granada', 'América', '{grenada}'),
  ('KN', 'San Cristóbal y Nieves', 'América', '{saint kitts and nevis}'),
  ('LC', 'Santa Lucía', 'América', '{saint lucia}'),
  ('VC', 'San Vicente y las Granadinas', 'América', '{saint vincent and the grenadines}'),
  ('AW', 'Aruba', 'América', '{aruba}'),
  ('CW', 'Curazao', 'América', '{curacao}'),
  ('BM', 'Bermudas', 'América', '{bermuda}'),
  ('GP', 'Guadalupe', 'América', '{guadeloupe}'),
  ('MQ', 'Martinica', 'América', '{martinique}'),
  ('GF', 'Guayana Francesa', 'América', '{french guiana,guyana francesa}'),
  ('GL', 'Groenlandia', 'América', '{greenland}'),

  -- Europa
  ('DE', 'Alemania', 'Europa', '{germany,deutschland}'),
  ('AL', 'Albania', 'Europa', '{albania}'),
  ('AD', 'Andorra', 'Europa', '{andorra}'),
  ('AT', 'Austria', 'Europa', '{austria}'),
  ('BE', 'Bélgica', 'Europa', '{belgium,belgica}'),
  ('BY', 'Bielorrusia', 'Europa', '{belarus}'),
  ('BA', 'Bosnia y Herzegovina', 'Europa', '{bosnia and herzegovina,bosnia}'),
  ('BG', 'Bulgaria', 'Europa', '{bulgaria}'),
  ('CY', 'Chipre', 'Europa', '{cyprus}'),
  ('HR', 'Croacia', 'Europa', '{croatia}'),
  ('DK', 'Dinamarca', 'Europa', '{denmark}'),
  ('SK', 'Eslovaquia', 'Europa', '{slovakia}'),
  ('SI', 'Eslovenia', 'Europa', '{slovenia}'),
  ('ES', 'España', 'Europa', '{spain,espana}'),
  ('EE', 'Estonia', 'Europa', '{estonia}'),
  ('FI', 'Finlandia', 'Europa', '{finland}'),
  ('FR', 'Francia', 'Europa', '{france}'),
  ('GR', 'Grecia', 'Europa', '{greece}'),
  ('HU', 'Hungría', 'Europa', '{hungary,hungria}'),
  ('IE', 'Irlanda', 'Europa', '{ireland}'),
  ('IS', 'Islandia', 'Europa', '{iceland}'),
  ('IT', 'Italia', 'Europa', '{italy}'),
  ('LV', 'Letonia', 'Europa', '{latvia}'),
  ('LI', 'Liechtenstein', 'Europa', '{liechtenstein}'),
  ('LT', 'Lituania', 'Europa', '{lithuania}'),
  ('LU', 'Luxemburgo', 'Europa', '{luxembourg}'),
  ('MK', 'Macedonia del Norte', 'Europa', '{north macedonia,macedonia}'),
  ('MT', 'Malta', 'Europa', '{malta}'),
  ('MD', 'Moldavia', 'Europa', '{moldova}'),
  ('MC', 'Mónaco', 'Europa', '{monaco}'),
  ('ME', 'Montenegro', 'Europa', '{montenegro}'),
  ('NO', 'Noruega', 'Europa', '{norway}'),
  ('NL', 'Países Bajos', 'Europa', '{netherlands,holanda,holland,paises bajos}'),
  ('PL', 'Polonia', 'Europa', '{poland}'),
  ('PT', 'Portugal', 'Europa', '{portugal}'),
  ('GB', 'Reino Unido', 'Europa',
   '{united kingdom,uk,inglaterra,england,gran bretana,great britain,escocia,gales}'),
  ('CZ', 'República Checa', 'Europa', '{czech republic,czechia,chequia,republica checa}'),
  ('RO', 'Rumania', 'Europa', '{romania,rumania,rumanía}'),
  ('RU', 'Rusia', 'Europa', '{russia,federacion rusa}'),
  ('SM', 'San Marino', 'Europa', '{san marino}'),
  ('RS', 'Serbia', 'Europa', '{serbia}'),
  ('SE', 'Suecia', 'Europa', '{sweden}'),
  ('CH', 'Suiza', 'Europa', '{switzerland,suisse}'),
  ('UA', 'Ucrania', 'Europa', '{ukraine}'),
  ('VA', 'Ciudad del Vaticano', 'Europa', '{vatican,vaticano,santa sede}'),

  -- Asia
  ('AF', 'Afganistán', 'Asia', '{afghanistan}'),
  ('SA', 'Arabia Saudita', 'Asia', '{saudi arabia,arabia saudi}'),
  ('AM', 'Armenia', 'Asia', '{armenia}'),
  ('AZ', 'Azerbaiyán', 'Asia', '{azerbaijan}'),
  ('BH', 'Baréin', 'Asia', '{bahrain,bahrein}'),
  ('BD', 'Bangladés', 'Asia', '{bangladesh}'),
  ('MM', 'Birmania', 'Asia', '{myanmar,burma}'),
  ('BN', 'Brunéi', 'Asia', '{brunei}'),
  ('BT', 'Bután', 'Asia', '{bhutan}'),
  ('KH', 'Camboya', 'Asia', '{cambodia}'),
  ('QA', 'Catar', 'Asia', '{qatar}'),
  ('CN', 'China', 'Asia', '{china,republica popular china,prc}'),
  ('KP', 'Corea del Norte', 'Asia', '{north korea}'),
  ('KR', 'Corea del Sur', 'Asia', '{south korea,korea,corea}'),
  ('AE', 'Emiratos Árabes Unidos', 'Asia', '{united arab emirates,uae,emiratos arabes unidos}'),
  ('PH', 'Filipinas', 'Asia', '{philippines}'),
  ('GE', 'Georgia', 'Asia', '{georgia}'),
  ('HK', 'Hong Kong', 'Asia', '{hong kong}'),
  ('IN', 'India', 'Asia', '{india}'),
  ('ID', 'Indonesia', 'Asia', '{indonesia}'),
  ('IQ', 'Irak', 'Asia', '{iraq}'),
  ('IR', 'Irán', 'Asia', '{iran}'),
  ('IL', 'Israel', 'Asia', '{israel}'),
  ('JP', 'Japón', 'Asia', '{japan,japon}'),
  ('JO', 'Jordania', 'Asia', '{jordan}'),
  ('KZ', 'Kazajistán', 'Asia', '{kazakhstan}'),
  ('KG', 'Kirguistán', 'Asia', '{kyrgyzstan}'),
  ('KW', 'Kuwait', 'Asia', '{kuwait}'),
  ('LA', 'Laos', 'Asia', '{laos}'),
  ('LB', 'Líbano', 'Asia', '{lebanon,libano}'),
  ('MO', 'Macao', 'Asia', '{macau,macao}'),
  ('MY', 'Malasia', 'Asia', '{malaysia}'),
  ('MV', 'Maldivas', 'Asia', '{maldives}'),
  ('MN', 'Mongolia', 'Asia', '{mongolia}'),
  ('NP', 'Nepal', 'Asia', '{nepal}'),
  ('OM', 'Omán', 'Asia', '{oman}'),
  ('PK', 'Pakistán', 'Asia', '{pakistan}'),
  ('PS', 'Palestina', 'Asia', '{palestine}'),
  ('SG', 'Singapur', 'Asia', '{singapore}'),
  ('SY', 'Siria', 'Asia', '{syria}'),
  ('LK', 'Sri Lanka', 'Asia', '{sri lanka}'),
  ('TH', 'Tailandia', 'Asia', '{thailand}'),
  ('TW', 'Taiwán', 'Asia', '{taiwan}'),
  ('TJ', 'Tayikistán', 'Asia', '{tajikistan}'),
  ('TL', 'Timor Oriental', 'Asia', '{timor-leste,east timor}'),
  ('TM', 'Turkmenistán', 'Asia', '{turkmenistan}'),
  ('TR', 'Turquía', 'Asia', '{turkey,turkiye,turquia}'),
  ('UZ', 'Uzbekistán', 'Asia', '{uzbekistan}'),
  ('VN', 'Vietnam', 'Asia', '{vietnam,viet nam}'),
  ('YE', 'Yemen', 'Asia', '{yemen}'),

  -- África
  ('ZA', 'Sudáfrica', 'África', '{south africa,sudafrica}'),
  ('DZ', 'Argelia', 'África', '{algeria}'),
  ('AO', 'Angola', 'África', '{angola}'),
  ('BJ', 'Benín', 'África', '{benin}'),
  ('BW', 'Botsuana', 'África', '{botswana}'),
  ('BF', 'Burkina Faso', 'África', '{burkina faso}'),
  ('BI', 'Burundi', 'África', '{burundi}'),
  ('CV', 'Cabo Verde', 'África', '{cape verde,cabo verde}'),
  ('CM', 'Camerún', 'África', '{cameroon}'),
  ('TD', 'Chad', 'África', '{chad}'),
  ('KM', 'Comoras', 'África', '{comoros}'),
  ('CG', 'Congo', 'África', '{republic of the congo,congo brazzaville}'),
  ('CD', 'República Democrática del Congo', 'África', '{drc,congo kinshasa,rd congo}'),
  ('CI', 'Costa de Marfil', 'África', '{ivory coast,cote divoire}'),
  ('DJ', 'Yibuti', 'África', '{djibouti}'),
  ('EG', 'Egipto', 'África', '{egypt}'),
  ('ER', 'Eritrea', 'África', '{eritrea}'),
  ('SZ', 'Esuatini', 'África', '{eswatini,swaziland}'),
  ('ET', 'Etiopía', 'África', '{ethiopia}'),
  ('GA', 'Gabón', 'África', '{gabon}'),
  ('GM', 'Gambia', 'África', '{gambia}'),
  ('GH', 'Ghana', 'África', '{ghana}'),
  ('GN', 'Guinea', 'África', '{guinea}'),
  ('GQ', 'Guinea Ecuatorial', 'África', '{equatorial guinea}'),
  ('GW', 'Guinea-Bisáu', 'África', '{guinea-bissau}'),
  ('KE', 'Kenia', 'África', '{kenya}'),
  ('LS', 'Lesoto', 'África', '{lesotho}'),
  ('LR', 'Liberia', 'África', '{liberia}'),
  ('LY', 'Libia', 'África', '{libya}'),
  ('MG', 'Madagascar', 'África', '{madagascar}'),
  ('MW', 'Malaui', 'África', '{malawi}'),
  ('ML', 'Malí', 'África', '{mali}'),
  ('MA', 'Marruecos', 'África', '{morocco}'),
  ('MU', 'Mauricio', 'África', '{mauritius}'),
  ('MR', 'Mauritania', 'África', '{mauritania}'),
  ('MZ', 'Mozambique', 'África', '{mozambique}'),
  ('NA', 'Namibia', 'África', '{namibia}'),
  ('NE', 'Níger', 'África', '{niger}'),
  ('NG', 'Nigeria', 'África', '{nigeria}'),
  ('CF', 'República Centroafricana', 'África', '{central african republic}'),
  ('RW', 'Ruanda', 'África', '{rwanda}'),
  ('ST', 'Santo Tomé y Príncipe', 'África', '{sao tome and principe}'),
  ('SN', 'Senegal', 'África', '{senegal}'),
  ('SC', 'Seychelles', 'África', '{seychelles}'),
  ('SL', 'Sierra Leona', 'África', '{sierra leone}'),
  ('SO', 'Somalia', 'África', '{somalia}'),
  ('SD', 'Sudán', 'África', '{sudan}'),
  ('SS', 'Sudán del Sur', 'África', '{south sudan}'),
  ('TZ', 'Tanzania', 'África', '{tanzania}'),
  ('TG', 'Togo', 'África', '{togo}'),
  ('TN', 'Túnez', 'África', '{tunisia,tunez}'),
  ('UG', 'Uganda', 'África', '{uganda}'),
  ('ZM', 'Zambia', 'África', '{zambia}'),
  ('ZW', 'Zimbabue', 'África', '{zimbabwe}'),

  -- Oceanía
  ('AU', 'Australia', 'Oceanía', '{australia}'),
  ('FJ', 'Fiyi', 'Oceanía', '{fiji}'),
  ('MH', 'Islas Marshall', 'Oceanía', '{marshall islands}'),
  ('SB', 'Islas Salomón', 'Oceanía', '{solomon islands}'),
  ('KI', 'Kiribati', 'Oceanía', '{kiribati}'),
  ('FM', 'Micronesia', 'Oceanía', '{micronesia}'),
  ('NR', 'Nauru', 'Oceanía', '{nauru}'),
  ('NC', 'Nueva Caledonia', 'Oceanía', '{new caledonia}'),
  ('NZ', 'Nueva Zelanda', 'Oceanía', '{new zealand,nueva zelandia}'),
  ('PW', 'Palaos', 'Oceanía', '{palau}'),
  ('PG', 'Papúa Nueva Guinea', 'Oceanía', '{papua new guinea}'),
  ('PF', 'Polinesia Francesa', 'Oceanía', '{french polynesia}'),
  ('WS', 'Samoa', 'Oceanía', '{samoa}'),
  ('TO', 'Tonga', 'Oceanía', '{tonga}'),
  ('TV', 'Tuvalu', 'Oceanía', '{tuvalu}'),
  ('VU', 'Vanuatu', 'Oceanía', '{vanuatu}')
on conflict (codigo) do nothing;

-- =============================================================================
-- Siembra del catálogo de roles y sectores
--
-- Un punto de partida, no una verdad. Se marcan como de sistema para que no se
-- borren de un clic, pero se renombran y se desactivan sin pedir permiso a
-- nadie, y añadir los propios es la operación normal de esta pantalla.
-- =============================================================================
insert into public.contacto_catalogo (tipo, codigo, etiqueta, descripcion, orden, es_sistema) values
  ('rol', 'directivo', 'Directivo',
   'Rector, vicerrector, decano o equivalente con capacidad de decisión.', 1, true),
  ('rol', 'coordinador_internacional', 'Coordinador de Internacionalización',
   'La contraparte habitual en la oficina de relaciones internacionales.', 2, true),
  ('rol', 'docente', 'Docente', 'Profesorado con el que se articula movilidad o docencia.', 3, true),
  ('rol', 'investigador', 'Investigador',
   'Contraparte en proyectos, publicaciones conjuntas y redes de investigación.', 4, true),
  ('rol', 'gestor', 'Gestor de proyectos',
   'Quien opera convocatorias, convenios y cooperación.', 5, true),
  ('rol', 'administrativo', 'Administrativo',
   'Apoyo en trámites, visados, convenios y documentación.', 6, true),
  ('rol', 'estudiante', 'Estudiante', 'Movilidad entrante o saliente.', 7, true),
  ('rol', 'egresado', 'Egresado', 'Red de egresados en el exterior.', 8, true),
  ('rol', 'consultor', 'Consultor', 'Asesoría externa contratada o aliada.', 9, true),
  ('rol', 'otro', 'Otro', 'Cuando ninguno de los anteriores describe al contacto.', 99, true),

  ('sector', 'educacion_superior', 'Educación superior',
   'Universidades e instituciones de educación superior.', 1, true),
  ('sector', 'investigacion', 'Investigación y ciencia',
   'Centros e institutos de investigación, laboratorios.', 2, true),
  ('sector', 'gobierno', 'Gobierno',
   'Ministerios, embajadas, consulados y agencias públicas.', 3, true),
  ('sector', 'cooperacion', 'Cooperación internacional',
   'Agencias de cooperación, programas de becas y fondos multilaterales.', 4, true),
  ('sector', 'empresa', 'Empresa privada',
   'Sector productivo, prácticas profesionales y transferencia.', 5, true),
  ('sector', 'ong', 'ONG y tercer sector',
   'Organizaciones no gubernamentales y fundaciones.', 6, true),
  ('sector', 'salud', 'Salud', 'Hospitales, clínicas y sistemas de salud.', 7, true),
  ('sector', 'cultura', 'Cultura', 'Instituciones culturales, artísticas y de idiomas.', 8, true),
  ('sector', 'organismo_multilateral', 'Organismo multilateral',
   'Unesco, OEA, BID, Banco Mundial y equivalentes.', 9, true),
  ('sector', 'otro', 'Otro', 'Cuando ninguno de los anteriores describe a la organización.', 99, true)
on conflict (tipo, codigo) do nothing;

-- =============================================================================
-- Permisos del módulo
--
-- Tres y no dos. `verificar` va aparte de `administrar` porque cada consulta a
-- la API de verificación CUESTA: un plan tiene un número finito de créditos al
-- mes, y quien puede corregir una errata en un cargo no tiene por qué poder
-- agotarlos con una carga de cinco mil filas.
-- =============================================================================
insert into public.permisos (codigo, modulo, accion, descripcion) values
  ('internacionalizacion.ver', 'internacionalizacion', 'ver',
   'Consultar la libreta de contactos internacionales'),
  ('internacionalizacion.administrar', 'internacionalizacion', 'administrar',
   'Crear, editar e importar contactos y mantener el catálogo de roles y sectores'),
  ('internacionalizacion.verificar', 'internacionalizacion', 'verificar',
   'Verificar con el proveedor externo si un correo existe y está activo (consume créditos)')
on conflict (codigo) do update set descripcion = excluded.descripcion;

-- El administrador conserva el catálogo completo. Un permiso nuevo no se
-- concede solo: sin esto, quien administra el portal no vería su propio módulo.
insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from public.roles r
cross join public.permisos p
where public.fn_normalizar(r.nombre) = 'administrador del sistema'
  and p.codigo like 'internacionalizacion.%'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- El rol de Internacionalización
--
-- Es el dueño del módulo: mantiene la libreta, importa y gasta los créditos de
-- verificación. No se le da nada más — ni actividades, ni solicitudes, ni
-- usuarios—: un rol que nace con todo encendido no es un rol, es otro
-- administrador con otro nombre.
-- -----------------------------------------------------------------------------
insert into public.roles (nombre, descripcion, puede_leer, puede_editar, puede_eliminar,
                          nivel_acceso, es_sistema)
values ('Internacionalización',
        'Mantiene la libreta de contactos internacionales, su carga masiva y la verificación de correos.',
        true, true, false, 'limitado', true)
on conflict do nothing;

insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from public.roles r
cross join public.permisos p
where public.fn_normalizar(r.nombre) = 'internacionalizacion'
  and p.codigo in (
    'internacionalizacion.ver',
    'internacionalizacion.administrar',
    'internacionalizacion.verificar',
    -- Ve el panel de inicio: sin esto entraría al portal por una puerta que da
    -- a «no tienes acceso».
    'bi.consultar'
  )
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- La lista la ve todo el mundo
--
-- Es un requisito del módulo, no un descuido: el directorio existe para que
-- cualquiera del portal pueda mirar a quién conoce la Universidad fuera. Se
-- concede sólo LEER; crear, importar y verificar siguen siendo de quien
-- administra el módulo.
-- -----------------------------------------------------------------------------
insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, 'internacionalizacion.ver'
from public.roles r
where r.es_sistema
on conflict do nothing;

-- =============================================================================
-- Los jueces de la carga
--
-- Cada comprobación es una función que devuelve el PROBLEMA en castellano, o
-- nulo si no lo hay. Así el validador es una lista de coalesce en vez de un
-- árbol de condiciones, y el mensaje que ve quien importa se escribe una sola
-- vez, junto a la regla que lo provoca.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Capitalización
--
-- Sólo actúa cuando el texto viene ENTERO en mayúsculas o entero en minúsculas,
-- que es como llegan las hojas exportadas de otros sistemas. Si quien escribió
-- ya mezcló mayúsculas y minúsculas, se respeta tal cual: puede ser «McDonald»,
-- «van der Berg» o unas siglas dentro del cargo, y «corregirlo» sería estropear
-- un dato que estaba bien.
-- -----------------------------------------------------------------------------
create or replace function public.fn_capitalizar(p_texto text)
returns text
language sql
immutable
as $fn$
  with limpio as (
    select btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')) as t
  )
  select case
    when l.t = '' then null
    when l.t <> upper(l.t) and l.t <> lower(l.t) then l.t
    else (
      select string_agg(
        -- Las partículas van en minúscula salvo que abran el nombre: «Juan de
        -- la Cruz», pero «De la Cruz, Juan».
        case
          when u.orden > 1 and u.palabra in (
            'de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos',
            'van', 'von', 'der', 'di', 'du', 'le', 'bin', 'al'
          ) then u.palabra
          else initcap(u.palabra)
        end,
        ' ' order by u.orden
      )
      from unnest(regexp_split_to_array(lower(l.t), ' ')) with ordinality as u(palabra, orden)
    )
  end
  from limpio l;
$fn$;

comment on function public.fn_capitalizar(text) is
  'Reescribe en mayúsculas y minúsculas sólo si el texto venía todo en mayúsculas o todo en minúsculas. Respeta lo que ya estaba bien escrito.';

-- -----------------------------------------------------------------------------
-- ¿Esto parece un nombre de persona?
--
-- No se comprueba contra un diccionario —los nombres del mundo no caben en
-- uno—, sino contra lo que delata que la celda no es un nombre: que esté vacía,
-- que traiga números, que traiga símbolos de código, o que sea una sola palabra
-- donde debería haber nombre y apellido.
-- -----------------------------------------------------------------------------
create or replace function public.fn_problema_nombre(p_texto text)
returns text
language sql
immutable
as $fn$
  with t as (select btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')) as v)
  select case
    when t.v = '' then 'Falta el nombre completo.'
    when length(t.v) < 3 then 'El nombre es demasiado corto para ser un nombre completo.'
    when length(t.v) > 160 then 'El nombre supera los 160 caracteres: revisa si se mezcló con otra columna.'
    when t.v ~ '[0-9]' then 'El nombre no puede contener números.'
    when t.v ~ '[@!#$%^&*_=+<>{}()\[\]\\/|"]' then
      'El nombre contiene símbolos que no corresponden a un nombre.'
    when array_length(regexp_split_to_array(t.v, ' '), 1) < 2 then
      'El nombre debe incluir al menos nombre y apellido.'
    else null
  end
  from t;
$fn$;

-- -----------------------------------------------------------------------------
-- ¿Esto parece un cargo?
-- -----------------------------------------------------------------------------
create or replace function public.fn_problema_cargo(p_texto text)
returns text
language sql
immutable
as $fn$
  with t as (select btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')) as v)
  select case
    when t.v = '' then 'Falta el cargo.'
    when length(t.v) < 2 then 'El cargo es demasiado corto.'
    when length(t.v) > 120 then 'El cargo supera los 120 caracteres: revisa si se mezcló con otra columna.'
    when t.v like '%@%' then 'El cargo parece contener un correo: revisa si las columnas están corridas.'
    when t.v ~ '^[0-9[:space:][:punct:]]+$' then 'El cargo no puede ser sólo números o signos.'
    else null
  end
  from t;
$fn$;

-- -----------------------------------------------------------------------------
-- ¿Esto parece un correo?
--
-- Estructura y nada más. Que el buzón EXISTA es otra pregunta, se le hace a un
-- proveedor externo y cuesta dinero: vive en la Edge Function, no aquí.
-- -----------------------------------------------------------------------------
create or replace function public.fn_problema_correo(p_texto text)
returns text
language sql
immutable
as $fn$
  with t as (select btrim(coalesce(p_texto, '')) as v)
  select case
    when t.v = '' then 'Falta el correo.'
    when t.v ~ '\s' then 'El correo no puede contener espacios.'
    when t.v !~ '@' then 'El correo no tiene arroba.'
    when (length(t.v) - length(replace(t.v, '@', ''))) > 1 then
      'El correo tiene más de una arroba: puede que haya dos direcciones en la misma celda.'
    when t.v like '%..%' then 'El correo tiene dos puntos seguidos.'
    when split_part(t.v, '@', 1) ~ '^\.|\.$' then
      'El correo no puede empezar ni terminar el usuario con un punto.'
    when t.v !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' then
      'El correo no tiene una estructura válida.'
    else null
  end
  from t;
$fn$;

-- -----------------------------------------------------------------------------
-- Resolución de país
--
-- Por nombre, por código ISO o por alias. Lo que no se hace es adivinar: si no
-- coincide con ninguno, la fila da error y se OFRECE el parecido, que es muy
-- distinto de aplicarlo por su cuenta.
-- -----------------------------------------------------------------------------
create or replace function public.fn_pais_codigo(p_texto text)
returns text
language sql
stable
as $fn$
  select p.codigo
  from public.paises p
  where p.activo
    and (
      public.fn_normalizar(p.nombre) = public.fn_normalizar(coalesce(p_texto, ''))
      or p.codigo = upper(btrim(coalesce(p_texto, '')))
      or exists (
        select 1 from unnest(p.alias) a
        where public.fn_normalizar(a) = public.fn_normalizar(coalesce(p_texto, ''))
      )
    )
  limit 1;
$fn$;

create or replace function public.fn_pais_sugerencia(p_texto text)
returns text
language sql
stable
-- `similarity` la trae pg_trgm, que según la instalación vive en `public` o en
-- `extensions`. Se nombran las dos: un search_path que se queda corto sólo falla
-- en el servidor donde la extensión está en el otro sitio.
set search_path = public, extensions
as $fn$
  select p.nombre
  from public.paises p
  where p.activo
    and similarity(public.fn_normalizar(p.nombre), public.fn_normalizar(coalesce(p_texto, ''))) > 0.4
  order by similarity(public.fn_normalizar(p.nombre), public.fn_normalizar(coalesce(p_texto, ''))) desc
  limit 1;
$fn$;

-- -----------------------------------------------------------------------------
-- Resolución de rol y sector
-- -----------------------------------------------------------------------------
create or replace function public.fn_catalogo_id(
  p_tipo  public.tipo_catalogo_contacto,
  p_texto text
)
returns uuid
language sql
stable
as $fn$
  select c.id
  from public.contacto_catalogo c
  where c.tipo = p_tipo
    and c.activo
    and (
      c.codigo = lower(btrim(coalesce(p_texto, '')))
      or public.fn_normalizar(c.etiqueta) = public.fn_normalizar(coalesce(p_texto, ''))
    )
  limit 1;
$fn$;

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
    and similarity(public.fn_normalizar(c.etiqueta), public.fn_normalizar(coalesce(p_texto, ''))) > 0.35
  order by similarity(public.fn_normalizar(c.etiqueta), public.fn_normalizar(coalesce(p_texto, ''))) desc
  limit 1;
$fn$;

grant execute on function public.fn_pais_codigo(text) to authenticated;
grant execute on function public.fn_pais_sugerencia(text) to authenticated;
grant execute on function public.fn_catalogo_id(public.tipo_catalogo_contacto, text) to authenticated;
grant execute on function public.fn_catalogo_sugerencia(public.tipo_catalogo_contacto, text) to authenticated;
grant execute on function public.fn_capitalizar(text) to authenticated;
grant execute on function public.fn_problema_nombre(text) to authenticated;
grant execute on function public.fn_problema_cargo(text) to authenticated;
grant execute on function public.fn_problema_correo(text) to authenticated;

-- =============================================================================
-- Importación
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Normalizador de fila
--
-- Acepta varios nombres para la misma columna, y en dos idiomas. No es
-- indulgencia gratuita: una libreta de contactos internacionales se alimenta de
-- listas de asistentes a congresos y de directorios de universidades socias,
-- que llegan con las cabeceras en inglés tan a menudo como en español.
--
-- La validación y la importación llaman a ESTA función, las dos. Es la única
-- forma de que la previsualización no mienta: si el que valida y el que escribe
-- limpiaran el texto por su cuenta, se aprobaría una cosa y se guardaría otra.
-- -----------------------------------------------------------------------------
create or replace function public.fn_normalizar_fila_contacto(p_fila jsonb)
returns jsonb
language sql
immutable
parallel safe
as $fn$
  select jsonb_build_object(
    -- El nombre llega de dos maneras: en una columna, o partido en nombre y
    -- apellido. Las plantillas de nominación que usan las oficinas de
    -- internacionalización lo parten SIEMPRE, así que unirlo aquí no es un
    -- extra: es la diferencia entre poder importar el archivo o no.
    'nombre_completo', nullif(btrim(coalesce(
      nullif(btrim(coalesce(
        p_fila ->> 'nombre_completo', p_fila ->> 'nombre', p_fila ->> 'nombres',
        p_fila ->> 'nombre_y_apellidos', p_fila ->> 'nombre_del_contacto',
        p_fila ->> 'contacto', p_fila ->> 'full_name', p_fila ->> 'name', '')), ''),
      nullif(btrim(concat_ws(' ',
        nullif(btrim(coalesce(p_fila ->> 'first_name', p_fila ->> 'nombre_s', '')), ''),
        nullif(btrim(coalesce(p_fila ->> 'last_name', p_fila ->> 'apellidos',
                              p_fila ->> 'apellido', '')), '')
      )), ''),
      '')), ''),
    'cargo', nullif(btrim(coalesce(
      p_fila ->> 'cargo', p_fila ->> 'puesto', p_fila ->> 'posicion',
      p_fila ->> 'cargo_posicion', p_fila ->> 'position', p_fila ->> 'job_title',
      p_fila ->> 'title', '')), ''),
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
    'telefono', nullif(btrim(coalesce(
      p_fila ->> 'telefono', p_fila ->> 'tel', p_fila ->> 'celular',
      p_fila ->> 'movil', p_fila ->> 'phone', p_fila ->> 'whatsapp',
      p_fila ->> 'phone_optional', '')), ''),
    'notas', nullif(btrim(coalesce(
      p_fila ->> 'notas', p_fila ->> 'observaciones', p_fila ->> 'comentarios',
      p_fila ->> 'notes',
      nullif(btrim(concat_ws(' · ',
        nullif(btrim(coalesce(p_fila ->> 'department', p_fila ->> 'departamento', '')), ''),
        nullif(btrim(coalesce(p_fila ->> 'subject', p_fila ->> 'area', '')), '')
      )), ''),
      '')), '')
  );
$fn$;

-- -----------------------------------------------------------------------------
-- Previsualización
--
-- No escribe nada. Dice, fila a fila, qué va a pasar y qué está mal ANTES de
-- confirmar. Un importador que sólo informa al terminar convierte cada error en
-- una limpieza a posteriori.
--
-- Detecta además los duplicados DENTRO del archivo, que es el error que más se
-- repite en estas listas: la misma persona en dos congresos, con el cargo
-- escrito distinto. Sin esto, la segunda fila pisaría en silencio a la primera
-- y el usuario vería «2 creados» habiendo creado uno.
-- -----------------------------------------------------------------------------
create or replace function public.fn_validar_importacion_contactos(p_filas jsonb)
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
      public.fn_catalogo_id('sector', c.f ->> 'sector')    as sector_id
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
      -- El primer problema de la lista es el que se cuenta. Enseñar cinco a la
      -- vez para una misma celda no ayuda a arreglar ninguno.
      coalesce(
        e.p_nombre,
        e.p_cargo,
        e.p_correo,
        -- País, rol y sector se COMPRUEBAN, pero no se exigen. Es la diferencia
        -- entre «está mal escrito» y «no viene»: lo primero es un error que hay
        -- que corregir antes de guardar nada, y lo segundo es una clasificación
        -- que falta y se puede completar después desde la ficha. Exigirlos
        -- dejaría fuera las plantillas de nominación que usan las oficinas de
        -- internacionalización, que no traen columna de rol.
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
          when e.pais_texto is null or e.rol_texto is null or e.sector_texto is null then
            'Se importará sin ' || concat_ws(', ',
              case when e.pais_texto is null then 'país' end,
              case when e.rol_texto is null then 'rol' end,
              case when e.sector_texto is null then 'sector' end
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

comment on function public.fn_validar_importacion_contactos(jsonb) is
  'Previsualiza una carga de contactos: qué se crea, qué se actualiza y qué está mal, sin escribir nada.';

grant execute on function public.fn_validar_importacion_contactos(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Importación
--
-- La clave de coincidencia es el correo en minúsculas. Y nunca se REESCRIBE el
-- correo de una fila existente: se emparejó por él, así que ya es el mismo, y
-- tocarlo dispararía el reinicio de la verificación por nada.
-- -----------------------------------------------------------------------------
create or replace function public.fn_importar_contactos(
  p_filas jsonb,
  p_modo  text default 'mezclar'      -- 'mezclar' | 'solo_crear' | 'solo_actualizar'
)
returns table (creados int, actualizados int, omitidos int)
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_fila     jsonb;
  v_f        jsonb;
  v_id       uuid;
  v_pais     text;
  v_rol      uuid;
  v_sector   uuid;
  v_creados  int := 0;
  v_actual   int := 0;
  v_omitidos int := 0;
begin
  if not public.fn_tengo_permiso('internacionalizacion.administrar') then
    raise exception 'No tienes permiso para importar contactos.'
      using errcode = 'insufficient_privilege';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_f := public.fn_normalizar_fila_contacto(v_fila);

    v_pais   := public.fn_pais_codigo(v_f ->> 'pais');
    v_rol    := public.fn_catalogo_id('rol', v_f ->> 'rol');
    v_sector := public.fn_catalogo_id('sector', v_f ->> 'sector');

    -- Las filas con problema ya se le enseñaron a quien confirmó; aquí se
    -- saltan en silencio en vez de abortar el lote. Importar cuatrocientos
    -- contactos y perderlos por dos celdas mal escritas no ayuda a nadie.
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
        nombre_completo, cargo, correo, pais_codigo, rol_id, sector_id,
        organizacion, telefono, notas, creado_por
      ) values (
        public.fn_capitalizar(v_f ->> 'nombre_completo'),
        public.fn_capitalizar(v_f ->> 'cargo'),
        v_f ->> 'correo',
        v_pais, v_rol, v_sector,
        v_f ->> 'organizacion',
        v_f ->> 'telefono',
        v_f ->> 'notas',
        auth.uid()
      );
      v_creados := v_creados + 1;
    else
      -- Los seis campos del núcleo los manda la hoja: si se está reimportando
      -- el directorio corregido, no tendría sentido conservar lo viejo. Los
      -- complementarios van con coalesce, porque una celda vacía ahí significa
      -- «no lo sé», no «bórralo».
      update public.contactos_internacionales c
      set nombre_completo = public.fn_capitalizar(v_f ->> 'nombre_completo'),
          cargo           = public.fn_capitalizar(v_f ->> 'cargo'),
          -- La clasificación también va con coalesce: si la hoja no trae la
          -- columna de rol, reimportar el directorio no puede desclasificar a
          -- quien ya estaba clasificado a mano.
          pais_codigo     = coalesce(v_pais, c.pais_codigo),
          rol_id          = coalesce(v_rol, c.rol_id),
          sector_id       = coalesce(v_sector, c.sector_id),
          organizacion    = coalesce(v_f ->> 'organizacion', c.organizacion),
          telefono        = coalesce(v_f ->> 'telefono', c.telefono),
          notas           = coalesce(v_f ->> 'notas', c.notas)
      where c.id = v_id;
      v_actual := v_actual + 1;
    end if;
  end loop;

  return query select v_creados, v_actual, v_omitidos;
end;
$fn$;

comment on function public.fn_importar_contactos(jsonb, text) is
  'Crea o actualiza contactos desde una hoja de cálculo, emparejando por correo. Una celda vacía nunca borra un dato existente.';

grant execute on function public.fn_importar_contactos(jsonb, text) to authenticated;

-- =============================================================================
-- La verificación del buzón
--
-- La pregunta «¿este correo existe y está activo?» no se puede responder desde
-- aquí: hay que hablar con quien tiene los servidores delante. Eso lo hace la
-- Edge Function `verificar-correo` contra AbstractAPI.
--
-- Lo que SÍ vive aquí es la INTERPRETACIÓN de la respuesta. La función de abajo
-- recibe el JSON tal como llegó y decide el veredicto. Está en la base y no en
-- la Edge Function a propósito: es la regla de negocio —qué contamos como
-- válido, qué como riesgoso— y tiene que ser la misma se llame desde donde se
-- llame. Una copia de esta lógica en TypeScript sería una segunda opinión
-- esperando a discrepar.
-- =============================================================================

-- AbstractAPI envuelve cada booleano en {"value": true, "text": "TRUE"}.
create or replace function public.fn_jsonb_bool(p_json jsonb, p_clave text)
returns boolean
language sql
immutable
as $fn$
  select case jsonb_typeof(p_json -> p_clave)
    when 'object'  then (p_json -> p_clave ->> 'value')::boolean
    when 'boolean' then (p_json ->> p_clave)::boolean
    else null
  end;
$fn$;

create or replace function public.fn_aplicar_verificacion(
  p_contacto_id uuid,
  p_respuesta   jsonb,
  p_error       text default null,
  p_actor       uuid default null
)
returns table (estado public.estado_verificacion, mensaje text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_formato     boolean;
  v_smtp        boolean;
  v_mx          boolean;
  v_desechable  boolean;
  v_gratuito    boolean;
  v_generico    boolean;
  v_acepta_todo boolean;
  v_entregable  text;
  v_calidad     numeric;
  v_correccion  text;
  v_estado      public.estado_verificacion;
  v_mensaje     text;
begin
  -- ---------------------------------------------------------------------------
  -- No se pudo preguntar
  --
  -- Un fallo de red o una cuota agotada NO son un veredicto sobre el correo. Si
  -- el contacto ya tenía uno, se conserva —y se conserva su fecha, que es lo que
  -- lo data—; sólo se anota qué pasó en el último intento. Degradar a «error» un
  -- correo que ayer era válido sería castigar al contacto por un problema
  -- nuestro.
  -- ---------------------------------------------------------------------------
  if p_error is not null then
    update public.contactos_internacionales c
    set verificacion_mensaje = p_error,
        verificacion_estado = case
          when c.verificacion_estado = 'sin_verificar' then 'error'
          else c.verificacion_estado
        end
    where c.id = p_contacto_id
    returning c.verificacion_estado, c.verificacion_mensaje into v_estado, v_mensaje;

    return query select v_estado, v_mensaje;
    return;
  end if;

  v_formato     := public.fn_jsonb_bool(p_respuesta, 'is_valid_format');
  v_smtp        := public.fn_jsonb_bool(p_respuesta, 'is_smtp_valid');
  v_mx          := public.fn_jsonb_bool(p_respuesta, 'is_mx_found');
  v_desechable  := public.fn_jsonb_bool(p_respuesta, 'is_disposable_email');
  v_gratuito    := public.fn_jsonb_bool(p_respuesta, 'is_free_email');
  v_generico    := public.fn_jsonb_bool(p_respuesta, 'is_role_email');
  v_acepta_todo := public.fn_jsonb_bool(p_respuesta, 'is_catchall_email');
  v_entregable  := upper(coalesce(p_respuesta ->> 'deliverability', 'UNKNOWN'));
  v_calidad     := nullif(p_respuesta ->> 'quality_score', '')::numeric;
  v_correccion  := nullif(btrim(coalesce(p_respuesta ->> 'autocorrect', '')), '');

  -- ---------------------------------------------------------------------------
  -- El veredicto, de lo más concluyente a lo menos
  -- ---------------------------------------------------------------------------
  if v_formato is false then
    v_estado  := 'invalido';
    v_mensaje := 'La dirección no tiene una estructura de correo válida.';

  elsif v_entregable = 'UNDELIVERABLE' then
    v_estado  := 'invalido';
    v_mensaje := case
      when v_mx is false then 'El dominio no tiene servidor de correo: nada de lo que se envíe llegará.'
      else 'El servidor rechaza esta dirección: el buzón no existe.'
    end;

  elsif v_desechable then
    -- Entregable, sí, pero a un buzón que se autodestruye. Como contacto
    -- institucional no vale nada.
    v_estado  := 'riesgoso';
    v_mensaje := 'Es un buzón temporal, de usar y tirar. No sirve como contacto estable.';

  elsif v_acepta_todo then
    v_estado  := 'riesgoso';
    v_mensaje := 'El dominio acepta cualquier dirección, así que no se puede confirmar que este buzón exista.';

  elsif v_entregable = 'DELIVERABLE' then
    v_estado  := 'valido';
    v_mensaje := case
      when v_generico then 'El buzón acepta correo, pero es genérico: llega a una oficina, no a una persona.'
      else 'El buzón existe y acepta correo.'
    end;

  elsif v_entregable = 'RISKY' then
    v_estado  := 'riesgoso';
    v_mensaje := 'El proveedor lo marca como arriesgado: puede rebotar.';

  else
    v_estado  := 'riesgoso';
    v_mensaje := 'El servidor no dio una respuesta concluyente. Conviene reintentarlo más adelante.';
  end if;

  if v_correccion is not null then
    v_mensaje := v_mensaje || ' El proveedor sugiere «' || v_correccion || '».';
  end if;

  update public.contactos_internacionales
  set verificacion_estado  = v_estado,
      verificacion_mensaje = v_mensaje,
      verificacion_en      = now(),
      verificacion_por     = p_actor,
      entregable     = v_entregable,
      calidad        = v_calidad,
      formato_valido = v_formato,
      buzon_smtp     = v_smtp,
      dominio_mx     = v_mx,
      es_desechable  = v_desechable,
      es_gratuito    = v_gratuito,
      es_generico    = v_generico,
      acepta_todo    = v_acepta_todo,
      correccion     = v_correccion,
      verificacion_detalle = p_respuesta
  where id = p_contacto_id;

  return query select v_estado, v_mensaje;
end;
$fn$;

comment on function public.fn_aplicar_verificacion(uuid, jsonb, text, uuid) is
  'Interpreta la respuesta del verificador externo y sella el veredicto en el contacto. La regla de qué es válido vive aquí, no en el cliente.';

-- Sólo la Edge Function, que es quien habla con el proveedor. Si esto fuera
-- llamable desde el navegador, cualquiera podría sellar «válido» un correo sin
-- haber preguntado a nadie.
revoke all on function public.fn_aplicar_verificacion(uuid, jsonb, text, uuid) from public;
grant execute on function public.fn_aplicar_verificacion(uuid, jsonb, text, uuid) to service_role;

-- =============================================================================
-- Vista de consulta
--
-- Resuelve país, rol, sector y las dos personas —quien lo creó y quien lo
-- verificó— en una sola consulta. La alternativa es que cada pantalla haga sus
-- joins, y que acaben discrepando en cómo nombran lo mismo.
-- =============================================================================
create or replace view public.v_contactos_internacionales
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

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.paises enable row level security;
alter table public.contacto_catalogo enable row level security;
alter table public.contactos_internacionales enable row level security;

-- Los países los ve cualquiera con sesión: son un catálogo de referencia, no
-- información del negocio. Nadie los escribe desde la aplicación.
drop policy if exists "paises_lectura" on public.paises;
create policy "paises_lectura" on public.paises
  for select to authenticated using (true);

-- El catálogo también se lee libremente —hace falta para pintar los filtros—,
-- pero lo mantiene quien administra el módulo.
drop policy if exists "catalogo_lectura" on public.contacto_catalogo;
create policy "catalogo_lectura" on public.contacto_catalogo
  for select to authenticated using (true);

drop policy if exists "catalogo_alta" on public.contacto_catalogo;
create policy "catalogo_alta" on public.contacto_catalogo
  for insert to authenticated
  with check (public.fn_tengo_permiso('internacionalizacion.administrar'));

drop policy if exists "catalogo_modificacion" on public.contacto_catalogo;
create policy "catalogo_modificacion" on public.contacto_catalogo
  for update to authenticated
  using (public.fn_tengo_permiso('internacionalizacion.administrar'))
  with check (public.fn_tengo_permiso('internacionalizacion.administrar'));

-- Un valor de fábrica no se borra: hay contactos apuntando a él. Desactivarlo,
-- que es lo que de verdad se quiere, sigue siendo un update.
drop policy if exists "catalogo_baja" on public.contacto_catalogo;
create policy "catalogo_baja" on public.contacto_catalogo
  for delete to authenticated
  using (public.fn_tengo_permiso('internacionalizacion.administrar') and not es_sistema);

drop policy if exists "contactos_lectura" on public.contactos_internacionales;
create policy "contactos_lectura" on public.contactos_internacionales
  for select to authenticated using (public.fn_tengo_permiso('internacionalizacion.ver'));

drop policy if exists "contactos_alta" on public.contactos_internacionales;
create policy "contactos_alta" on public.contactos_internacionales
  for insert to authenticated
  with check (public.fn_tengo_permiso('internacionalizacion.administrar'));

drop policy if exists "contactos_modificacion" on public.contactos_internacionales;
create policy "contactos_modificacion" on public.contactos_internacionales
  for update to authenticated
  using (public.fn_tengo_permiso('internacionalizacion.administrar'))
  with check (public.fn_tengo_permiso('internacionalizacion.administrar'));

-- Borrar un contacto se reserva a la administración. Lo normal es marcarlo
-- inactivo: un contacto que dejó el cargo sigue siendo parte del historial de
-- con quién se habló.
drop policy if exists "contactos_baja" on public.contactos_internacionales;
create policy "contactos_baja" on public.contactos_internacionales
  for delete to authenticated using (public.fn_soy_admin());

-- =============================================================================
-- El módulo entra en el menú
--
-- El desplazamiento de los grupos que ya existían va atado a que el grupo se
-- haya creado DE VERDAD en esta pasada. Como sentencia suelta, volver a aplicar
-- la migración movería el orden que el administrador hubiera dejado en Menú y
-- Navegación sin que nada lo justificara.
-- =============================================================================
with nuevo as (
  insert into public.menu_grupos (codigo, titulo, orden, es_sistema)
  values ('internacionalizacion', 'Internacionalización', 3, true)
  on conflict (codigo) do nothing
  returning codigo
)
update public.menu_grupos g
set orden = g.orden + 1
where exists (select 1 from nuevo)
  and g.codigo in ('operacion', 'administracion');

insert into public.menu_entradas
  (codigo, grupo_codigo, etiqueta, ruta, icono, permiso_codigo, orden, es_sistema)
values
  ('contactos-internacionales', 'internacionalizacion', 'Contactos',
   '/internacionalizacion/contactos', 'Contact', 'internacionalizacion.ver', 1, true),
  ('contactos-importar', 'internacionalizacion', 'Importar Contactos',
   '/internacionalizacion/importar', 'Database', 'internacionalizacion.administrar', 2, true),
  ('contactos-verificacion', 'internacionalizacion', 'Verificación de Correos',
   '/internacionalizacion/verificacion', 'MailCheck', 'internacionalizacion.verificar', 3, true),
  ('contactos-catalogos', 'internacionalizacion', 'Roles y Sectores',
   '/internacionalizacion/catalogos', 'Tags', 'internacionalizacion.administrar', 4, true)
on conflict (codigo) do nothing;
