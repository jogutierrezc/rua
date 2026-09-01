-- =============================================================================
-- Rua · 05 — Row Level Security
--
-- En una SPA el cliente es público: cualquiera puede llamar a la API con la
-- anon key. Estas políticas SON la capa de autorización de la aplicación;
-- lo que hace la interfaz es sólo cortesía visual.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funciones auxiliares
--
-- SECURITY DEFINER a propósito: si una política sobre `perfiles` consultara
-- `perfiles` con los permisos del invocador, la evaluación se volvería
-- recursiva. Al ser definer, la consulta interna salta RLS y corta el ciclo.
-- search_path fijado para que no se pueda secuestrar con una tabla homónima.
-- -----------------------------------------------------------------------------

create or replace function public.fn_mi_rol_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select rol_id from public.perfiles where id = auth.uid();
$fn$;

create or replace function public.fn_estoy_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and estado = 'activo'
  );
$fn$;

create or replace function public.fn_tengo_permiso(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.perfiles p
    join public.roles r        on r.id = p.rol_id
    join public.rol_permisos rp on rp.rol_id = r.id
    where p.id = auth.uid()
      and p.estado = 'activo'
      and r.estado = 'activo'
      and rp.permiso_codigo = p_codigo
  );
$fn$;

-- Administrador = quien puede administrar roles. No se codifica por nombre de
-- rol, sino por capacidad: renombrar un rol no debe romper la seguridad.
create or replace function public.fn_soy_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.fn_tengo_permiso('roles.administrar');
$fn$;

create or replace function public.fn_mi_vicerrectoria_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select vicerrectoria_id from public.perfiles where id = auth.uid();
$fn$;

grant execute on function
  public.fn_mi_rol_id,
  public.fn_estoy_activo,
  public.fn_tengo_permiso,
  public.fn_soy_admin,
  public.fn_mi_vicerrectoria_id
to authenticated;

-- -----------------------------------------------------------------------------
-- Activación de RLS en todas las tablas
-- -----------------------------------------------------------------------------
alter table public.vicerrectorias           enable row level security;
alter table public.permisos                 enable row level security;
alter table public.roles                    enable row level security;
alter table public.rol_permisos             enable row level security;
alter table public.perfiles                 enable row level security;
alter table public.periodos                 enable row level security;
alter table public.actividades              enable row level security;
alter table public.actividad_vicerrectorias enable row level security;
alter table public.rol_actividades          enable row level security;
alter table public.actividad_periodo        enable row level security;
alter table public.solicitudes              enable row level security;
alter table public.solicitud_revisiones     enable row level security;
alter table public.notificaciones           enable row level security;
alter table public.auditoria                enable row level security;

-- =============================================================================
-- Catálogos — legibles por cualquier usuario activo, escribibles sólo por admin
-- =============================================================================

create policy "catalogo_vicerrectorias_lectura" on public.vicerrectorias
  for select to authenticated using (public.fn_estoy_activo());

create policy "catalogo_vicerrectorias_escritura" on public.vicerrectorias
  for all to authenticated
  using (public.fn_soy_admin())
  with check (public.fn_soy_admin());

-- El catálogo de permisos es de sólo lectura incluso para el administrador:
-- se amplía con una migración, nunca desde la aplicación.
create policy "catalogo_permisos_lectura" on public.permisos
  for select to authenticated using (public.fn_estoy_activo());

create policy "catalogo_periodos_lectura" on public.periodos
  for select to authenticated using (public.fn_estoy_activo());

create policy "catalogo_periodos_escritura" on public.periodos
  for all to authenticated
  using (public.fn_tengo_permiso('periodos.administrar'))
  with check (public.fn_tengo_permiso('periodos.administrar'));

-- =============================================================================
-- Roles y permisos de rol
-- =============================================================================

create policy "roles_lectura" on public.roles
  for select to authenticated using (public.fn_estoy_activo());

create policy "roles_alta" on public.roles
  for insert to authenticated
  with check (public.fn_soy_admin());

create policy "roles_modificacion" on public.roles
  for update to authenticated
  using (public.fn_soy_admin())
  with check (public.fn_soy_admin());

