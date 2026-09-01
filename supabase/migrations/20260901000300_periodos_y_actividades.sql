-- =============================================================================
-- Rua · 03 — Periodos académicos y estructura de actividades
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Periodos académicos
-- -----------------------------------------------------------------------------
create table public.periodos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,          -- 2024-1, 2023-B
  nombre         text not null,
  fecha_inicio   date not null,
  fecha_fin      date not null,
  estado         public.estado_periodo not null default 'planificado',
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint periodos_rango_valido check (fecha_fin > fecha_inicio)
);

-- Sólo puede haber un periodo abierto a la vez: es el que la interfaz asume
-- por defecto en todas las pantallas.
create unique index periodos_uno_abierto
  on public.periodos ((estado = 'abierto'))
  where estado = 'abierto';

create index periodos_estado_idx on public.periodos (estado, fecha_inicio desc);

-- -----------------------------------------------------------------------------
-- Actividades — árbol de tres niveles: principal > directa > apoyo
-- -----------------------------------------------------------------------------
create table public.actividades (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null,
  nomenclatura  text not null,
  descripcion   text,

  tipo          public.tipo_actividad not null,
  padre_id      uuid references public.actividades (id) on delete cascade,

  -- Derivadas por trigger a partir de padre_id: nunca se escriben a mano.
  nivel         smallint not null default 0,
  ruta          text not null default '',       -- "ACT-001 / SUB-001A / AP-092"

  estado        public.estado_actividad not null default 'borrador',
  orden         smallint not null default 0,

  creado_por    uuid references public.perfiles (id) on delete set null,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- SUPERADA por la migración 12: el mínimo bajó de 3 a 2 caracteres.
  constraint actividades_codigo_formato check (codigo ~ '^[A-Z0-9-]{3,32}$'),
  constraint actividades_nomenclatura_no_vacia check (length(trim(nomenclatura)) >= 3),

  -- Una principal es raíz; una directa o de apoyo siempre cuelga de algo.
  constraint actividades_jerarquia_coherente check (
    (tipo = 'principal' and padre_id is null) or
    (tipo <> 'principal' and padre_id is not null)
  )
);

create unique index actividades_codigo_unico on public.actividades (upper(codigo));
create index actividades_padre_idx on public.actividades (padre_id);
create index actividades_tipo_estado_idx on public.actividades (tipo, estado);
create index actividades_nomenclatura_trgm_idx on public.actividades
  using gin (public.fn_normalizar(nomenclatura) gin_trgm_ops);

comment on column public.actividades.ruta is
  'Ruta legible desde la raíz, recalculada por trigger. Permite mostrar el linaje sin recorrer el árbol.';

-- -----------------------------------------------------------------------------
-- Derivación de nivel y ruta, y protección contra ciclos
-- -----------------------------------------------------------------------------
create or replace function public.fn_actividad_derivar_jerarquia()
returns trigger
language plpgsql
as $fn$
declare
  v_padre record;
  v_cursor uuid;
  v_saltos int := 0;
begin
  if new.padre_id is null then
    new.nivel := 0;
    new.ruta  := new.codigo;
  else
    if new.padre_id = new.id then
      raise exception 'Una actividad no puede ser su propio padre';
    end if;

    -- Detección de ciclos: subimos por el árbol buscando volver a new.id.
    v_cursor := new.padre_id;
    while v_cursor is not null loop
      v_saltos := v_saltos + 1;
      if v_cursor = new.id then
        raise exception 'La jerarquía de actividades formaría un ciclo';
      end if;
      if v_saltos > 16 then
        raise exception 'Jerarquía de actividades demasiado profunda (máx. 16 niveles)';
      end if;
      select padre_id into v_cursor from public.actividades where id = v_cursor;
    end loop;

    select nivel, ruta into v_padre from public.actividades where id = new.padre_id;
    if not found then
      raise exception 'La actividad padre % no existe', new.padre_id;
    end if;

    new.nivel := v_padre.nivel + 1;
    new.ruta  := v_padre.ruta || ' / ' || new.codigo;
  end if;

  return new;
end;
$fn$;

create trigger trg_actividad_derivar_jerarquia
  before insert or update of padre_id, codigo on public.actividades
  for each row execute function public.fn_actividad_derivar_jerarquia();

