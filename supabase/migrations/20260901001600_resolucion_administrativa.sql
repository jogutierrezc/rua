-- =============================================================================
-- Rua · 16 — Resolución administrativa
--
-- La cadena de firmas modela el proceso correcto, pero no el mundo real: un
-- expediente urgente se queda parado porque la oficina que le toca firmar está
-- de vacaciones, o el trámite ya se resolvió por fuera y sólo falta reflejarlo.
-- Sin una salida, esos casos acaban resolviéndose peor: alguien presta su
-- usuario, o el expediente se queda muerto y el proceso pierde credibilidad.
--
-- Aquí se abre esa salida, con tres cierres que la hacen defendible:
--
--   1. Sólo la administración. Es un atajo sobre el control interno; el resto
--      de roles firman lo suyo y nada más.
--
--   2. Una justificación POR CADA ROL que se firma. Ésta es la clave. Saltarse
--      el flujo no puede significar saltarse el motivo: si la administración
--      firma en nombre de tres oficinas, escribe tres justificaciones, y cada
--      una queda en la etapa de esa oficina. Un botón de «aprobar todo» con un
--      solo comentario habría sido la mitad de trabajo y el doble de daño.
--
--   3. Queda MARCADO. Una etapa firmada por esta vía no debe poder confundirse
--      con la firma real de la oficina que le correspondía. Quien lea el
--      expediente dentro de dos años tiene que poder distinguirlas.
--
-- Lo que NO se levanta: nadie resuelve su propia solicitud, tampoco el
-- administrador. Saltarse la cadena es una decisión de gestión; firmarse a uno
-- mismo es otra cosa, y no hay urgencia que la justifique.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- La marca
-- -----------------------------------------------------------------------------
alter table public.solicitud_etapas
  add column if not exists firmada_por_admin boolean not null default false;

comment on column public.solicitud_etapas.firmada_por_admin is
  'La firmó la administración saltándose el flujo, no la oficina que le correspondía. Sin esta marca las dos serían indistinguibles en el expediente.';

