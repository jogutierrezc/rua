-- =============================================================================
-- Rua · 23 — El SNIES manda, y la carga masiva
--
-- Dos correcciones sobre la migración 22 y una capacidad nueva.
--
-- 1 · Se invierte qué identifica a un programa. El registro único es interno y
--     puede no existir todavía; el código SNIES lo asigna el Ministerio y es lo
--     que de verdad identifica al programa frente al Estado. Se renombra
--     `codigo_unico` a `registro_unico` —que es como lo llama la oficina—, deja
--     de ser obligatorio, y `snies` pasa a serlo.
--
-- 2 · La carga masiva. Una oferta académica no se teclea programa a programa:
--     ya vive en una hoja de cálculo, y lo que hace falta es traerla.
--
-- La validación y la importación comparten el MISMO normalizador de filas. Es
-- la única forma de que la previsualización no mienta: si el que valida y el
-- que escribe limpian el texto distinto, el usuario aprueba una cosa y se
-- guarda otra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- La identidad del programa
-- -----------------------------------------------------------------------------
alter table public.programas_udes rename column codigo_unico to registro_unico;

alter table public.programas_udes alter column registro_unico drop not null;

-- El único con nulos es exactamente lo que hace falta: dos programas SIN
-- registro no chocan entre sí, pero dos con el mismo sí.
alter table public.programas_udes drop constraint if exists programas_codigo_no_vacio;
alter table public.programas_udes
  add constraint programas_registro_unico_valido check (
    registro_unico is null or length(trim(registro_unico)) >= 2
  );

-- Si esto falla, hay programas sin SNIES: complétalos antes de aplicar la
-- migración. Es mejor que se pare aquí, ruidosamente, a que la obligatoriedad
-- se quede a medias y el módulo tenga filas que la interfaz no puede editar.
alter table public.programas_udes alter column snies set not null;
alter table public.programas_udes
  add constraint programas_snies_valido check (length(trim(snies)) >= 3);

create index if not exists programas_udes_snies_idx on public.programas_udes (snies);

comment on column public.programas_udes.registro_unico is
  'Identificador interno de la Universidad. Opcional: no todos los programas lo tienen.';
comment on column public.programas_udes.snies is
  'Código del Ministerio. Obligatorio: es lo que identifica al programa frente al Estado.';

-- La vista se recrea entera, no se reemplaza: `create or replace view` no puede
-- renombrar una columna, y con `select p.*` el nombre viejo quedó congelado en
-- su definición.
drop view if exists public.v_programas_udes;

create view public.v_programas_udes
with (security_invoker = true) as
select
  p.*,
  (p.rc_fecha_vencimiento - current_date) as dias_para_vencimiento,
  case
    when p.rc_fecha_vencimiento is null then 'sin_registro'
    when p.rc_fecha_vencimiento < current_date then 'vencido'
    when p.rc_fecha_vencimiento <= current_date + interval '3 months' then 'por_vencer'
    when p.rc_fecha_vencimiento <= current_date + interval '12 months' then 'proximo'
    else 'vigente'
  end as estado_vigencia,
  (select count(*) from public.programa_observaciones o where o.programa_id = p.id)
    as total_observaciones,
  cp.nombre_completo as creado_por_nombre
from public.programas_udes p
left join public.perfiles cp on cp.id = p.creado_por;

comment on view public.v_programas_udes is
  'Programas con el tiempo restante de su registro calificado ya calculado. Única fuente del plazo.';

-- El preaviso nombraba la columna vieja.
create or replace function public.fn_encolar_avisos_vencimiento()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_programa record;
  v_dest     record;
  v_vars     jsonb;
  v_config   jsonb;
  v_enviados integer := 0;
