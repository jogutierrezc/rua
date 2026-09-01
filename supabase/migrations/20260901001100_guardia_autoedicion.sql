-- =============================================================================
-- Rua · 11 — Endurecimiento de la autoedición de perfiles
--
-- Al abrir la edición de usuarios aparece un agujero que antes no existía:
-- un administrador editándose a SÍ MISMO podía cambiar su propio rol. Bastaba
-- con quitarse `roles.administrar` sin querer para dejar la instalación sin
-- nadie capaz de administrarla — y sin forma de revertirlo desde la interfaz.
--
-- La regla nueva: el rol y el estado propios NO se tocan nunca desde la
-- aplicación, se tenga el permiso que se tenga. Quien necesite cambiar el suyo
-- se lo pide a otro administrador. Es la misma razón por la que un cajero no
-- se audita su propia caja.
-- =============================================================================

create or replace function public.fn_guardia_perfiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.id = auth.uid() then
    -- Privilegio: intocable sobre uno mismo, incluso siendo administrador.
    -- Evita tanto la autodegradación como la autodesactivación.
    new.rol_id := old.rol_id;
    new.estado := old.estado;

    -- Datos administrativos: sólo los cambia quien administra usuarios. Un
    -- administrador sí puede corregir su propia unidad o su documento, porque
    -- no son privilegio.
    if not public.fn_tengo_permiso('usuarios.administrar') then
      new.vicerrectoria_id := old.vicerrectoria_id;
      new.numero_documento := old.numero_documento;
    end if;
  end if;

  -- El correo es la identidad de acceso: vive en auth.users, no aquí.
  new.correo := old.correo;

  return new;
end;
$fn$;

comment on function public.fn_guardia_perfiles is
  'Nadie cambia su propio rol ni su propio estado, ni siquiera siendo administrador. El correo sólo se cambia en auth.';

-- -----------------------------------------------------------------------------
-- Registro de restablecimientos de contraseña
--
-- La acción la ejecuta una Edge Function con la clave de servicio, así que no
-- pasa por ningún trigger de auditoría. Se deja constancia explícita: quién
-- restableció la contraseña de quién y cuándo.
-- -----------------------------------------------------------------------------
alter type public.accion_auditoria add value if not exists 'restablecer_clave';