-- -----------------------------------------------------------------------------
-- Materialización, extraída a su propia función
--
-- Vivía dentro de `fn_decidir_etapa`. Ahora hay dos caminos que aplican el
-- cambio sobre la estructura, y dos copias de esta lógica acabarían
-- divergiendo — con la peor consecuencia posible: un expediente aprobado cuya
-- actividad no existe, o que se crea dos veces.
-- -----------------------------------------------------------------------------
create or replace function public.fn_materializar_solicitud(p_solicitud_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_solicitud    record;
  v_padre_id     uuid;
  v_actividad_id uuid := null;
begin
  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'no_data_found';
  end if;

  if v_solicitud.tipo = 'crear' then
    v_padre_id := v_solicitud.actividad_principal_id;

    insert into public.actividades (codigo, nomenclatura, tipo, padre_id, estado, creado_por)
    values (
      upper(coalesce(
        nullif(trim(v_solicitud.propuesta_codigo), ''),
        -- Sin código propuesto se genera uno trazable al folio.
        'ACT-' || right(v_solicitud.folio, 4)
      )),
      trim(v_solicitud.propuesta_nomenclatura),
      coalesce(v_solicitud.propuesta_tipo, case when v_padre_id is null then 'principal' else 'directa' end),
      v_padre_id,
      'activa',
      auth.uid()
    )
    returning id into v_actividad_id;

  elsif v_solicitud.tipo = 'editar' and v_solicitud.actividad_id is not null then
    update public.actividades
    set nomenclatura = coalesce(nullif(trim(v_solicitud.propuesta_nomenclatura), ''), nomenclatura),
        codigo       = upper(coalesce(nullif(trim(v_solicitud.propuesta_codigo), ''), codigo)),
        estado       = 'activa'
    where id = v_solicitud.actividad_id
    returning id into v_actividad_id;

  elsif v_solicitud.tipo = 'eliminar' and v_solicitud.actividad_id is not null then
    -- Se ARCHIVA, no se borra. Un borrado arrastraría en cascada las
    -- subactividades y las referencias de otros expedientes; archivar es
    -- reversible y conserva el histórico.
    update public.actividades
    set estado = 'archivada'
    where id = v_solicitud.actividad_id
    returning id into v_actividad_id;
  end if;

  return v_actividad_id;
end;
$fn$;

comment on function public.fn_materializar_solicitud is
  'Aplica sobre `actividades` lo que pide la solicitud. La llaman la firma final del flujo y la resolución administrativa: una sola copia de esta lógica.';

-- Nadie la llama por su cuenta. No comprueba permisos —los comprueban sus dos
-- llamadoras, antes de invocarla— y aplica un cambio sobre la estructura
-- maestra. En Postgres EXECUTE se concede a PUBLIC por defecto, así que dejarla
-- como está la convertiría en un «crea o archiva la actividad que quieras»
-- disponible para cualquier sesión autenticada. Sus llamadoras la conservan:
-- corren como el propietario, que no se ve afectado por este revoke.
revoke all on function public.fn_materializar_solicitud(uuid) from public;

-- -----------------------------------------------------------------------------
-- `fn_decidir_etapa` pasa a delegar la materialización
--
-- El resto del cuerpo no cambia. Se recrea entera en vez de parchearla porque
-- una función a medias entre dos migraciones no se puede leer.
-- -----------------------------------------------------------------------------
drop function if exists public.fn_decidir_etapa(uuid, boolean, text);

create function public.fn_decidir_etapa(
  p_solicitud_id  uuid,
  p_aprobar       boolean,
  p_justificacion text
)
returns table (
  etapa_decidida   text,
  siguiente_etapa  text,
  estado_solicitud public.estado_solicitud,
  actividad_id     uuid
)
language plpgsql
-- DEFINER a propósito: `solicitud_etapas` no tiene política de escritura, así
-- que ésta es la ÚNICA vía para firmar. La autorización la hace la propia
-- función antes de tocar nada.
security definer
set search_path = public
as $fn$
declare
  v_etapa            record;
  v_solicitud        record;
  v_siguiente        record;
  v_siguiente_codigo text := null;
  v_estado           public.estado_solicitud;
  v_actividad_id     uuid := null;
begin
  if length(trim(coalesce(p_justificacion, ''))) < 20 then
    raise exception 'La justificación debe tener al menos 20 caracteres, tanto al aprobar como al denegar.'
      using errcode = 'check_violation';
  end if;

  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'La solicitud no existe o no tienes acceso a ella.'
      using errcode = 'no_data_found';
  end if;

  if v_solicitud.solicitante_id = auth.uid() then
    raise exception 'No puedes validar tu propia solicitud.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_solicitud.estado not in ('pendiente', 'revision') then
    raise exception 'La solicitud ya está resuelta.'
      using errcode = 'check_violation';
  end if;

  select se.*, e.nombre, e.permiso_codigo, e.materializa
  into v_etapa
  from public.solicitud_etapas se
  join public.etapas_flujo e on e.codigo = se.etapa_codigo
  where se.solicitud_id = p_solicitud_id
    and se.estado = 'pendiente'
  order by se.orden
  limit 1;

  if not found then
    raise exception 'No hay ninguna etapa esperando decisión en esta solicitud.'
      using errcode = 'check_violation';
  end if;

  if not public.fn_tengo_permiso(v_etapa.permiso_codigo) then
    raise exception 'Esta solicitud espera la validación de %, y no tienes ese permiso.', v_etapa.nombre
      using errcode = 'insufficient_privilege';
  end if;

  -- Va ANTES de marcar la etapa como aprobada: si el alta falla —código
  -- repetido, padre inexistente— la excepción revierte la transacción entera
  -- y el expediente queda como estaba, en vez de figurar aprobado sin que la
  -- actividad exista.
  if p_aprobar and v_etapa.materializa then
    v_actividad_id := public.fn_materializar_solicitud(p_solicitud_id);
  end if;

  update public.solicitud_etapas
  set estado        = case when p_aprobar then 'aprobada' else 'denegada' end::public.estado_etapa,
      revisor_id    = auth.uid(),
      justificacion = trim(p_justificacion),
      decidida_en   = now()
  where id = v_etapa.id;

  if p_aprobar then
    select * into v_siguiente
    from public.solicitud_etapas
    where solicitud_id = p_solicitud_id
      and estado = 'bloqueada'
    order by orden
    limit 1;

    if found then
      update public.solicitud_etapas set estado = 'pendiente' where id = v_siguiente.id;
      v_siguiente_codigo := v_siguiente.etapa_codigo;
      v_estado := 'revision';
    else
      v_estado := 'aprobada';
    end if;
  else
    update public.solicitud_etapas
    set estado = 'omitida'
    where solicitud_id = p_solicitud_id and estado = 'bloqueada';
    v_estado := 'denegada';
  end if;

  update public.solicitudes
  set estado                = v_estado,
      actividad_id          = coalesce(v_actividad_id, actividad_id),
      resuelto_por          = case when v_estado in ('aprobada', 'denegada') then auth.uid() end,
      resuelto_en           = case when v_estado in ('aprobada', 'denegada') then now() end,
      comentario_resolucion = case when v_estado in ('aprobada', 'denegada') then trim(p_justificacion) end
  where id = p_solicitud_id;

  insert into public.solicitud_revisiones
    (solicitud_id, revisor_id, estado_anterior, estado_nuevo, comentario, etapa_codigo)
  values
    (p_solicitud_id, auth.uid(), v_solicitud.estado, v_estado, trim(p_justificacion), v_etapa.etapa_codigo);

  return query select v_etapa.etapa_codigo, v_siguiente_codigo, v_estado, v_actividad_id;
end;
$fn$;

comment on function public.fn_decidir_etapa is
  'Firma la etapa vigente, materializa el cambio si la etapa lo exige, y avanza el expediente. Todo en una transacción.';

grant execute on function public.fn_decidir_etapa to authenticated;

-- -----------------------------------------------------------------------------
-- Resolución administrativa: la cadena entera, de una vez
-- -----------------------------------------------------------------------------
create or replace function public.fn_resolver_solicitud_admin(
  p_solicitud_id    uuid,
  p_aprobar         boolean,
  p_justificaciones jsonb
)
returns table (
  etapas_firmadas  integer,
  estado_solicitud public.estado_solicitud,
  actividad_id     uuid
)
language plpgsql
-- DEFINER por la misma razón que `fn_decidir_etapa`: es la única vía de
-- escritura sobre `solicitud_etapas`. Toda la autorización está aquí dentro.
security definer
set search_path = public
as $fn$
declare
  v_solicitud    record;
  v_etapa        record;
  v_texto        text;
  v_actividad_id uuid := null;
  v_estado       public.estado_solicitud;
  v_firmadas     integer := 0;
  v_ultima       text := '';
  v_vars         jsonb;
begin
  if not public.fn_soy_admin() then
    raise exception 'Sólo la administración puede resolver un expediente saltándose el flujo.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'La solicitud no existe o no tienes acceso a ella.'
      using errcode = 'no_data_found';
  end if;

  -- Esta guardia NO se levanta ni siquiera aquí. Saltarse la cadena es una
  -- decisión de gestión; firmarse a uno mismo es otra cosa.
  if v_solicitud.solicitante_id = auth.uid() then
    raise exception 'No puedes resolver tu propia solicitud, tampoco como administrador.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_solicitud.estado not in ('pendiente', 'revision') then
    raise exception 'La solicitud ya está resuelta.'
      using errcode = 'check_violation';
  end if;

  if p_justificaciones is null or jsonb_typeof(p_justificaciones) <> 'object' then
    raise exception 'No se recibió ninguna justificación.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_aprobar then
    -- -------------------------------------------------------------------------
    -- Primero se comprueba que están TODAS, y sólo después se firma.
    --
    -- La transacción revertiría igual, pero el error que llega a la pantalla
    -- sería el de una restricción de la base en vez de «falta la justificación
    -- de Auditoría». Quien está resolviendo necesita saber cuál falta.
    -- -------------------------------------------------------------------------
    for v_etapa in
      select se.etapa_codigo, e.nombre
      from public.solicitud_etapas se
      join public.etapas_flujo e on e.codigo = se.etapa_codigo
      where se.solicitud_id = p_solicitud_id
        and se.estado in ('pendiente', 'bloqueada')
      order by se.orden
    loop
      if length(trim(coalesce(p_justificaciones ->> v_etapa.etapa_codigo, ''))) < 20 then
        raise exception 'Falta la justificación de %, o no llega a 20 caracteres.', v_etapa.nombre
          using errcode = 'check_violation';
      end if;
      v_firmadas := v_firmadas + 1;
    end loop;

    if v_firmadas = 0 then
      raise exception 'No queda ninguna etapa por firmar en esta solicitud.'
        using errcode = 'check_violation';
    end if;

    v_firmadas := 0;

    for v_etapa in
      select se.id, se.etapa_codigo, e.materializa
      from public.solicitud_etapas se
      join public.etapas_flujo e on e.codigo = se.etapa_codigo
      where se.solicitud_id = p_solicitud_id
        and se.estado in ('pendiente', 'bloqueada')
      order by se.orden
    loop
      v_texto := trim(p_justificaciones ->> v_etapa.etapa_codigo);

      -- Antes de sellar la etapa, igual que en el flujo normal: si el alta
      -- falla, nada queda firmado.
      if v_etapa.materializa then
        v_actividad_id := public.fn_materializar_solicitud(p_solicitud_id);
      end if;

      update public.solicitud_etapas
      set estado            = 'aprobada',
          revisor_id        = auth.uid(),
          justificacion     = v_texto,
          decidida_en       = now(),
          firmada_por_admin = true
      where id = v_etapa.id;

      -- Una fila por firma. El expediente sigue «en revisión» mientras se
      -- recorre la cadena; el cierre lo registra el disparador de
      -- `solicitudes` cuando cambie el estado, más abajo.
      insert into public.solicitud_revisiones
        (solicitud_id, revisor_id, estado_anterior, estado_nuevo, comentario, etapa_codigo)
      values
        (p_solicitud_id, auth.uid(), v_solicitud.estado, 'revision', v_texto, v_etapa.etapa_codigo);

      v_firmadas := v_firmadas + 1;
      v_ultima := v_texto;
    end loop;

    v_estado := 'aprobada';

  else
    -- -------------------------------------------------------------------------
    -- Denegar es un solo acto: la cadena se detiene donde esté.
    -- -------------------------------------------------------------------------
    select se.id, se.etapa_codigo into v_etapa
    from public.solicitud_etapas se
    where se.solicitud_id = p_solicitud_id
      and se.estado = 'pendiente'
    order by se.orden
    limit 1;

    if not found then
      raise exception 'No hay ninguna etapa esperando decisión en esta solicitud.'
        using errcode = 'check_violation';
    end if;

    v_texto := trim(coalesce(p_justificaciones ->> v_etapa.etapa_codigo, ''));
    if length(v_texto) < 20 then
      raise exception 'La justificación del rechazo debe tener al menos 20 caracteres.'
        using errcode = 'check_violation';
    end if;

    update public.solicitud_etapas
    set estado            = 'denegada',
        revisor_id        = auth.uid(),
        justificacion     = v_texto,
        decidida_en       = now(),
        firmada_por_admin = true
    where id = v_etapa.id;

    update public.solicitud_etapas
    set estado = 'omitida'
    where solicitud_id = p_solicitud_id and estado = 'bloqueada';

    v_firmadas := 1;
    v_ultima   := v_texto;
    v_estado   := 'denegada';
  end if;

  update public.solicitudes
  set estado                = v_estado,
      actividad_id          = coalesce(v_actividad_id, actividad_id),
      resuelto_por          = auth.uid(),
      resuelto_en           = now(),
      comentario_resolucion = v_ultima
  where id = p_solicitud_id;

  -- ---------------------------------------------------------------------------
  -- Un solo aviso al solicitante.
  --
  -- El disparador de `solicitud_etapas` manda un correo por cada etapa que
  -- cambia; con tres firmas de golpe serían tres mensajes para un solo acto.
  -- Por eso ese disparador ignora las etapas marcadas como administrativas y
  -- el aviso se manda aquí, una vez y ya con el expediente cerrado, para que
  -- las variables reflejen la actividad recién creada.
  -- ---------------------------------------------------------------------------
  v_vars := public.fn_variables_solicitud(p_solicitud_id)
    || jsonb_build_object(
      'etapa',      'Resolución administrativa',
      'comentario', v_ultima,
      'decision',   case when p_aprobar then 'aprobada' else 'denegada' end,
      'revisor',    coalesce(
        (select nombre_completo from public.perfiles where id = auth.uid()),
        'La administración'
      )
    );

  perform public.fn_encolar_correo(
    'solicitud_resuelta',
    v_vars ->> 'solicitante_correo',
    v_vars ->> 'solicitante',
    v_vars || jsonb_build_object('destinatario', v_vars ->> 'solicitante'),
    p_solicitud_id
  );

  return query select v_firmadas, v_estado, v_actividad_id;
end;
$fn$;

comment on function public.fn_resolver_solicitud_admin is
  'Firma de una vez todas las etapas que quedan, una justificación por rol, marcándolas como administrativas. Sólo para el administrador.';

grant execute on function public.fn_resolver_solicitud_admin to authenticated;

-- -----------------------------------------------------------------------------
-- El aviso por etapa ignora las firmas administrativas
--
-- Se mantiene enganchado a la tabla —que es lo correcto para el flujo normal—
-- y se le añade la única excepción: una resolución administrativa manda su
-- propio aviso, uno solo, en vez de uno por cada oficina firmada de golpe.
-- -----------------------------------------------------------------------------
create or replace function public.fn_correo_novedad_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_vars     jsonb;
  v_dest     record;
  v_etapa    record;
  v_estado   public.estado_solicitud;
begin
  if new.estado = old.estado then return null; end if;

  -- La resolución administrativa avisa por su cuenta.
  if new.firmada_por_admin then return null; end if;

  select e.nombre, e.codigo into v_etapa
  from public.etapas_flujo e where e.codigo = new.etapa_codigo;

  v_vars := public.fn_variables_solicitud(new.solicitud_id)
    || jsonb_build_object(
      'etapa', v_etapa.nombre,
      'comentario', coalesce(new.justificacion, ''),
      'revisor', coalesce(
        (select nombre_completo from public.perfiles where id = new.revisor_id),
        'El sistema'
      ),
      'decision', case new.estado
        when 'aprobada' then 'aprobada'
        when 'denegada' then 'denegada'
        else 'en curso' end
    );

  -- Una etapa que se desbloquea: le toca actuar a otra oficina.
  if new.estado = 'pendiente' and old.estado = 'bloqueada' then
    for v_dest in select * from public.fn_destinatarios_etapa(new.etapa_codigo) loop
      perform public.fn_encolar_correo(
        'novedad_registrada',
        v_dest.correo,
        v_dest.nombre,
        v_vars || jsonb_build_object('destinatario', v_dest.nombre),
        new.solicitud_id
      );
    end loop;
    return null;
  end if;

  if new.estado not in ('aprobada', 'denegada') then return null; end if;

  select estado into v_estado from public.solicitudes where id = new.solicitud_id;

  -- Si el expediente quedó cerrado, es la resolución; si no, una novedad más.
  perform public.fn_encolar_correo(
    case when v_estado in ('aprobada', 'denegada') then 'solicitud_resuelta'
         else 'novedad_registrada' end,
    v_vars ->> 'solicitante_correo',
    v_vars ->> 'solicitante',
    v_vars || jsonb_build_object(
      'destinatario', v_vars ->> 'solicitante',
      'estado', v_estado::text
    ),
    new.solicitud_id
  );

  return null;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- La vista expone la marca, para que el expediente pueda distinguirlas
--
-- `create or replace view` sólo admite AÑADIR columnas al final. La nueva va
-- la última por eso, no por gusto.
-- -----------------------------------------------------------------------------
create or replace view public.v_solicitud_etapas
with (security_invoker = true) as
select
  se.id,
  se.solicitud_id,
  se.etapa_codigo,
  se.orden,
  se.estado,
  se.justificacion,
  se.decidida_en,
  se.revisor_id,

  e.nombre        as etapa_nombre,
  e.descripcion   as etapa_descripcion,
  e.permiso_codigo,

  p.nombre_completo as revisor_nombre,
  p.avatar_url      as revisor_avatar,
  r.nombre          as revisor_rol,

  e.materializa,
  se.firmada_por_admin
from public.solicitud_etapas se
join public.etapas_flujo e on e.codigo = se.etapa_codigo
left join public.perfiles p on p.id = se.revisor_id
left join public.roles r on r.id = p.rol_id;