begin
  select correo into v_config from public.configuracion where id;

  for v_programa in
    select p.*, (p.rc_fecha_vencimiento - current_date) as dias
    from public.programas_udes p
    where p.estado = 'activo'
      and p.aviso_vencimiento_en is null
      and p.rc_fecha_vencimiento is not null
      and p.rc_fecha_vencimiento <= current_date + interval '3 months'
    order by p.rc_fecha_vencimiento
  loop
    v_vars := jsonb_build_object(
      'programa',          v_programa.nombre,
      'codigo_unico',      coalesce(v_programa.registro_unico, 'N/A'),
      'snies',             v_programa.snies,
      'facultad',          v_programa.facultad,
      'nivel',             replace(v_programa.nivel::text, '_', ' '),
      'campus',            v_programa.campus,
      'modalidad',         v_programa.modalidad::text,
      'resolucion',        coalesce(v_programa.rc_resolucion, 'Sin número de resolución'),
      'fecha_registro',    coalesce(to_char(v_programa.rc_fecha_registro, 'DD/MM/YYYY'), '—'),
      'fecha_vencimiento', to_char(v_programa.rc_fecha_vencimiento, 'DD/MM/YYYY'),
      'dias',              v_programa.dias::text,
      'institucion',       (select coalesce(c.nombre_institucion, 'Gestión Académica')
                            from public.configuracion c),
      'enlace',            coalesce(nullif(trim(v_config ->> 'url_portal'), ''), '')
    );

    for v_dest in select * from public.fn_destinatarios_permiso('planeacion.administrar') loop
      perform public.fn_encolar_correo(
        'vencimiento_registro',
        v_dest.correo,
        v_dest.nombre,
        v_vars || jsonb_build_object('destinatario', v_dest.nombre)
      );
      v_enviados := v_enviados + 1;
    end loop;

    update public.programas_udes
    set aviso_vencimiento_en = now()
    where id = v_programa.id;
  end loop;

  return v_enviados;
end;
$fn$;

revoke all on function public.fn_encolar_avisos_vencimiento() from public;
grant execute on function public.fn_encolar_avisos_vencimiento() to service_role;

-- =============================================================================
-- Importación
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conversores tolerantes
--
-- Devuelven NULL en vez de reventar. Una celda mal escrita tiene que salir en
-- la previsualización como un problema de esa fila, no como una excepción que
-- tumba el archivo entero y no dice cuál era la fila mala.
-- -----------------------------------------------------------------------------
create or replace function public.fn_fecha_flexible(p_texto text)
returns date
language plpgsql
immutable
as $fn$
declare
  t text := btrim(coalesce(p_texto, ''));
begin
  if t = '' then return null; end if;
  -- Excel exporta ISO; una persona escribe DD/MM/AAAA. Se aceptan los dos y
  -- nada más: adivinar entre 03/04 y 04/03 es inventarse la fecha.
  if t ~ '^\d{4}-\d{2}-\d{2}' then return substring(t from 1 for 10)::date; end if;
  if t ~ '^\d{1,2}[/-]\d{1,2}[/-]\d{4}$' then
    return to_date(replace(t, '-', '/'), 'DD/MM/YYYY');
  end if;
  return null;
exception when others then
  return null;
end;
$fn$;

create or replace function public.fn_entero_flexible(p_texto text)
returns integer
language plpgsql
immutable
as $fn$
declare
  t text := regexp_replace(btrim(coalesce(p_texto, '')), '[^0-9-]', '', 'g');
begin
  if t = '' then return null; end if;
  return t::integer;
exception when others then
  return null;
end;
$fn$;

create or replace function public.fn_si_no(p_texto text)
returns boolean
language sql
immutable
as $fn$
  select public.fn_normalizar(coalesce(p_texto, '')) in ('si', 'sí', 'x', 'true', '1', 'verdadero');
$fn$;

create or replace function public.fn_nivel_programa(p_texto text)
returns public.nivel_programa
language sql
immutable
as $fn$
  select case public.fn_normalizar(coalesce(p_texto, ''))
    when 'tecnico profesional'   then 'tecnico_profesional'
    when 'tecnico'               then 'tecnico_profesional'
    when 'tecnologico'           then 'tecnologico'
    when 'profesional'           then 'profesional'
    when 'pregrado'              then 'profesional'
    when 'universitario'         then 'profesional'
    when 'especializacion'       then 'especializacion'
    when 'especializacion medico quirurgica' then 'especializacion_medico_quirurgica'
    when 'maestria'              then 'maestria'
    when 'doctorado'             then 'doctorado'
    else null
  end::public.nivel_programa;
