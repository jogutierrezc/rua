-- =============================================================================
-- Rua · Datos de demostración
--
-- NO es parte de las migraciones: se aplica sólo en desarrollo, con
--   supabase db reset
-- que ejecuta migrations/ y después este archivo.
--
-- Los usuarios se crean directamente en auth.users porque en local no hay
-- servidor de correo. El trigger fn_perfil_al_registrar levanta su perfil;
-- luego les asignamos rol y vicerrectoría.
--
-- Contraseña de todas las cuentas: Rua.2026
-- =============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  u.correo,
  crypt('Rua.2026', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('nombre_completo', u.nombre)
from (values
  ('admin@institucion.edu',    'Ana Dirección'),
  ('r.reyes@institucion.edu',  'Dra. Rosalinda Reyes'),
  ('v.valdes@institucion.edu', 'Mtro. Víctor Valdés'),
  ('g.garza@institucion.edu',  'Lic. Gabriela Garza'),
  ('e.soto@institucion.edu',   'Ing. Eduardo Soto')
) as u(correo, nombre)
where not exists (select 1 from auth.users a where a.email = u.correo);

-- Rol, cargo y unidad de cada perfil
update public.perfiles p
set rol_id = r.id,
    vicerrectoria_id = v.id,
    cargo = d.cargo
from (values
  ('admin@institucion.edu',    'administrador del sistema', 'VAC', 'Dirección de Sistemas'),
  ('r.reyes@institucion.edu',  'decano de facultad',        'VAC', 'Decana Académica'),
  ('v.valdes@institucion.edu', 'coordinador académico',     'VAC', 'Coordinador de Currículo'),
  ('g.garza@institucion.edu',  'auditor externo',           'DFI', 'Auditoría Interna'),
  ('e.soto@institucion.edu',   'coordinador académico',     'VIN', 'Coordinador de Investigación')
) as d(correo, rol, vic, cargo)
join public.roles r on public.fn_normalizar(r.nombre) = d.rol
join public.vicerrectorias v on v.codigo = d.vic
where lower(p.correo) = d.correo;

-- -----------------------------------------------------------------------------
-- Solicitudes de ejemplo, para que la bandeja y el panel BI no arranquen vacíos.
--
-- Las restricciones del esquema se respetan aquí a propósito:
--   · 'editar' y 'eliminar' exigen actividad_id  (solicitudes_objetivo_coherente)
--   · 'crear'  exige nomenclatura y tipo propuestos (solicitudes_propuesta_coherente)
--   · 'aprobada'/'denegada' exigen resolutor y fecha (solicitudes_resolucion_completa)
--   · el concepto justificativo debe superar 150 caracteres fuera de borrador
-- -----------------------------------------------------------------------------
insert into public.solicitudes (
  tipo, estado, prioridad, solicitante_id, periodo_id,
  actividad_id, actividad_principal_id,
  propuesta_codigo, propuesta_nomenclatura, propuesta_tipo,
  concepto_justificativo, resuelto_por, resuelto_en
)
select
  s.tipo::public.tipo_solicitud,
  s.estado::public.estado_solicitud,
  s.prioridad::public.prioridad,
  autor.id,
  per.id,
  objetivo.id,
  principal.id,
  s.codigo,
  s.nomenclatura,
  case when s.tipo = 'crear' then 'directa'::public.tipo_actividad end,
  s.justificacion,
  case when s.estado in ('aprobada', 'denegada') then decano.id end,
  case when s.estado in ('aprobada', 'denegada') then now() - interval '2 days' end
from (values
  ('crear', 'pendiente', 'normal',
   'v.valdes@institucion.edu', 'ACT-001', null, 'SUB-014',
   'Seminario de Investigación Aplicada II',
   'Se requiere aperturar una nueva sección del seminario debido a la alta demanda registrada entre los estudiantes de término. La proyección de matrícula para el periodo supera en un 40 % la capacidad de la sección actual, lo que compromete la calidad de la asesoría individual establecida en el reglamento de titulación. La apertura no implica contratación adicional: se cubre con la carga disponible del cuerpo académico de tiempo completo.'),

  ('editar', 'pendiente', 'urgente',
   'r.reyes@institucion.edu', 'ACT-001', 'SUB-001A', null, null,
   'URGENTE: se solicita el cambio de horario de las prácticas por la disponibilidad de laboratorios en el hospital sede, que reprogramó su calendario de rotaciones con dos semanas de aviso. De no ajustarse antes del cierre de inscripciones, treinta y dos estudiantes quedarían sin campo clínico asignado y se retrasaría su egreso un periodo completo.'),

  ('crear', 'aprobada', 'normal',
   'e.soto@institucion.edu', 'ACT-002', null, 'SUB-021',
   'Simposio de Innovación Tecnológica',
   'Evento extracurricular aprobado en consejo universitario según acta 452. Se solicita su incorporación formal a la estructura de actividades para poder asignarle presupuesto, responsable y registro de participación. El simposio ya cuenta con financiamiento externo confirmado y no requiere recursos adicionales de la institución más allá del uso de espacios.'),

  ('eliminar', 'denegada', 'normal',
   'v.valdes@institucion.edu', 'ACT-001', 'SUB-001B', null, null,
   'Se solicita la baja de la actividad de soporte por no alcanzar el quórum mínimo de participación, con únicamente tres registros frente a los doce que exige el reglamento de apertura. La actividad ha quedado desierta en los dos periodos anteriores y su permanencia en la estructura genera confusión al calcular la carga docente asignada a la rama.')
) as s(tipo, estado, prioridad, correo, principal_codigo, objetivo_codigo, codigo, nomenclatura, justificacion)
join public.perfiles autor on lower(autor.correo) = s.correo
join public.actividades principal on upper(principal.codigo) = s.principal_codigo
left join public.actividades objetivo on upper(objetivo.codigo) = s.objetivo_codigo
cross join lateral (select id from public.periodos where estado = 'abierto' limit 1) per
cross join lateral (
  select id from public.perfiles where lower(correo) = 'r.reyes@institucion.edu' limit 1
) decano
where not exists (
  select 1 from public.solicitudes x where x.concepto_justificativo = s.justificacion
);
