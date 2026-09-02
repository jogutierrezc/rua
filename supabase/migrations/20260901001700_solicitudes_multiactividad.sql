-- =============================================================================
-- Rua · 17 — Una solicitud, varias actividades
--
-- El modelo suponía que cada expediente tocaba UNA actividad. La realidad de
-- una reforma curricular es otra: se renombran ocho subactividades del mismo
-- pilar, con la misma justificación y la misma cadena de firmas. Obligar a
-- abrir ocho expedientes multiplica por ocho el trabajo del solicitante Y el
-- del comité, y rompe lo único que importaba: que las ocho se decidan juntas.
--
-- Los campos `propuesta_*` de `solicitudes` no desaparecen. Siguen ahí como
-- REFLEJO de la primera línea, porque de ellos cuelgan las vistas, los correos
-- y las restricciones que ya existen. La fuente de verdad pasa a ser
-- `solicitud_actividades`; los campos viejos los escribe la función de
-- guardado, nunca la interfaz.
--
-- Por qué se guarda con una función y no con INSERT directo: la solicitud y
-- sus líneas tienen que entrar en la MISMA transacción. Escribirlas por
-- separado desde el cliente abriría una ventana en la que el expediente ya
-- está en la bandeja del comité con la mitad de las actividades cargadas, y
-- obligaría a dejar las líneas editables mientras la solicitud está pendiente
-- — es decir, a permitir cambiar lo que se pide después de que alguien lo
-- haya firmado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Las líneas del expediente
-- -----------------------------------------------------------------------------
create table if not exists public.solicitud_actividades (
  id           uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes (id) on delete cascade,

  -- La actividad afectada. Nula en un alta: todavía no existe.
  actividad_id uuid references public.actividades (id) on delete cascade,

  -- El pilar bajo el que cuelga o colgará. Nulo sólo si se está creando una
  -- actividad principal, que por definición no tiene padre.
  actividad_principal_id uuid references public.actividades (id) on delete set null,

  -- Lo que se propone para ESTA actividad. En una modificación se precargan
  -- con el código y la nomenclatura actuales y el solicitante edita lo que
  -- quiere cambiar: así el expediente dice siempre cómo debe quedar, no un
  -- «cámbiese el nombre» que hay que interpretar.
  propuesta_codigo       text,
  propuesta_nomenclatura text,
  propuesta_tipo         public.tipo_actividad,

  orden smallint not null default 0,

  -- Resultado de la materialización, línea a línea. Si una reforma de ocho
  -- actividades se aplica, aquí queda qué se creó o se tocó en cada una.
  actividad_resultante_id uuid references public.actividades (id) on delete set null,
  aplicada_en             timestamptz,

  creado_en timestamptz not null default now(),

  -- La misma actividad no puede aparecer dos veces en el mismo expediente:
  -- serían dos cambios contradictorios sobre la misma fila, aplicados en un
  -- orden que nadie decidió. Las líneas de alta llevan `actividad_id` nula y
  -- no chocan entre sí, que es justo lo que hace falta.
  unique (solicitud_id, actividad_id)
);

create index if not exists solicitud_actividades_solicitud_idx
  on public.solicitud_actividades (solicitud_id, orden);
create index if not exists solicitud_actividades_actividad_idx
  on public.solicitud_actividades (actividad_id);

comment on table public.solicitud_actividades is
  'Actividades afectadas por una solicitud, con la propuesta de cada una. Fuente de verdad; los campos propuesta_* de solicitudes son su reflejo.';

-- -----------------------------------------------------------------------------
-- Los expedientes que ya existen pasan a tener su línea
--
-- Sin esto, un expediente anterior a esta migración se quedaría sin líneas y
-- al aprobarse no aplicaría nada. Se traduce uno a uno: lo que había era
-- exactamente una actividad por solicitud.
-- -----------------------------------------------------------------------------
insert into public.solicitud_actividades (
  solicitud_id, actividad_id, actividad_principal_id,
  propuesta_codigo, propuesta_nomenclatura, propuesta_tipo, orden
)
select
  s.id, s.actividad_id, s.actividad_principal_id,
  s.propuesta_codigo, s.propuesta_nomenclatura, s.propuesta_tipo, 0