$fn$;

create or replace function public.fn_modalidad_programa(p_texto text)
returns public.modalidad_programa
language sql
immutable
as $fn$
  select case public.fn_normalizar(coalesce(p_texto, ''))
    when 'presencial'   then 'presencial'
    when 'distancia'    then 'distancia'
    when 'a distancia'  then 'distancia'
    when 'virtual'      then 'virtual'
    when 'dual'         then 'dual'
    else null
  end::public.modalidad_programa;
$fn$;

create or replace function public.fn_tipo_cupos(p_texto text)
returns public.tipo_cupos
language sql
immutable
as $fn$
  select case public.fn_normalizar(coalesce(p_texto, ''))
    when 'trimestral' then 'trimestral'
    when 'semestral'  then 'semestral'
    when 'anual'      then 'anual'
    when 'cohorte'    then 'cohorte'
    when 'por cohorte' then 'cohorte'
    when 'variacion por cohortes' then 'variacion_por_cohortes'
    else null
  end::public.tipo_cupos;
$fn$;

-- -----------------------------------------------------------------------------
-- Normalizador de fila
--
-- Acepta varios nombres para la misma columna. No es indulgencia gratuita: la
-- hoja viene de una oficina que la lleva escribiendo años, y obligarla a
-- renombrar cabeceras para poder importar es la clase de fricción que hace que
-- la gente vuelva a teclear a mano.
-- -----------------------------------------------------------------------------
create or replace function public.fn_normalizar_fila_programa(p_fila jsonb)
returns jsonb
language sql
immutable
parallel safe
as $fn$
  select jsonb_build_object(
    'registro_unico', nullif(btrim(coalesce(
      p_fila ->> 'registro_unico', p_fila ->> 'codigo_unico', p_fila ->> 'registro', '')), ''),
    'snies', nullif(btrim(coalesce(
      p_fila ->> 'snies', p_fila ->> 'codigo_snies', '')), ''),
    'facultad', nullif(btrim(coalesce(p_fila ->> 'facultad', '')), ''),
    'nivel', nullif(btrim(coalesce(p_fila ->> 'nivel', '')), ''),
    'nombre', nullif(btrim(coalesce(
      p_fila ->> 'nombre', p_fila ->> 'nombre_del_programa', p_fila ->> 'programa', '')), ''),
    'campus', nullif(btrim(coalesce(p_fila ->> 'campus', p_fila ->> 'sede', '')), ''),
    'modalidad', nullif(btrim(coalesce(p_fila ->> 'modalidad', '')), ''),
    'rc_resolucion', nullif(btrim(coalesce(
      p_fila ->> 'rc_resolucion', p_fila ->> 'registro_calificado_resolucion',
      p_fila ->> 'resolucion_registro_calificado', '')), ''),
    'rc_fecha_registro', nullif(btrim(coalesce(
      p_fila ->> 'rc_fecha_registro', p_fila ->> 'fecha_de_registro',
      p_fila ->> 'fecha_registro', '')), ''),
    'rc_fecha_vencimiento', nullif(btrim(coalesce(
      p_fila ->> 'rc_fecha_vencimiento', p_fila ->> 'fecha_de_vencimiento',
      p_fila ->> 'fecha_vencimiento', '')), ''),
    'ac_resolucion', nullif(btrim(coalesce(
      p_fila ->> 'ac_resolucion', p_fila ->> 'resolucion_acreditacion',
      p_fila ->> 'registro_acreditacion', '')), ''),
    'ac_fecha_resolucion', nullif(btrim(coalesce(
      p_fila ->> 'ac_fecha_resolucion', p_fila ->> 'fecha_de_resolucion',
      p_fila ->> 'fecha_resolucion', '')), ''),
    'cupos_aprobados', nullif(btrim(coalesce(
      p_fila ->> 'cupos_aprobados', p_fila ->> 'cupos_de_estudiantes_aprobados',
      p_fila ->> 'cupos', '')), ''),
    'tipo_cupos', nullif(btrim(coalesce(
      p_fila ->> 'tipo_cupos', p_fila ->> 'tipo_de_cupos', '')), ''),
    'ano_creacion', nullif(btrim(coalesce(
      p_fila ->> 'ano_creacion', p_fila ->> 'ano_de_creacion',
      p_fila ->> 'anio_de_creacion', '')), ''),
    'cumple_ci_para_ac', nullif(btrim(coalesce(
      p_fila ->> 'cumple_ci_para_ac', p_fila ->> 'cumple_ci', '')), '')
  );
