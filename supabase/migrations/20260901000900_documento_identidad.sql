-- =============================================================================
-- Rua · 09 — Documento de identidad
--
-- El número de documento es el identificador con el que la institución conoce
-- a una persona en actas, nóminas y sistemas externos. El correo cambia; la
-- cédula no. Por eso vive en `perfiles` y no en los metadatos de auth.
-- =============================================================================

alter table public.perfiles
  add column if not exists numero_documento text;

comment on column public.perfiles.numero_documento is
  'Documento de identidad (cédula, cédula de extranjería o pasaporte). Único entre usuarios activos.';

-- Se acepta alfanumérico para cubrir pasaporte y cédula de extranjería, no
-- sólo la cédula de ciudadanía numérica.
alter table public.perfiles
  add constraint perfiles_documento_formato
  check (
    numero_documento is null
    or numero_documento ~ '^[A-Za-z0-9-]{5,20}$'
  );

-- Único ignorando mayúsculas, pero SÓLO entre quienes lo tienen: los perfiles
-- creados antes de esta migración no lo llevan, y un índice único normal
-- trataría todos esos nulos como colisión en algunos motores.
create unique index if not exists perfiles_documento_unico
  on public.perfiles (upper(numero_documento))
  where numero_documento is not null;

-- Buscar por documento es lo primero que hace quien atiende a alguien en
-- ventanilla, así que se indexa para búsqueda parcial.
create index if not exists perfiles_documento_trgm_idx
  on public.perfiles using gin (numero_documento gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- El documento es dato administrativo, no de presentación: sólo lo cambia
-- quien administra usuarios. Se añade a la guardia que ya impide que alguien
-- se ascienda a sí mismo.
-- -----------------------------------------------------------------------------
create or replace function public.fn_guardia_perfiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.id = auth.uid() and not public.fn_tengo_permiso('usuarios.administrar') then
    new.rol_id           := old.rol_id;
    new.estado           := old.estado;
    new.vicerrectoria_id := old.vicerrectoria_id;
    -- Nadie se cambia su propio documento: es la identidad con la que figura
    -- en actas y nóminas.
    new.numero_documento := old.numero_documento;
  end if;

  -- El correo es la identidad de acceso: se cambia en auth, no aquí.
  new.correo := old.correo;

  return new;
end;
$fn$;

comment on function public.fn_guardia_perfiles is
  'Impide que alguien se ascienda a sí mismo o altere su documento. Los campos de presentación y `preferencias` sí son autoeditables.';