create policy "roles_baja" on public.roles
  for delete to authenticated
  using (public.fn_soy_admin() and not es_sistema);

create policy "rol_permisos_lectura" on public.rol_permisos
  for select to authenticated using (public.fn_estoy_activo());

create policy "rol_permisos_escritura" on public.rol_permisos
  for all to authenticated
  using (public.fn_soy_admin())
  with check (public.fn_soy_admin());

-- =============================================================================
-- Perfiles
-- =============================================================================

-- Todo usuario activo ve el directorio (nombre, cargo, unidad): la aplicación
-- muestra autores y responsables por todas partes.
create policy "perfiles_lectura" on public.perfiles
  for select to authenticated using (public.fn_estoy_activo());

-- Cada quien edita sus propios datos de presentación. Los campos sensibles
-- (rol, estado, unidad) los blinda un trigger, más abajo.
create policy "perfiles_autoedicion" on public.perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "perfiles_administracion" on public.perfiles
  for update to authenticated
  using (public.fn_tengo_permiso('usuarios.administrar'))
  with check (public.fn_tengo_permiso('usuarios.administrar'));

create policy "perfiles_alta" on public.perfiles
  for insert to authenticated
  with check (public.fn_tengo_permiso('usuarios.administrar'));

-- Las bajas son lógicas (estado = 'inactivo'). Borrar deja huérfano el historial.
create policy "perfiles_baja" on public.perfiles
  for delete to authenticated
  using (public.fn_soy_admin() and id <> auth.uid());

-- =============================================================================
-- Actividades
-- =============================================================================

create policy "actividades_lectura" on public.actividades
  for select to authenticated using (public.fn_estoy_activo());

create policy "actividades_alta" on public.actividades
  for insert to authenticated
  with check (public.fn_tengo_permiso('actividades.crear'));

create policy "actividades_modificacion" on public.actividades
  for update to authenticated
  using (public.fn_tengo_permiso('actividades.editar'))
  with check (public.fn_tengo_permiso('actividades.editar'));

create policy "actividades_baja" on public.actividades
  for delete to authenticated
  using (public.fn_tengo_permiso('actividades.eliminar'));

create policy "actividad_vicerrectorias_lectura" on public.actividad_vicerrectorias
  for select to authenticated using (public.fn_estoy_activo());

create policy "actividad_vicerrectorias_escritura" on public.actividad_vicerrectorias
  for all to authenticated
  using (public.fn_tengo_permiso('actividades.editar'))
  with check (public.fn_tengo_permiso('actividades.editar'));

create policy "rol_actividades_lectura" on public.rol_actividades
  for select to authenticated using (public.fn_estoy_activo());

create policy "rol_actividades_escritura" on public.rol_actividades
  for all to authenticated
  using (public.fn_soy_admin())
  with check (public.fn_soy_admin());

create policy "actividad_periodo_lectura" on public.actividad_periodo
  for select to authenticated using (public.fn_estoy_activo());

create policy "actividad_periodo_escritura" on public.actividad_periodo
  for all to authenticated
  using (public.fn_tengo_permiso('actividades.editar'))
  with check (public.fn_tengo_permiso('actividades.editar'));

-- =============================================================================
-- Solicitudes
-- =============================================================================

-- Se ve una solicitud si es propia, si se tiene permiso de revisión, o si
-- pertenece a la propia vicerrectoría (transparencia dentro de la unidad).
create policy "solicitudes_lectura" on public.solicitudes
  for select to authenticated
  using (
    public.fn_estoy_activo()
    and (
      solicitante_id = auth.uid()
      or public.fn_tengo_permiso('solicitudes.revisar')
      or exists (
        select 1 from public.perfiles p
        where p.id = solicitudes.solicitante_id
          and p.vicerrectoria_id is not null
          and p.vicerrectoria_id = public.fn_mi_vicerrectoria_id()
      )
    )
  );

-- Sólo se puede crear una solicitud a nombre propio.
create policy "solicitudes_alta" on public.solicitudes
  for insert to authenticated
  with check (
    public.fn_tengo_permiso('solicitudes.crear')
    and solicitante_id = auth.uid()
  );