from public.solicitudes s
where not exists (
  select 1 from public.solicitud_actividades sa where sa.solicitud_id = s.id
);

-- -----------------------------------------------------------------------------
-- RLS
--
-- Se lee lo que se puede leer del expediente padre: la subconsulta pasa por la
-- política de `solicitudes`, así que no hay que repetir aquí sus tres casos.
--
-- No hay política de escritura. Igual que `solicitud_etapas`, la única vía es
-- la función de guardado, que corre como definer y comprueba antes de tocar
-- nada. Un UPDATE directo permitiría cambiar lo solicitado después de firmado.
-- -----------------------------------------------------------------------------
alter table public.solicitud_actividades enable row level security;

drop policy if exists "solicitud_actividades_lectura" on public.solicitud_actividades;
create policy "solicitud_actividades_lectura" on public.solicitud_actividades
  for select to authenticated
  using (
    exists (
      select 1 from public.solicitudes s
      where s.id = solicitud_actividades.solicitud_id
    )
  );

-- -----------------------------------------------------------------------------
-- Vista de lectura: la propuesta junto a lo que hay hoy
--
-- El revisor necesita ver las dos cosas a la vez para saber qué cambia. Sin el
-- estado actual al lado, «SUB-014 · Revisión de sílabos» no dice si eso es lo
-- que había o lo que se pide.
-- -----------------------------------------------------------------------------
create or replace view public.v_solicitud_actividades
with (security_invoker = true) as
select
  sa.id,
  sa.solicitud_id,
  sa.actividad_id,
  sa.actividad_principal_id,
  sa.propuesta_codigo,
  sa.propuesta_nomenclatura,
  sa.propuesta_tipo,
  sa.orden,
  sa.actividad_resultante_id,
  sa.aplicada_en,

  a.codigo       as actual_codigo,
  a.nomenclatura as actual_nomenclatura,
  a.tipo         as actual_tipo,
  a.estado       as actual_estado,

  p.codigo       as principal_codigo,
  p.nomenclatura as principal_nomenclatura
from public.solicitud_actividades sa
left join public.actividades a on a.id = sa.actividad_id
left join public.actividades p on p.id = sa.actividad_principal_id;

comment on view public.v_solicitud_actividades is
  'Líneas de una solicitud con el estado actual de cada actividad al lado de lo propuesto.';

-- -----------------------------------------------------------------------------
-- Guardado atómico de la solicitud y sus líneas
-- -----------------------------------------------------------------------------
create or replace function public.fn_guardar_solicitud(
  p_solicitud_id uuid,                    -- nulo: expediente nuevo
  p_tipo         public.tipo_solicitud,
  p_prioridad    public.prioridad,
  p_concepto     text,
  p_lineas       jsonb,
  p_enviar       boolean                  -- falso: se queda en borrador
)
returns table (id uuid, folio text)
language plpgsql
-- DEFINER: `solicitud_actividades` no tiene política de escritura y ésta es su
-- única puerta. La autorización está entera aquí dentro.
security definer
set search_path = public
as $fn$
declare
  v_id           uuid := p_solicitud_id;
  v_folio        text;
  v_estado       public.estado_solicitud;
  v_linea        jsonb;
  v_orden        smallint := 0;
  v_principal    uuid;
  v_actividad    uuid;
  v_codigo       text;
  v_nomenclatura text;
  v_primera      record;
