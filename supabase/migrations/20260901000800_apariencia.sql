-- =============================================================================
-- Rua · 08 — Preferencias de apariencia
--
-- Dos niveles a propósito:
--   · `configuracion.apariencia` es lo que ve alguien que nunca ha elegido —
--     la identidad institucional, que fija el administrador.
--   · `perfiles.preferencias` es la elección personal, que gana sobre la
--     anterior y viaja con la persona a cualquier equipo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Preferencia personal
-- -----------------------------------------------------------------------------
alter table public.perfiles
  add column if not exists preferencias jsonb not null default '{}'::jsonb;

comment on column public.perfiles.preferencias is
  'Ajustes personales de interfaz: {"paleta": "udes-blue", "modo": "sistema"}.';

-- Evita que un cliente con un error meta un blob enorme en cada perfil.
alter table public.perfiles
  add constraint perfiles_preferencias_acotadas
  check (pg_column_size(preferencias) < 4096);

-- -----------------------------------------------------------------------------
-- Configuración institucional
--
-- Tabla de una sola fila. El CHECK sobre una columna constante es lo que
-- garantiza que siga siendo una sola: no hay forma de insertar la segunda.
-- -----------------------------------------------------------------------------
create table public.configuracion (
  id             boolean primary key default true,
  apariencia     jsonb not null default '{"paleta": "udes-blue", "modo": "sistema"}'::jsonb,
  nombre_institucion text not null default 'Gestión Académica',
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles (id) on delete set null,

  constraint configuracion_fila_unica check (id)
);

comment on table public.configuracion is
  'Ajustes globales del portal. Una sola fila, forzada por el CHECK sobre la clave primaria.';

insert into public.configuracion (id) values (true) on conflict (id) do nothing;

create trigger trg_configuracion_actualizado before update on public.configuracion
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.configuracion enable row level security;

-- Todo usuario activo necesita leerla: es lo que decide el tema por defecto.
create policy "configuracion_lectura" on public.configuracion
  for select to authenticated using (public.fn_estoy_activo());

create policy "configuracion_escritura" on public.configuracion
  for update to authenticated
  using (public.fn_soy_admin())
  with check (public.fn_soy_admin());

-- Sella quién tocó la configuración, sin confiar en el cliente.
create or replace function public.fn_configuracion_sellar()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  new.actualizado_por := auth.uid();
  new.id := true;   -- la fila única no se puede reasignar
  return new;
end;
$fn$;

create trigger trg_configuracion_sellar
  before update on public.configuracion
  for each row execute function public.fn_configuracion_sellar();

-- -----------------------------------------------------------------------------
-- La guardia de perfiles ya permite que cada quien edite sus propios campos no
-- sensibles, y `preferencias` es uno de ellos. No hace falta tocarla: sólo se
-- documenta aquí para que quede claro que es deliberado.
-- -----------------------------------------------------------------------------
comment on function public.fn_guardia_perfiles is
  'Impide que alguien se ascienda a sí mismo. Los campos de presentación y `preferencias` sí son autoeditables.';
