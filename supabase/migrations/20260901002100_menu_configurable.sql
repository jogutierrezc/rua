-- =============================================================================
-- Rua · 21 — El menú deja de estar escrito en el código
--
-- La navegación vivía en una constante de `AppShell.tsx`. Funcionaba con diez
-- entradas; deja de funcionar en cuanto el portal crece, porque cada vez que
-- Planeación quiere renombrar «Estructura de Actividades», moverla de sitio o
-- esconder un módulo que todavía no usa, hace falta un despliegue.
--
-- A partir de aquí el menú es DATO. El administrador renombra, reordena,
-- agrupa, oculta y crea entradas desde el portal.
--
-- Dónde está la frontera, que es lo que hace que esto sea seguro:
--
--   · La BASE manda la presentación: título, grupo, orden, icono, visibilidad.
--   · El CÓDIGO manda la capacidad: qué rutas existen y qué permiso protege
--     cada una. Eso no se toca desde aquí.
--
-- Por eso `permiso_codigo` se guarda pero no se edita desde la pantalla: tiene
-- que seguir coincidiendo con el permiso que exige el enrutador. Aflojarlo
-- desde el menú no daría acceso a nada — RLS y las guardas de ruta siguen
-- mandando—, sólo pintaría un enlace que lleva a «no tienes permiso». Un menú
-- que promete lo que no cumple es peor que un menú corto.
--
-- Y `visible` es cosmético a conciencia: esconder una entrada no protege nada.
-- Sirve para no ofrecer un módulo que la institución aún no ha puesto en
-- marcha, no para restringir. Restringir es cosa de los roles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Grupos
-- -----------------------------------------------------------------------------
create table if not exists public.menu_grupos (
  codigo     text primary key,
  titulo     text not null,
  orden      smallint not null default 0,
  activo     boolean not null default true,
  -- Los de fábrica no se borran: dejarían sus entradas sin sitio. Renombrarlos
  -- y reordenarlos sí, que es lo que de verdad se quiere hacer.
  es_sistema boolean not null default false,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint menu_grupos_titulo_valido check (length(trim(titulo)) between 2 and 40)
);

comment on table public.menu_grupos is
  'Secciones plegables de la barra lateral. El administrador las ordena y renombra desde el portal.';

-- -----------------------------------------------------------------------------
-- Entradas
--
-- `orden` NO es único, a propósito. Un índice único obligaría a la clásica
-- danza de desplazar todo fuera de rango para renumerar, y a media operación
-- el menú quedaría inconsistente. Con empates se ordena por etiqueta: dos
-- entradas en la misma posición se ven en un orden estable, no aleatorio.
-- -----------------------------------------------------------------------------
create table if not exists public.menu_entradas (
  codigo       text primary key,
  grupo_codigo text not null references public.menu_grupos (codigo) on delete cascade,

  etiqueta text not null,
  ruta     text not null unique,
  icono    text not null default 'Circle',

  -- Espeja el permiso que protege la ruta en el enrutador. No es una regla de
  -- seguridad: decide si el enlace se pinta, nada más.
  permiso_codigo text references public.permisos (codigo) on delete set null,

  orden   smallint not null default 0,
  visible boolean not null default true,

  -- El `end` del NavLink. Sólo lo necesita la raíz, que si no queda activa en
  -- todas las demás rutas.
  coincidencia_exacta boolean not null default false,

  es_sistema boolean not null default false,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint menu_entradas_etiqueta_valida check (length(trim(etiqueta)) between 2 and 40),
  -- Una ruta que el enrutador no conoce es un enlace roto. La forma se
  -- comprueba aquí; que exista de verdad lo garantiza el catálogo del código,
  -- que es de donde la pantalla deja elegir.
  constraint menu_entradas_ruta_valida check (ruta ~ '^/[a-z0-9/-]*$')
);

create index if not exists menu_entradas_grupo_idx
  on public.menu_entradas (grupo_codigo, orden);

comment on table public.menu_entradas is
  'Enlaces de la barra lateral. La base manda la presentación; el permiso espeja el que exige el enrutador y no se edita.';

create trigger trg_menu_grupos_actualizado before update on public.menu_grupos
  for each row execute function public.fn_set_actualizado_en();