begin
  if not public.fn_tengo_permiso('solicitudes.crear') then
    raise exception 'No tienes permiso para crear solicitudes.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Una solicitud tiene que afectar al menos a una actividad.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_estado := case when p_enviar then 'pendiente' else 'borrador' end::public.estado_solicitud;

  if p_enviar and length(trim(coalesce(p_concepto, ''))) < 150 then
    raise exception 'El concepto justificativo debe tener al menos 150 caracteres para enviarse a revisión.'
      using errcode = 'check_violation';
  end if;

  -- ---------------------------------------------------------------------------
  -- Se valida TODA la lista antes de escribir nada. La transacción revertiría
  -- igual, pero el error tiene que señalar qué línea está mal, no dejar una
  -- violación de clave ajena como único rastro.
  -- ---------------------------------------------------------------------------
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_principal    := nullif(v_linea ->> 'actividad_principal_id', '')::uuid;
    v_actividad    := nullif(v_linea ->> 'actividad_id', '')::uuid;
    v_nomenclatura := trim(coalesce(v_linea ->> 'nomenclatura', ''));

    if p_tipo = 'crear' then
      if v_nomenclatura = '' then
        raise exception 'Cada actividad que se quiera crear necesita su nomenclatura.'
          using errcode = 'check_violation';
      end if;
    else
      if v_actividad is null then
        raise exception 'Falta señalar la actividad afectada en una de las líneas.'
          using errcode = 'check_violation';
      end if;

      -- La actividad afectada tiene que colgar de la principal declarada. Es
      -- la regla que impide que un expediente mezcle pilares sin querer: se
      -- elige el pilar y se escoge DENTRO de él.
      if v_principal is not null and not exists (
        select 1
        from public.v_actividades_arbol va
        where va.id = v_actividad
          and coalesce(va.raiz_id, va.id) = v_principal
      ) then
        raise exception 'Una de las actividades seleccionadas no pertenece a la actividad principal indicada.'
          using errcode = 'check_violation';
      end if;
    end if;

    if v_principal is not null and not exists (
      select 1 from public.actividades a
      where a.id = v_principal and a.tipo = 'principal'
    ) then
      raise exception 'La actividad principal indicada no existe o no es una actividad principal.'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Cabecera
  --
  -- Nace ya con los datos de la PRIMERA línea. No es adelantarse al reflejo de
  -- más abajo: las restricciones `solicitudes_objetivo_coherente` y
  -- `solicitudes_propuesta_coherente` se comprueban en este mismo INSERT, y
  -- una cabecera sin actividad no llegaría a existir para que le colgaran las
  -- líneas después.
  -- ---------------------------------------------------------------------------
  v_principal    := nullif(p_lineas -> 0 ->> 'actividad_principal_id', '')::uuid;
  v_actividad    := nullif(p_lineas -> 0 ->> 'actividad_id', '')::uuid;
  v_codigo       := nullif(upper(trim(coalesce(p_lineas -> 0 ->> 'codigo', ''))), '');
  v_nomenclatura := nullif(trim(coalesce(p_lineas -> 0 ->> 'nomenclatura', '')), '');

  if v_id is null then
    insert into public.solicitudes (
      tipo, estado, prioridad, solicitante_id, periodo_id, concepto_justificativo,
      actividad_id, actividad_principal_id,
      propuesta_codigo, propuesta_nomenclatura, propuesta_tipo
    )
    values (
      p_tipo,
      'borrador',                          -- sube a pendiente al final, ya con líneas
      p_prioridad,
      auth.uid(),
      (select per.id from public.periodos per where per.estado = 'abierto' limit 1),
      trim(coalesce(p_concepto, '')),
      case when p_tipo = 'crear' then null else v_actividad end,
      v_principal,
      v_codigo,
      v_nomenclatura,
      case when p_tipo = 'crear'
        then coalesce(
          nullif(p_lineas -> 0 ->> 'tipo', '')::public.tipo_actividad,
          case when v_principal is null then 'principal' else 'directa' end::public.tipo_actividad
        )
      end
    )
    returning solicitudes.id into v_id;
  else
    -- Sólo el autor, y sólo mientras siga siendo borrador. Igual que la
    -- política de `solicitudes`: enviada, ya no se toca.
    if not exists (
      select 1 from public.solicitudes s
      where s.id = v_id and s.solicitante_id = auth.uid() and s.estado = 'borrador'
    ) then
      raise exception 'Sólo puedes editar tus propias solicitudes mientras sigan en borrador.'
        using errcode = 'insufficient_privilege';
    end if;

    delete from public.solicitud_actividades where solicitud_id = v_id;
  end if;

  -- ---------------------------------------------------------------------------
  -- Líneas
  -- ---------------------------------------------------------------------------
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_principal    := nullif(v_linea ->> 'actividad_principal_id', '')::uuid;
    v_actividad    := nullif(v_linea ->> 'actividad_id', '')::uuid;
    v_codigo       := nullif(upper(trim(coalesce(v_linea ->> 'codigo', ''))), '');
    v_nomenclatura := nullif(trim(coalesce(v_linea ->> 'nomenclatura', '')), '');

    insert into public.solicitud_actividades (
      solicitud_id, actividad_id, actividad_principal_id,
      propuesta_codigo, propuesta_nomenclatura, propuesta_tipo, orden
    )
    values (
      v_id,
      case when p_tipo = 'crear' then null else v_actividad end,
      v_principal,
      v_codigo,
      v_nomenclatura,
      case when p_tipo = 'crear'
        then coalesce(
          nullif(v_linea ->> 'tipo', '')::public.tipo_actividad,
          case when v_principal is null then 'principal' else 'directa' end::public.tipo_actividad
        )
      end,
      v_orden
    );

    v_orden := v_orden + 1;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Reflejo en la cabecera, y estado final
  --
  -- Las vistas, los correos y las restricciones de `solicitudes` siguen
  -- leyendo estos campos. Se rellenan con la PRIMERA línea, y se rellenan
  -- aquí: si los escribiera la interfaz volveríamos a tener dos verdades.
  --
  -- Todo en un solo UPDATE, incluido el tipo: cambiar el tipo por separado
  -- dejaría la fila un instante con `tipo` nuevo y actividad vieja, y las
  -- restricciones se comprueban en cada sentencia, no al final.
  -- ---------------------------------------------------------------------------
  select * into v_primera
  from public.solicitud_actividades
  where solicitud_id = v_id
  order by orden
  limit 1;

  update public.solicitudes
  set tipo                   = p_tipo,
      prioridad              = p_prioridad,
      concepto_justificativo = trim(coalesce(p_concepto, '')),
      actividad_id           = v_primera.actividad_id,
      actividad_principal_id = v_primera.actividad_principal_id,
      propuesta_codigo       = v_primera.propuesta_codigo,
      propuesta_nomenclatura = v_primera.propuesta_nomenclatura,
      propuesta_tipo         = v_primera.propuesta_tipo,
      estado                 = v_estado
  where solicitudes.id = v_id
  returning solicitudes.folio into v_folio;

  return query select v_id, v_folio;
