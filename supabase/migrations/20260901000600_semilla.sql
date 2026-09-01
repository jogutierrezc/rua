-- =============================================================================
-- Rua · 06 — Semilla
--
-- Catálogos y roles de sistema: son estructura, no datos de prueba, y deben
-- existir en cualquier entorno. Los datos de demostración van aparte, en
-- supabase/seed.sql, para no arrastrarlos a producción.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogo de permisos
-- -----------------------------------------------------------------------------
insert into public.permisos (codigo, modulo, accion, descripcion) values
  ('bi.consultar',            'bi',           'consultar',  'Ver el panel de Inteligencia de Negocios'),
  ('bi.exportar',             'bi',           'exportar',   'Exportar reportes del panel'),

  ('actividades.ver',         'actividades',  'ver',        'Consultar la estructura de actividades'),
  ('actividades.crear',       'actividades',  'crear',      'Dar de alta actividades'),
  ('actividades.editar',      'actividades',  'editar',     'Modificar actividades existentes'),
  ('actividades.eliminar',    'actividades',  'eliminar',   'Archivar o eliminar actividades'),

  ('solicitudes.crear',       'solicitudes',  'crear',      'Emitir solicitudes de cambio'),
  ('solicitudes.revisar',     'solicitudes',  'revisar',    'Aprobar o denegar solicitudes'),

  ('usuarios.ver',            'usuarios',     'ver',        'Consultar el directorio de usuarios'),
  ('usuarios.administrar',    'usuarios',     'administrar','Crear, editar y desactivar usuarios'),

  ('roles.administrar',       'roles',        'administrar','Configurar roles y permisos del sistema'),
  ('periodos.administrar',    'periodos',     'administrar','Abrir y cerrar periodos académicos'),
  ('auditoria.consultar',     'auditoria',    'consultar',  'Consultar la bitácora de auditoría')
on conflict (codigo) do update
  set modulo = excluded.modulo,
      accion = excluded.accion,
      descripcion = excluded.descripcion;

-- -----------------------------------------------------------------------------
-- Vicerrectorías
-- -----------------------------------------------------------------------------
insert into public.vicerrectorias (codigo, nombre, descripcion, orden) values
  ('VAC', 'Vicerrectoría Académica',      'Docencia, currículo y evaluación',        1),
  ('VIN', 'Vicerrectoría de Investigación','Investigación, desarrollo e innovación', 2),
  ('VEX', 'Vicerrectoría de Extensión',    'Vinculación y proyección social',        3),
  ('DFI', 'Dirección Financiera',          'Presupuesto y control financiero',       4),
  ('DGH', 'Gestión Humana',                'Personal docente y administrativo',      5)
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- Roles de sistema
-- -----------------------------------------------------------------------------
insert into public.roles (nombre, descripcion, puede_leer, puede_editar, puede_eliminar, nivel_acceso, es_sistema) values
  ('Administrador del Sistema', 'Control total sobre la configuración de la plataforma.',
   true,  true,  true,  'completo', true),
  ('Decano de Facultad', 'Aprueba solicitudes y gobierna la estructura de su facultad.',
   true,  true,  true,  'completo', true),
  ('Coordinador Académico', 'Revisa solicitudes y mantiene la estructura de actividades.',
   true,  true,  false, 'limitado', true),
  ('Auditor Externo', 'Acceso de sólo lectura a estructura, solicitudes y bitácora.',
   true,  false, false, 'visor',    true)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Concesión de permisos por rol
-- -----------------------------------------------------------------------------

-- Administrador: todo el catálogo, sin excepción.
insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from public.roles r
cross join public.permisos p
where public.fn_normalizar(r.nombre) = 'administrador del sistema'
on conflict do nothing;

-- Decano: todo salvo la administración de la propia plataforma.
insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from public.roles r
cross join public.permisos p
where public.fn_normalizar(r.nombre) = 'decano de facultad'
  and p.codigo not in ('roles.administrar', 'usuarios.administrar')
on conflict do nothing;

-- Coordinador: opera la estructura y la bandeja, no elimina ni administra.
insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from public.roles r
cross join public.permisos p
where public.fn_normalizar(r.nombre) = 'coordinador académico'
  and p.codigo in (
    'bi.consultar', 'bi.exportar',
    'actividades.ver', 'actividades.crear', 'actividades.editar',
    'solicitudes.crear', 'solicitudes.revisar',
    'usuarios.ver'
  )
on conflict do nothing;

-- Auditor: mira, no toca.
insert into public.rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from public.roles r
cross join public.permisos p
where public.fn_normalizar(r.nombre) = 'auditor externo'
  and p.codigo in (
    'bi.consultar', 'actividades.ver', 'usuarios.ver', 'auditoria.consultar'
  )
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Periodo académico inicial
-- -----------------------------------------------------------------------------
insert into public.periodos (codigo, nombre, fecha_inicio, fecha_fin, estado) values
  ('2026-1', 'Periodo 2026-1', '2026-01-15', '2026-06-30', 'cerrado'),
  ('2026-2', 'Periodo 2026-2', '2026-07-15', '2026-12-15', 'abierto')
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- Estructura de actividades de arranque
-- -----------------------------------------------------------------------------
-- Las raíces primero; los hijos se enganchan por código en un paso aparte,
-- de modo que volver a ejecutar la semilla no rompa nada.
insert into public.actividades (codigo, nomenclatura, tipo, estado, orden) values
  ('ACT-001', 'Gestión Académica',           'principal', 'activa', 1),
  ('ACT-002', 'Investigación Institucional', 'principal', 'activa', 2),
  ('ACT-003', 'Extensión y Vinculación',     'principal', 'activa', 3)
on conflict do nothing;

insert into public.actividades (codigo, nomenclatura, tipo, padre_id, estado, orden)
select
  v.codigo,
  v.nomenclatura,
  v.tipo::public.tipo_actividad,
  padre.id,
  v.estado::public.estado_actividad,
  v.orden
from (values
  ('SUB-001A', 'Planificación de Semestre',       'directa', 'ACT-001', 'activa',   1),
  ('SUB-001B', 'Soporte Técnico y Plataformas',   'apoyo',   'ACT-001', 'revision', 2),
  ('SUB-002A', 'Recolección de Datos de Campo',   'directa', 'ACT-002', 'activa',   1),
  ('SUB-002B', 'Análisis Estadístico Preliminar', 'apoyo',   'ACT-002', 'activa',   2)
) as v(codigo, nomenclatura, tipo, padre_codigo, estado, orden)
join public.actividades padre on upper(padre.codigo) = v.padre_codigo
on conflict do nothing;

-- Acceso de las vicerrectorías a las ramas principales
insert into public.actividad_vicerrectorias (actividad_id, vicerrectoria_id)
select a.id, v.id
from public.actividades a
join public.vicerrectorias v on (
  (a.codigo = 'ACT-001' and v.codigo in ('VAC', 'DGH')) or
  (a.codigo = 'ACT-002' and v.codigo in ('VIN', 'DFI')) or
  (a.codigo = 'ACT-003' and v.codigo in ('VEX'))
)
on conflict do nothing;

-- Ejecución de las actividades en el periodo abierto
insert into public.actividad_periodo (actividad_id, periodo_id, estado)
select a.id, p.id, 'planificada'
from public.actividades a
cross join public.periodos p
where p.estado = 'abierto'
on conflict (actividad_id, periodo_id) do nothing;