-- Si cambia el código o el padre de una rama, los descendientes heredan la ruta nueva.
create or replace function public.fn_actividad_propagar_ruta()
returns trigger
language plpgsql
as $fn$
begin
  if new.ruta is distinct from old.ruta then
    update public.actividades
    set padre_id = padre_id             -- dispara la derivación en cada hijo
    where padre_id = new.id;
  end if;
  return null;
end;
$fn$;

create trigger trg_actividad_propagar_ruta
  after update of ruta on public.actividades
  for each row execute function public.fn_actividad_propagar_ruta();

-- -----------------------------------------------------------------------------
-- Vicerrectorías con acceso a cada actividad (N:M)
-- -----------------------------------------------------------------------------
create table public.actividad_vicerrectorias (
  actividad_id     uuid not null references public.actividades (id) on delete cascade,
  vicerrectoria_id uuid not null references public.vicerrectorias (id) on delete cascade,
  asignado_en      timestamptz not null default now(),

  primary key (actividad_id, vicerrectoria_id)
);

create index actividad_vicerrectorias_vic_idx
  on public.actividad_vicerrectorias (vicerrectoria_id);

-- -----------------------------------------------------------------------------
-- Actividades asignadas a un rol (N:M) — el árbol de la pantalla de Roles
-- -----------------------------------------------------------------------------
create table public.rol_actividades (
  rol_id       uuid not null references public.roles (id) on delete cascade,
  actividad_id uuid not null references public.actividades (id) on delete cascade,
  asignado_en  timestamptz not null default now(),

  primary key (rol_id, actividad_id)
);

create index rol_actividades_actividad_idx on public.rol_actividades (actividad_id);

-- -----------------------------------------------------------------------------
-- Ejecución de una actividad dentro de un periodo
-- La definición de la actividad es estable; su ejecución cambia cada periodo.
-- -----------------------------------------------------------------------------
create table public.actividad_periodo (
  id             uuid primary key default gen_random_uuid(),
  actividad_id   uuid not null references public.actividades (id) on delete cascade,
  periodo_id     uuid not null references public.periodos (id) on delete cascade,

  estado         public.estado_ejecucion not null default 'planificada',
  responsable_id uuid references public.perfiles (id) on delete set null,
  observaciones  text,

  aprobado_por   uuid references public.perfiles (id) on delete set null,
  aprobado_en    timestamptz,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  unique (actividad_id, periodo_id),

  -- Si está aprobada, tiene que constar quién y cuándo.
  constraint actividad_periodo_aprobacion_completa check (
    (estado <> 'aprobada') or (aprobado_por is not null and aprobado_en is not null)
  )
);

create index actividad_periodo_periodo_idx on public.actividad_periodo (periodo_id, estado);
create index actividad_periodo_responsable_idx on public.actividad_periodo (responsable_id);

-- -----------------------------------------------------------------------------
-- Vista del árbol con el linaje ya resuelto — lo que consume la interfaz
-- -----------------------------------------------------------------------------
create or replace view public.v_actividades_arbol
with (security_invoker = true) as
with recursive linaje as (
  -- Cada raíz es su propia raíz
  select a.id, a.id as raiz_id, a.nomenclatura as raiz_nomenclatura
  from public.actividades a
  where a.padre_id is null

  union all

  -- Cada hijo hereda la raíz de su padre
  select h.id, l.raiz_id, l.raiz_nomenclatura
  from public.actividades h
  join linaje l on l.id = h.padre_id
)
select
  a.id,
  a.codigo,
  a.nomenclatura,
  a.descripcion,
  a.tipo,
  a.padre_id,
  a.nivel,
  a.ruta,
  a.estado,
  a.orden,
  a.creado_en,
  a.actualizado_en,
  p.codigo          as padre_codigo,
  p.nomenclatura    as padre_nomenclatura,
  l.raiz_id,
  l.raiz_nomenclatura,
  (select count(*) from public.actividades h where h.padre_id = a.id) as total_hijos,
  coalesce(
    (
      select array_agg(v.nombre order by v.orden)
      from public.actividad_vicerrectorias av
      join public.vicerrectorias v on v.id = av.vicerrectoria_id
      where av.actividad_id = a.id
    ),
    '{}'::text[]
  ) as vicerrectorias