end;
$fn$;

comment on function public.fn_guardar_solicitud is
  'Crea o actualiza una solicitud y sus actividades afectadas en una sola transacción. Única vía de escritura de solicitud_actividades.';

grant execute on function public.fn_guardar_solicitud to authenticated;

-- -----------------------------------------------------------------------------
-- Materialización línea a línea
--
-- Antes aplicaba el cambio a una actividad; ahora recorre las líneas y aplica
-- el de cada una. Devuelve la primera afectada, que es lo que la cabecera
-- guarda en `actividad_id` y lo que la pantalla enseña como objetivo.
-- -----------------------------------------------------------------------------
create or replace function public.fn_materializar_solicitud(p_solicitud_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_solicitud record;
  v_linea     record;
  v_id        uuid;
  v_primera   uuid := null;
  v_n         integer := 0;
begin
  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'no_data_found';
  end if;

  for v_linea in
    select * from public.solicitud_actividades
    where solicitud_id = p_solicitud_id
    order by orden, creado_en
  loop
    v_id := null;
    v_n  := v_n + 1;

    if v_solicitud.tipo = 'crear' then
      insert into public.actividades (codigo, nomenclatura, tipo, padre_id, estado, creado_por)
      values (
        upper(coalesce(
          nullif(trim(v_linea.propuesta_codigo), ''),
          -- Sin código propuesto se genera uno trazable al folio. Lleva el
          -- número de línea porque un expediente puede crear varias a la vez
          -- y todas caerían en el mismo código.
          'ACT-' || right(v_solicitud.folio, 4) || '-' || v_n::text
        )),
        trim(v_linea.propuesta_nomenclatura),
        coalesce(
          v_linea.propuesta_tipo,
          case when v_linea.actividad_principal_id is null then 'principal' else 'directa' end
        ),
        v_linea.actividad_principal_id,
        'activa',
        auth.uid()
      )
      returning actividades.id into v_id;

    elsif v_solicitud.tipo = 'editar' and v_linea.actividad_id is not null then
      update public.actividades
      set nomenclatura = coalesce(nullif(trim(v_linea.propuesta_nomenclatura), ''), nomenclatura),
          codigo       = upper(coalesce(nullif(trim(v_linea.propuesta_codigo), ''), codigo)),
          estado       = 'activa'
      where actividades.id = v_linea.actividad_id
      returning actividades.id into v_id;

    elsif v_solicitud.tipo = 'eliminar' and v_linea.actividad_id is not null then
      -- Se ARCHIVA, no se borra. Un borrado arrastraría en cascada las
      -- subactividades y las referencias de otros expedientes; archivar es
      -- reversible y conserva el histórico.
      update public.actividades
      set estado = 'archivada'
      where actividades.id = v_linea.actividad_id
      returning actividades.id into v_id;
    end if;

    update public.solicitud_actividades
    set actividad_resultante_id = v_id,
        aplicada_en             = now()
    where solicitud_actividades.id = v_linea.id;

    v_primera := coalesce(v_primera, v_id);
  end loop;

  if v_n = 0 then
    raise exception 'El expediente % no tiene ninguna actividad que aplicar.', v_solicitud.folio
      using errcode = 'no_data_found';
  end if;

  return v_primera;
end;
$fn$;

comment on function public.fn_materializar_solicitud is
  'Aplica sobre `actividades` cada línea de la solicitud. La llaman la firma final del flujo y la resolución administrativa: una sola copia de esta lógica.';

revoke all on function public.fn_materializar_solicitud(uuid) from public;

-- -----------------------------------------------------------------------------
-- Las variables del correo cuentan cuántas actividades hay
--
-- Con varias líneas, «actividad» ya no es un nombre: nombrar sólo la primera
-- haría creer al solicitante que el expediente perdió las demás.
-- -----------------------------------------------------------------------------
create or replace function public.fn_variables_solicitud(p_solicitud_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'folio',            s.folio,
    'tipo',             case s.tipo when 'crear' then 'creación'
                                    when 'editar' then 'modificación'
                                    else 'baja' end,
    'estado',           s.estado::text,
    'prioridad',        s.prioridad::text,
    'solicitante',      sp.nombre_completo,
    'solicitante_correo', sp.correo,
    'unidad',           coalesce(v.nombre, 'Sin unidad asignada'),
    'actividad',        coalesce(
      (
        select (array_agg(
                  coalesce(nullif(trim(sa.propuesta_nomenclatura), ''), act.nomenclatura)
                  order by sa.orden
               ))[1]
             || case when count(*) > 1 then ' (+' || (count(*) - 1) || ' más)' else '' end
        from public.solicitud_actividades sa
        left join public.actividades act on act.id = sa.actividad_id
        where sa.solicitud_id = s.id
      ),
      a.nomenclatura, s.propuesta_nomenclatura, 'Sin actividad asociada'
    ),
    'codigo_actividad', coalesce(
      (
        select (array_agg(
                  coalesce(nullif(trim(sa.propuesta_codigo), ''), act.codigo)
                  order by sa.orden
               ))[1]
             || case when count(*) > 1 then ' (+' || (count(*) - 1) || ')' else '' end
        from public.solicitud_actividades sa
        left join public.actividades act on act.id = sa.actividad_id
        where sa.solicitud_id = s.id
      ),
      a.codigo, s.propuesta_codigo, '—'
    ),
    'justificacion',    s.concepto_justificativo,
    'periodo',          coalesce(per.codigo, 'Sin periodo'),
    'fecha',            to_char(s.creado_en at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI'),
    'institucion',      coalesce(c.nombre_institucion, 'Gestión Académica')
  )
  from public.solicitudes s
  join public.perfiles sp on sp.id = s.solicitante_id
  left join public.vicerrectorias v on v.id = sp.vicerrectoria_id
  left join public.actividades a on a.id = s.actividad_id
  left join public.periodos per on per.id = s.periodo_id
  cross join public.configuracion c
  where s.id = p_solicitud_id;
$fn$;

-- -----------------------------------------------------------------------------
-- La actividad de apoyo asociada deja de pedirse
--
-- Era un texto libre que no ataba con nada: no creaba actividad de apoyo, no
-- se validaba y no lo miraba ningún revisor. La columna se queda —hay
-- expedientes históricos que la rellenaron y borrarla reescribiría su
-- contenido—, pero el formulario ya no la ofrece.
-- -----------------------------------------------------------------------------
comment on column public.solicitudes.propuesta_apoyo is
  'EN DESUSO desde la migración 17. Se conserva por los expedientes que la rellenaron; el formulario ya no la pide.';