$fn$;

-- -----------------------------------------------------------------------------
-- Previsualización
--
-- No escribe nada. Dice, fila a fila, qué va a pasar y qué está mal ANTES de
-- confirmar. Un importador que sólo informa al terminar convierte cada error
-- en una limpieza a posteriori.
-- -----------------------------------------------------------------------------
create or replace function public.fn_validar_importacion_programas(p_filas jsonb)
returns table (
  linea          int,
  registro_unico text,
  snies          text,
  nombre         text,
  facultad       text,
  nivel          text,
  accion         text,   -- 'crear' | 'actualizar' | 'error'
  severidad      text,   -- 'ok' | 'aviso' | 'error'
  mensaje        text
)
language sql
stable
security invoker
set search_path = public
as $fn$
  with crudas as (
    select
      (orden)::int as linea,
      public.fn_normalizar_fila_programa(fila) as f
    from jsonb_array_elements(p_filas) with ordinality as t(fila, orden)
  ),
  evaluadas as (
    select
      c.linea,
      c.f ->> 'registro_unico' as registro_unico,
      c.f ->> 'snies'          as snies,
      c.f ->> 'nombre'         as nombre,
      c.f ->> 'facultad'       as facultad,
      c.f ->> 'nivel'          as nivel,
      public.fn_nivel_programa(c.f ->> 'nivel')         as nivel_ok,
      public.fn_modalidad_programa(c.f ->> 'modalidad') as modalidad_ok,
      c.f ->> 'modalidad' as modalidad,
      public.fn_fecha_flexible(c.f ->> 'rc_fecha_registro')    as f_registro,
      public.fn_fecha_flexible(c.f ->> 'rc_fecha_vencimiento') as f_vencimiento,
      c.f ->> 'rc_fecha_registro'    as t_registro,
      c.f ->> 'rc_fecha_vencimiento' as t_vencimiento,
      (select pu.id from public.programas_udes pu where pu.snies = c.f ->> 'snies') as existente,
      -- El registro único, si viene, no puede estar ya en OTRO programa.
      (select pu.snies from public.programas_udes pu
        where c.f ->> 'registro_unico' is not null
          and pu.registro_unico = c.f ->> 'registro_unico'
          and pu.snies is distinct from c.f ->> 'snies') as registro_ajeno
    from crudas c
  )
  select
    e.linea,
    e.registro_unico,
    e.snies,
    e.nombre,
    e.facultad,
    e.nivel,
    case
      when e.snies is null or e.nombre is null or e.facultad is null
        or e.nivel_ok is null or e.modalidad_ok is null
        or e.registro_ajeno is not null
        or (e.t_registro is not null and e.f_registro is null)
        or (e.t_vencimiento is not null and e.f_vencimiento is null)
        or (e.f_registro is not null and e.f_vencimiento is not null
            and e.f_vencimiento <= e.f_registro)
      then 'error'
      when e.existente is not null then 'actualizar'
      else 'crear'
    end as accion,
    case
      when e.snies is null or e.nombre is null or e.facultad is null
        or e.nivel_ok is null or e.modalidad_ok is null
        or e.registro_ajeno is not null
        or (e.t_registro is not null and e.f_registro is null)
        or (e.t_vencimiento is not null and e.f_vencimiento is null)
        or (e.f_registro is not null and e.f_vencimiento is not null
            and e.f_vencimiento <= e.f_registro)
      then 'error'
      when e.f_vencimiento is null then 'aviso'
      else 'ok'
    end as severidad,
    case
      when e.snies is null then 'Falta el código SNIES, que es obligatorio.'
      when e.nombre is null then 'Falta el nombre del programa.'
      when e.facultad is null then 'Falta la facultad.'
      when e.nivel_ok is null then
        'Nivel no reconocido: «' || coalesce(e.nivel, '') || '».'
      when e.modalidad_ok is null then
        'Modalidad no reconocida: «' || coalesce(e.modalidad, '') || '».'
      when e.registro_ajeno is not null then
        'El registro único ya es de otro programa (SNIES ' || e.registro_ajeno || ').'
      when e.t_registro is not null and e.f_registro is null then
        'Fecha de registro ilegible. Usa AAAA-MM-DD o DD/MM/AAAA.'
      when e.t_vencimiento is not null and e.f_vencimiento is null then
        'Fecha de vencimiento ilegible. Usa AAAA-MM-DD o DD/MM/AAAA.'
      when e.f_registro is not null and e.f_vencimiento is not null
        and e.f_vencimiento <= e.f_registro then
        'El vencimiento no puede ser anterior al registro.'
      when e.f_vencimiento is null then
        'Sin fecha de vencimiento: este programa no entrará en la vigilancia de vencimientos.'
      when e.existente is not null then 'Se actualizará el programa existente.'
      else 'Se creará.'
    end as mensaje
  from evaluadas e
  order by e.linea;
