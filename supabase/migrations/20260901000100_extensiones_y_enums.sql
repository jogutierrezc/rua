-- =============================================================================
-- Rua · 01 — Extensiones, enumeraciones y utilidades transversales
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- búsqueda difusa en nombres/códigos
create extension if not exists "unaccent";      -- búsqueda ignorando tildes

-- -----------------------------------------------------------------------------
-- Enumeraciones del dominio
-- -----------------------------------------------------------------------------

-- Nivel de acceso de un rol sobre el módulo de actividades
create type public.nivel_acceso as enum ('completo', 'limitado', 'visor');

-- Estado genérico de alta/baja lógica
create type public.estado_registro as enum ('activo', 'inactivo');

-- Jerarquía de actividades: principal > directa > apoyo
create type public.tipo_actividad as enum ('principal', 'directa', 'apoyo');

-- Ciclo de vida de la definición de una actividad
create type public.estado_actividad as enum ('borrador', 'activa', 'revision', 'archivada');

-- Ejecución de una actividad dentro de un periodo concreto
create type public.estado_ejecucion as enum ('planificada', 'en_curso', 'realizada', 'aprobada', 'cancelada');

-- Qué pide una solicitud
create type public.tipo_solicitud as enum ('crear', 'editar', 'eliminar');

-- Flujo de aprobación de una solicitud
create type public.estado_solicitud as enum ('borrador', 'pendiente', 'revision', 'aprobada', 'denegada', 'cancelada');

create type public.prioridad as enum ('normal', 'alta', 'urgente');

create type public.estado_periodo as enum ('planificado', 'abierto', 'cerrado');

-- Acción registrada en la bitácora de auditoría
create type public.accion_auditoria as enum ('insert', 'update', 'delete', 'login', 'aprobar', 'denegar');

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

-- Mantiene actualizado_en en cada UPDATE. Se engancha a toda tabla con esa columna.
create or replace function public.fn_set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- Normaliza texto para búsqueda: sin tildes, minúsculas, sin espacios sobrantes.
create or replace function public.fn_normalizar(txt text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select lower(trim(regexp_replace(public.unaccent(txt), '\s+', ' ', 'g')));
$$;

comment on function public.fn_normalizar is
  'Normaliza texto para búsquedas: sin tildes, en minúsculas y con espacios colapsados.';