from public.actividades a
left join public.actividades p on p.id = a.padre_id
left join linaje l on l.id = a.id;

comment on view public.v_actividades_arbol is
  'Actividades con padre, raíz, número de hijos y vicerrectorías resueltos. security_invoker: respeta las políticas RLS del usuario.';

-- -----------------------------------------------------------------------------
-- Triggers de actualizado_en
-- -----------------------------------------------------------------------------
create trigger trg_periodos_actualizado before update on public.periodos
  for each row execute function public.fn_set_actualizado_en();
create trigger trg_actividades_actualizado before update on public.actividades
  for each row execute function public.fn_set_actualizado_en();
create trigger trg_actividad_periodo_actualizado before update on public.actividad_periodo
  for each row execute function public.fn_set_actualizado_en();
),
  constraint actividades_nomenclatura_no_vacia check (length(trim(nomenclatura)) >= 3),

  -- Una principal es raíz; una directa o de apoyo siempre cuelga de algo.
  constraint actividades_jerarquia_coherente check (
    (tipo = 'principal' and padre_id is null) or
    (tipo <> 'principal' and padre_id is not null)
  )
);

create unique index actividades_codigo_unico on public.actividades (upper(codigo));
create index actividades_padre_idx on public.actividades (padre_id);
create index actividades_tipo_estado_idx on public.actividades (tipo, estado);
create index actividades_nomenclatura_trgm_idx on public.actividades
  using gin (public.fn_normalizar(nomenclatura) gin_trgm_ops);

comment on column public.actividades.ruta is
  'Ruta legible desde la raíz, recalculada por trigger. Permite mostrar el linaje sin recorrer el árbol.';

-- -----------------------------------------------------------------------------
-- Derivación de nivel y ruta, y protección contra ciclos
-- -----------------------------------------------------------------------------
create or replace function public.fn_actividad_derivar_jerarquia()
returns trigger
language plpgsql
as $fn$
declare
  v_padre record;
  v_cursor uuid;
  v_saltos int := 0;
begin
  if new.padre_id is null then
    new.nivel := 0;
    new.ruta  := new.codigo;
  else
    if new.padre_id = new.id then
      raise exception 'Una actividad no puede ser su propio padre';
    end if;

    -- Detección de ciclos: subimos por el árbol buscando volver a new.id.
    v_cursor := new.padre_id;
    while v_cursor is not null loop
      v_saltos := v_saltos + 1;
      if v_cursor = new.id then
        raise exception 'La jerarquía de actividades formaría un ciclo';
      end if;
      if v_saltos > 16 then
        raise exception 'Jerarquía de actividades demasiado profunda (máx. 16 niveles)';
      end if;
      select padre_id into v_cursor from public.actividades where id = v_cursor;
    end loop;

    select nivel, ruta into v_padre from public.actividades where id = new.padre_id;
    if not found then
      raise exception 'La actividad padre % no existe', new.padre_id;
    end if;

    new.nivel := v_padre.nivel + 1;
    new.ruta  := v_padre.ruta || ' / ' || new.codigo;
  end if;

  return new;
end;
$fn$;

create trigger trg_actividad_derivar_jerarquia
  before insert or update of padre_id, codigo on public.actividades
  for each row execute function public.fn_actividad_derivar_jerarquia();

-- Si cambia el código o el padre de una rama, los descendientes heredan la ruta nueva.
create or replace function public.fn_actividad_propagar_ruta()
returns trigger
language plpgsql
as $fn$
begin
  if new.ruta is distinct from old.ruta then
    update public.actividades
    set padre_id = padre_id             -- dispara la derivación en cada hijo
    where padre_id = new.id;
  end if;
  return null;
end;
$fn$;

create trigger trg_actividad_propagar_ruta
  after update of ruta on public.actividades
  for each row execute function public.fn_actividad_propagar_ruta();

-- -----------------------------------------------------------------------------
-- Vicerrectorías con acceso a cada actividad (N:M)
-- -----------------------------------------------------------------------------
create table public.actividad_vicerrectorias (
  actividad_id     uuid not null references public.actividades (id) on delete cascade,
  vicerrectoria_id uuid not null references public.vicerrectorias (id) on delete cascade,
  asignado_en      timestamptz not null default now(),

  primary key (actividad_id, vicerrectoria_id)
);

