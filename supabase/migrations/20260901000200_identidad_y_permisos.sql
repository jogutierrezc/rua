-- =============================================================================
-- Rua · 02 — Identidad, organización, roles y permisos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vicerrectorías / unidades organizativas
-- -----------------------------------------------------------------------------
create table public.vicerrectorias (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  nombre         text not null,
  descripcion    text,
  estado         public.estado_registro not null default 'activo',
  orden          smallint not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint vicerrectorias_codigo_formato check (codigo ~ '^[A-Z0-9-]{2,20}$')
);

comment on table public.vicerrectorias is
  'Unidades organizativas de alto nivel (Académica, Investigación, Extensión, Financiera, Gestión Humana).';

-- -----------------------------------------------------------------------------
-- Catálogo de permisos granulares.
-- Un permiso es una capacidad concreta: "actividades.crear", "usuarios.eliminar".
-- Es catálogo cerrado: lo siembra la migración, no lo edita la interfaz.
-- -----------------------------------------------------------------------------
create table public.permisos (
  codigo      text primary key,
  modulo      text not null,
  accion      text not null,
  descripcion text not null,

  constraint permisos_codigo_formato check (codigo ~ '^[a-z_]+\.[a-z_]+$')
);

comment on table public.permisos is
  'Catálogo cerrado de capacidades. El código sigue el patrón modulo.accion.';

-- -----------------------------------------------------------------------------
-- Roles (cargos)
-- -----------------------------------------------------------------------------
create table public.roles (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  descripcion    text,

  -- Interruptores gruesos que muestra la pantalla de Roles y Permisos
  puede_leer     boolean not null default true,
  puede_editar   boolean not null default false,
  puede_eliminar boolean not null default false,

  nivel_acceso   public.nivel_acceso not null default 'visor',
  estado         public.estado_registro not null default 'activo',

  -- Un rol de sistema no puede borrarse ni renombrarse desde la interfaz
  es_sistema     boolean not null default false,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por     uuid,

  constraint roles_nombre_no_vacio check (length(trim(nombre)) between 2 and 120),
  -- Coherencia: no se puede eliminar sin poder editar, ni editar sin poder leer.
  constraint roles_escalada_coherente check (
    (not puede_eliminar or puede_editar) and (not puede_editar or puede_leer)
  )
);

-- Nombre único ignorando tildes y mayúsculas: "Decano" y "decáno" colisionan.
create unique index roles_nombre_unico on public.roles (public.fn_normalizar(nombre));
create index roles_estado_idx on public.roles (estado);

comment on constraint roles_escalada_coherente on public.roles is
  'Los permisos se escalan: eliminar implica editar, y editar implica leer.';

-- -----------------------------------------------------------------------------
-- Permisos concedidos a cada rol (N:M)
-- -----------------------------------------------------------------------------
create table public.rol_permisos (
  rol_id         uuid not null references public.roles (id) on delete cascade,
  permiso_codigo text not null references public.permisos (codigo) on delete cascade,
  concedido_en   timestamptz not null default now(),

  primary key (rol_id, permiso_codigo)
);

create index rol_permisos_permiso_idx on public.rol_permisos (permiso_codigo);

-- -----------------------------------------------------------------------------
-- Perfiles — extensión de auth.users con los datos del dominio
-- -----------------------------------------------------------------------------
create table public.perfiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  nombre_completo  text not null,
  correo           text not null,
  cargo            text,
  avatar_url       text,

  rol_id           uuid references public.roles (id) on delete set null,
  vicerrectoria_id uuid references public.vicerrectorias (id) on delete set null,

  estado           public.estado_registro not null default 'activo',
  ultimo_acceso_en timestamptz,

  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),

  constraint perfiles_correo_valido check (correo ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  constraint perfiles_nombre_no_vacio check (length(trim(nombre_completo)) >= 2)
);

create unique index perfiles_correo_unico on public.perfiles (lower(correo));
create index perfiles_rol_idx on public.perfiles (rol_id);
create index perfiles_vicerrectoria_idx on public.perfiles (vicerrectoria_id);
create index perfiles_estado_idx on public.perfiles (estado);
-- Búsqueda por nombre tolerante a tildes y errores de tecleo
create index perfiles_nombre_trgm_idx on public.perfiles
  using gin (public.fn_normalizar(nombre_completo) gin_trgm_ops);

comment on table public.perfiles is
  'Datos de dominio de cada usuario. La autenticación vive en auth.users; aquí van rol, cargo y unidad.';

-- Iniciales para el avatar de respaldo, calculadas en base de datos para que
-- la interfaz y los reportes muestren exactamente lo mismo.
create or replace function public.fn_iniciales(nombre text)
returns text
language sql
immutable
strict
parallel safe
as $fn$
  select upper(string_agg(left(palabra, 1), '' order by orden))
  from (
    select palabra, orden
    from unnest(
      regexp_split_to_array(trim(regexp_replace(nombre, '[[:space:]]+', ' ', 'g')), ' ')
    ) with ordinality as t(palabra, orden)
    where length(palabra) > 2 or orden = 1
    limit 2
  ) s;
$fn$;

-- -----------------------------------------------------------------------------
-- Alta automática de perfil al registrarse un usuario en auth
-- -----------------------------------------------------------------------------
create or replace function public.fn_perfil_al_registrar()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $fn$
declare
  v_rol_id uuid;
begin
  -- Rol por defecto para altas nuevas: el de menor privilegio.
  select id into v_rol_id
  from public.roles
  where public.fn_normalizar(nombre) = 'auditor externo'
  limit 1;

  insert into public.perfiles (id, nombre_completo, correo, rol_id)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nombre_completo'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    v_rol_id
  )
  on conflict (id) do nothing;

  return new;
end;
$fn$;

create trigger trg_perfil_al_registrar
  after insert on auth.users
  for each row
  execute function public.fn_perfil_al_registrar();

-- -----------------------------------------------------------------------------
-- Triggers de actualizado_en
-- -----------------------------------------------------------------------------
create trigger trg_vicerrectorias_actualizado before update on public.vicerrectorias
  for each row execute function public.fn_set_actualizado_en();
create trigger trg_roles_actualizado before update on public.roles
  for each row execute function public.fn_set_actualizado_en();
create trigger trg_perfiles_actualizado before update on public.perfiles
  for each row execute function public.fn_set_actualizado_en();