create trigger trg_menu_entradas_actualizado before update on public.menu_entradas
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- El menú de hoy, tal cual
--
-- La migración no cambia nada de lo que se ve: reproduce exactamente la
-- constante que había en `AppShell.tsx`. Un cambio de motor no es el momento
-- de cambiar también el resultado; si el menú apareciera distinto al desplegar,
-- nadie sabría si es el rediseño o un fallo.
-- -----------------------------------------------------------------------------
insert into public.menu_grupos (codigo, titulo, orden, es_sistema) values
  ('analisis',       'Análisis',       1, true),
  ('operacion',      'Operación',      2, true),
  ('administracion', 'Administración', 3, true)
on conflict (codigo) do nothing;

insert into public.menu_entradas
  (codigo, grupo_codigo, etiqueta, ruta, icono, permiso_codigo, orden, coincidencia_exacta, es_sistema)
values
  ('bi',           'analisis',       'Inteligencia de Negocios',  '/',            'ChartNoAxesCombined', 'bi.consultar',          1, true,  true),
  ('solicitudes',  'operacion',      'Solicitudes',               '/solicitudes', 'Inbox',               'solicitudes.crear',     1, false, true),
  ('actividades',  'operacion',      'Estructura de Actividades', '/actividades', 'Network',             'actividades.ver',       2, false, true),
  ('periodo',      'operacion',      'Actividades del Periodo',   '/periodo',     'CalendarClock',       'actividades.ver',       3, false, true),
  ('usuarios',     'administracion', 'Usuarios',                  '/usuarios',    'Users',               'usuarios.ver',          1, false, true),
  ('roles',        'administracion', 'Roles y Permisos',          '/roles',       'ShieldCheck',         'roles.administrar',     2, false, true),
  ('periodos',     'administracion', 'Periodos Académicos',       '/periodos',    'CalendarCog',         'periodos.administrar',  3, false, true),
  ('flujo',        'administracion', 'Flujo de Validación',       '/flujo',       'GitBranch',           'roles.administrar',     4, false, true),
  ('correo',       'administracion', 'Notificaciones',            '/correo',      'Mail',                'roles.administrar',     5, false, true),
  ('menu',         'administracion', 'Menú y Navegación',         '/menu',        'PanelLeft',           'roles.administrar',     6, false, true),
  ('auditoria',    'administracion', 'Bitácora',                  '/auditoria',   'FileClock',           'auditoria.consultar',   7, false, true)
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- RLS
--
-- Lee cualquier usuario activo: sin menú no hay aplicación. Escribe sólo quien
-- administra. Y las entradas de fábrica no se borran, sólo se ocultan: borrar
-- «Solicitudes» dejaría la ruta viva y sin forma de llegar a ella.
-- -----------------------------------------------------------------------------
alter table public.menu_grupos enable row level security;
alter table public.menu_entradas enable row level security;

create policy "menu_grupos_lectura" on public.menu_grupos
  for select to authenticated using (public.fn_estoy_activo());

create policy "menu_grupos_alta" on public.menu_grupos
  for insert to authenticated with check (public.fn_soy_admin());

create policy "menu_grupos_modificacion" on public.menu_grupos
  for update to authenticated
  using (public.fn_soy_admin()) with check (public.fn_soy_admin());

create policy "menu_grupos_baja" on public.menu_grupos
  for delete to authenticated using (public.fn_soy_admin() and not es_sistema);

create policy "menu_entradas_lectura" on public.menu_entradas
  for select to authenticated using (public.fn_estoy_activo());

create policy "menu_entradas_alta" on public.menu_entradas
  for insert to authenticated with check (public.fn_soy_admin());

create policy "menu_entradas_modificacion" on public.menu_entradas
  for update to authenticated
  using (public.fn_soy_admin()) with check (public.fn_soy_admin());

create policy "menu_entradas_baja" on public.menu_entradas
  for delete to authenticated using (public.fn_soy_admin() and not es_sistema);

-- -----------------------------------------------------------------------------
-- Un grupo sin entradas visibles no se pinta; uno vacío tampoco estorba.
-- Se deja que exista igualmente: es el paso natural para «crear el grupo y
-- luego mover entradas dentro».
-- -----------------------------------------------------------------------------