-- El autor edita su solicitud sólo mientras siga siendo borrador.
create policy "solicitudes_edicion_autor" on public.solicitudes
  for update to authenticated
  using (solicitante_id = auth.uid() and estado = 'borrador')
  with check (solicitante_id = auth.uid() and estado in ('borrador', 'pendiente'));

-- El revisor resuelve, pero no puede resolver la suya propia.
create policy "solicitudes_resolucion" on public.solicitudes
  for update to authenticated
  using (
    public.fn_tengo_permiso('solicitudes.revisar')
    and solicitante_id <> auth.uid()
    and estado in ('pendiente', 'revision')
  )
  with check (public.fn_tengo_permiso('solicitudes.revisar'));

create policy "solicitudes_baja_borrador" on public.solicitudes
  for delete to authenticated
  using (solicitante_id = auth.uid() and estado = 'borrador');

-- El historial es de sólo lectura: lo escriben los triggers, que corren como
-- definer y por tanto no pasan por estas políticas.
create policy "solicitud_revisiones_lectura" on public.solicitud_revisiones
  for select to authenticated
  using (
    exists (
      select 1 from public.solicitudes s
      where s.id = solicitud_revisiones.solicitud_id
    )
  );

-- =============================================================================
-- Notificaciones — estrictamente personales
-- =============================================================================

create policy "notificaciones_propias" on public.notificaciones
  for select to authenticated
  using (destinatario_id = auth.uid());

-- Marcar como leída es lo único que el destinatario puede cambiar.
create policy "notificaciones_marcar_leida" on public.notificaciones
  for update to authenticated
  using (destinatario_id = auth.uid())
  with check (destinatario_id = auth.uid());

-- =============================================================================
-- Auditoría — sólo lectura, y sólo para quien audita
-- =============================================================================

create policy "auditoria_lectura" on public.auditoria
  for select to authenticated
  using (public.fn_tengo_permiso('auditoria.consultar'));

-- Nadie escribe en la bitácora directamente: sólo el trigger fn_auditar,
-- que es SECURITY DEFINER y no está sujeto a estas políticas.

-- =============================================================================
-- Guardias de integridad
--
-- Lo que una política RLS no expresa bien (comparar el valor viejo con el
-- nuevo) se blinda aquí. Un trigger BEFORE ve OLD y NEW a la vez, así que
-- puede decir con precisión "este campo no lo cambias tú".
-- =============================================================================

-- Un rol de sistema no puede dejar de serlo ni ser renombrado: es lo que
-- garantiza que la instalación conserve siempre un administrador posible.
create or replace function public.fn_guardia_roles()
returns trigger
language plpgsql
as $fn$
begin
  if old.es_sistema then
    if new.es_sistema is distinct from old.es_sistema then
      raise exception 'No se puede quitar la marca de rol de sistema a "%"', old.nombre
        using errcode = 'check_violation';
    end if;
    if public.fn_normalizar(new.nombre) is distinct from public.fn_normalizar(old.nombre) then
      raise exception 'No se puede renombrar el rol de sistema "%"', old.nombre
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$fn$;

create trigger trg_guardia_roles
  before update on public.roles
  for each row execute function public.fn_guardia_roles();

-- Nadie se asciende a sí mismo. Si quien edita es el propio titular del
-- perfil y no tiene permiso de administración de usuarios, los campos de
-- privilegio se revierten en silencio a su valor anterior.
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
  end if;

  -- El correo es la identidad: se cambia en auth, no aquí.
  new.correo := old.correo;

  return new;
end;
$fn$;

create trigger trg_guardia_perfiles
  before update on public.perfiles
  for each row execute function public.fn_guardia_perfiles();

-- El destinatario de una notificación sólo puede marcarla como leída.
create or replace function public.fn_guardia_notificaciones()
returns trigger
language plpgsql
as $fn$
begin
  new.destinatario_id := old.destinatario_id;
  new.titulo          := old.titulo;
  new.cuerpo          := old.cuerpo;
  new.enlace          := old.enlace;
  new.icono           := old.icono;
  new.creado_en       := old.creado_en;
  return new;
end;
$fn$;

create trigger trg_guardia_notificaciones
  before update on public.notificaciones
  for each row execute function public.fn_guardia_notificaciones();