create index actividad_vicerrectorias_vic_idx
  on public.actividad_vicerrectorias (vicerrectoria_id);

-- -----------------------------------------------------------------------------
-- Actividades asignadas a un rol (N:M) — el árbol de la pantalla de Roles
-- -----------------------------------------------------------------------------
create table public.rol_actividades (
  rol_id       uuid not null references public.roles (id) on delete cascade,
  actividad_id uuid not null references public.actividades (id) on delete cascade,
  asignado_en  timestamptz not null default now(),

  primary key (rol_id, actividad_id)
);

create index rol_actividades_actividad_idx on public.rol_actividades (actividad_id);

-- -----------------------------------------------------------------------------
-- Ejecución de una actividad dentro de un periodo
-- La definición de la actividad es estable; su ejecución cambia cada periodo.
-- -----------------------------------------------------------------------------
create table public.actividad_periodo (
  id             uuid primary key default gen_random_uuid(),
  actividad_id   uuid not null references public.actividades (id) on delete cascade,
  periodo_id     uuid not null references public.periodos (id) on delete cascade,

  estado         public.estado_ejecucion not null default 'planificada',
  responsable_id uuid references public.perfiles (id) on delete set null,
  observaciones  text,

  aprobado_por   uuid references public.perfiles (id) on delete set null,
  aprobado_en    timestamptz,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  unique (actividad_id, periodo_id),

  -- Si está aprobada, tiene que constar quién y cuándo.
  constraint actividad_periodo_aprobacion_completa check (
    (estado <> 'aprobada') or (aprobado_por is not null and aprobado_en is not null)
  )
);

create index actividad_periodo_periodo_idx on public.actividad_periodo (periodo_id, estado);
create index actividad_periodo_responsable_idx on public.actividad_periodo (responsable_id);

-- -----------------------------------------------------------------------------
-- Vista del árbol con el linaje ya resuelto — lo que consume la interfaz
-- -----------------------------------------------------------------------------
create or replace view public.v_actividades_arbol
with (security_invoker = true) as
with recursive linaje as (
  -- Cada raíz es su propia raíz
  select a.id, a.id as raiz_id, a.nomenclatura as raiz_nomenclatura
  from public.actividades a
  where a.padre_id is null

  union all

  -- Cada hijo hereda la raíz de su padre
  select h.id, l.raiz_id, l.raiz_nomenclatura
  from public.actividades h
  join linaje l on l.id = h.padre_id
)
select
  a.id,
  a.codigo,
  a.nomenclatura,
  a.descripcion,
  a.tipo,
  a.padre_id,
  a.nivel,
  a.ruta,
  a.estado,
  a.orden,
  a.creado_en,
  a.actualizado_en,
  p.codigo          as padre_codigo,
  p.nomenclatura    as padre_nomenclatura,
  l.raiz_id,
  l.raiz_nomenclatura,
  (select count(*) from public.actividades h where h.padre_id = a.id) as total_hijos,
  coalesce(
    (
      select array_agg(v.nombre order by v.orden)
      from public.actividad_vicerrectorias av
      join public.vicerrectorias v on v.id = av.vicerrectoria_id
      where av.actividad_id = a.id
    ),
    '{}'::text[]
  ) as vicerrectorias
from public.actividades a
left join public.actividades p on p.id = a.padre_id
left join linaje l on l.id = a.id;

comment on view public.v_actividades_arbol is
  'Actividades con padre, raíz, número de hijos y vicerrectorías resueltos. security_invoker: respeta las políticas RLS del usuario.';

-- -----------------------------------------------------------------------------
-- Triggers de actualizado_en
-- -----------------------------------------------------------------------------
create trigger trg_periodos_actualizado before update on public.periodos
  for each row execute function public.fn_set_actualizado_en();
create trigger trg_actividades_actualizado before update on public.actividades
  for each row execute function public.fn_set_actualizado_en();
create trigger trg_actividad_periodo_actualizado before update on public.actividad_periodo
  for each row execute function public.fn_set_actualizado_en();