$fn$;

grant execute on function public.fn_validar_importacion_programas to authenticated;

-- -----------------------------------------------------------------------------
-- Importación
--
-- La clave de coincidencia es el SNIES, no el registro único: el SNIES es lo
-- que identifica al programa de verdad, y el registro interno puede llegar
-- después o no llegar nunca.
-- -----------------------------------------------------------------------------
create or replace function public.fn_importar_programas(
  p_filas jsonb,
  p_modo  text default 'mezclar'      -- 'mezclar' | 'solo_crear' | 'solo_actualizar'
)
returns table (creados int, actualizados int, omitidos int)
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_fila     jsonb;
  v_f        jsonb;
  v_id       uuid;
  v_creados  int := 0;
  v_actual   int := 0;
  v_omitidos int := 0;
begin
  if not public.fn_tengo_permiso('planeacion.administrar') then
    raise exception 'No tienes permiso para importar programas.'
      using errcode = 'insufficient_privilege';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_f := public.fn_normalizar_fila_programa(v_fila);

    -- Las filas con error ya se le enseñaron a quien confirmó; aquí se saltan
    -- en silencio en vez de abortar todo el lote. Importar 400 programas y
    -- perderlos por dos celdas mal escritas no ayuda a nadie.
    if v_f ->> 'snies' is null
      or v_f ->> 'nombre' is null
      or v_f ->> 'facultad' is null
      or public.fn_nivel_programa(v_f ->> 'nivel') is null
      or public.fn_modalidad_programa(v_f ->> 'modalidad') is null
    then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    select id into v_id from public.programas_udes where snies = v_f ->> 'snies';

    if v_id is not null and p_modo = 'solo_crear' then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;
    if v_id is null and p_modo = 'solo_actualizar' then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;

    if v_id is null then
      insert into public.programas_udes (
        registro_unico, snies, facultad, nivel, nombre, campus, modalidad,
        rc_resolucion, rc_fecha_registro, rc_fecha_vencimiento,
        ac_resolucion, ac_fecha_resolucion,
        cupos_aprobados, tipo_cupos, ano_creacion, cumple_ci_para_ac, creado_por
      )
      values (
        v_f ->> 'registro_unico',
        v_f ->> 'snies',
        v_f ->> 'facultad',
        public.fn_nivel_programa(v_f ->> 'nivel'),
        v_f ->> 'nombre',
        coalesce(v_f ->> 'campus', 'Sin campus'),
        public.fn_modalidad_programa(v_f ->> 'modalidad'),
        v_f ->> 'rc_resolucion',
        public.fn_fecha_flexible(v_f ->> 'rc_fecha_registro'),
        public.fn_fecha_flexible(v_f ->> 'rc_fecha_vencimiento'),
        v_f ->> 'ac_resolucion',
        public.fn_fecha_flexible(v_f ->> 'ac_fecha_resolucion'),
        public.fn_entero_flexible(v_f ->> 'cupos_aprobados'),
        public.fn_tipo_cupos(v_f ->> 'tipo_cupos'),
        public.fn_entero_flexible(v_f ->> 'ano_creacion'),
        public.fn_si_no(v_f ->> 'cumple_ci_para_ac'),
        auth.uid()
      );
      v_creados := v_creados + 1;
    else
      -- `coalesce` en cada campo: una celda vacía en la hoja significa «no lo
      -- sé», no «bórralo». Vaciar un dato existente porque la columna venía en
      -- blanco sería destruir información con una importación de rutina.
      update public.programas_udes p
      set registro_unico       = coalesce(v_f ->> 'registro_unico', p.registro_unico),
          facultad             = v_f ->> 'facultad',
          nivel                = public.fn_nivel_programa(v_f ->> 'nivel'),
          nombre               = v_f ->> 'nombre',
          campus               = coalesce(v_f ->> 'campus', p.campus),
          modalidad            = public.fn_modalidad_programa(v_f ->> 'modalidad'),
          rc_resolucion        = coalesce(v_f ->> 'rc_resolucion', p.rc_resolucion),
          rc_fecha_registro    = coalesce(
            public.fn_fecha_flexible(v_f ->> 'rc_fecha_registro'), p.rc_fecha_registro),
          rc_fecha_vencimiento = coalesce(
            public.fn_fecha_flexible(v_f ->> 'rc_fecha_vencimiento'), p.rc_fecha_vencimiento),
          ac_resolucion        = coalesce(v_f ->> 'ac_resolucion', p.ac_resolucion),
          ac_fecha_resolucion  = coalesce(
            public.fn_fecha_flexible(v_f ->> 'ac_fecha_resolucion'), p.ac_fecha_resolucion),
          cupos_aprobados      = coalesce(
            public.fn_entero_flexible(v_f ->> 'cupos_aprobados'), p.cupos_aprobados),
          tipo_cupos           = coalesce(
            public.fn_tipo_cupos(v_f ->> 'tipo_cupos'), p.tipo_cupos),
          ano_creacion         = coalesce(
            public.fn_entero_flexible(v_f ->> 'ano_creacion'), p.ano_creacion),
          -- La casilla es booleana: en blanco es «no», no «no lo sé». Sólo se
          -- toca si la columna venía en la hoja.
          cumple_ci_para_ac    = case
            when v_f ->> 'cumple_ci_para_ac' is null then p.cumple_ci_para_ac
            else public.fn_si_no(v_f ->> 'cumple_ci_para_ac')
          end
      where p.id = v_id;
      v_actual := v_actual + 1;
    end if;
  end loop;

  return query select v_creados, v_actual, v_omitidos;
end;
$fn$;

comment on function public.fn_importar_programas is
  'Crea o actualiza programas desde una hoja de cálculo, emparejando por código SNIES. Una celda vacía nunca borra un dato existente.';

grant execute on function public.fn_importar_programas to authenticated;

-- -----------------------------------------------------------------------------
-- La importación tiene su sitio en el menú
-- -----------------------------------------------------------------------------
insert into public.menu_entradas
  (codigo, grupo_codigo, etiqueta, ruta, icono, permiso_codigo, orden, es_sistema)
values
  ('programas-importar', 'planeacion', 'Importar Programas', '/planeacion/importar',
   'Database', 'planeacion.administrar', 5, true)
on conflict (codigo) do nothing;
