-- =============================================================================
-- Rua · 28 — El verificador pasa a Email Reputation
--
-- Síntoma: «Invalid API key provided», con una clave que en el panel de Abstract
-- se ve perfectamente válida.
--
-- Y lo era. El problema es que era la de OTRA API. Abstract vende Email
-- Validation y Email Reputation como productos separados, cada uno con su
-- dominio, su clave y su formato de respuesta; su propia documentación lo dice:
-- «each user has unique API keys for each of Abstract's APIs». La clave de la
-- institución es la de Reputation, y la función llamaba a Validation.
--
-- El arreglo tiene dos mitades. El endpoint se cambia en la Edge Function —eso
-- es transporte—; lo que se arregla AQUÍ es la interpretación, porque las dos
-- APIs responden cosas distintas:
--
--   Validation:  deliverability, is_valid_format: {value: true}, quality_score
--   Reputation:  email_deliverability.status, .is_format_valid, email_quality.score
--
-- Se entienden LAS DOS, no sólo la nueva. Por dos razones concretas: los
-- contactos ya verificados guardaron la respuesta con la forma antigua y su
-- veredicto tiene que seguir leyéndose igual; y una institución que mañana
-- contrate el otro producto no debería necesitar una migración para seguir
-- verificando. La forma se detecta mirando la respuesta, no configurando nada.
--
-- De paso, Reputation trae algo que Validation no daba y que aquí importa: un
-- riesgo explícito de la dirección. Un buzón puede existir, aceptar correo y aun
-- así ser una dirección que conviene mirar dos veces antes de meterla en un
-- envío institucional. Eso ahora se guarda y pesa en el veredicto.
-- =============================================================================

do $guardia$ begin
  if to_regclass('public.contactos_internacionales') is null then
    raise exception
      'Antes de ésta hay que aplicar las migraciones 24 a 27 del módulo de Internacionalización.';
  end if;
end $guardia$;

-- -----------------------------------------------------------------------------
-- No ejecutar fuera de orden
--
-- Reaplicar una migración anterior a la última NO es inocuo: `create or replace`
-- devuelve las funciones a su versión vieja, y Postgres se planta a mitad del
-- archivo dejando el trabajo hecho a medias.
-- -----------------------------------------------------------------------------
do $orden$
declare
  v_posterior text;
begin
  v_posterior := case
    when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'fn_asegurar_catalogo')
      then '30 · catalogo_que_aprende'
    when exists (select 1 from pg_indexes
                 where schemaname = 'public' and indexname = 'paises_nombre_trgm_idx')
      then '29 · sugerencias_indexadas'
  end;

  if v_posterior is not null then
    raise exception
      'No ejecutes ésta: ya está aplicada la migración %, que es posterior. Reaplicar una anterior revertiría sus cambios. Si algo no funciona, ejecuta supabase/diagnostico-internacionalizacion.sql para ver qué falta de verdad.',
      v_posterior;
  end if;
end $orden$;

alter table public.contactos_internacionales
  -- low · medium · high, tal como lo dice el proveedor. Se guarda su palabra y
  -- no una traducción: es un valor de un catálogo ajeno, y traducirlo aquí sería
  -- inventarse una equivalencia que nadie ha definido.
  add column if not exists riesgo text,
  add column if not exists es_sospechoso boolean;

comment on column public.contactos_internacionales.riesgo is
  'Riesgo de la dirección según el proveedor: low, medium o high. Sólo lo da Email Reputation.';
comment on column public.contactos_internacionales.es_sospechoso is
  'El nombre de usuario parece generado automáticamente.';

alter table public.contactos_internacionales
  drop constraint if exists contacto_riesgo_valido;
alter table public.contactos_internacionales
  add constraint contacto_riesgo_valido check (riesgo is null or riesgo in ('low', 'medium', 'high'));

-- =============================================================================
-- La interpretación
--
-- Sigue viviendo en la base y no en la Edge Function. Es la regla de negocio
-- —qué contamos como válido, qué como riesgoso— y tiene que ser la misma se
-- llame desde donde se llame; una copia en TypeScript sería una segunda opinión
-- esperando a discrepar con la primera.
-- =============================================================================
create or replace function public.fn_aplicar_verificacion(
  p_contacto_id uuid,
  p_respuesta   jsonb,
  p_error       text default null,
  p_actor       uuid default null
)
returns table (estado public.estado_verificacion, mensaje text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_reputacion  boolean;
  v_entrega     jsonb;
  v_calidad_obj jsonb;
  v_formato     boolean;
  v_smtp        boolean;
  v_mx          boolean;
  v_desechable  boolean;
  v_gratuito    boolean;
  v_generico    boolean;
  v_acepta_todo boolean;
  v_sospechoso  boolean;
  v_riesgo      text;
  v_entregable  text;
  v_detalle     text;
  v_calidad     numeric;
  v_correccion  text;
  v_estado      public.estado_verificacion;
  v_mensaje     text;
begin
  -- ---------------------------------------------------------------------------
  -- No se pudo preguntar
  --
  -- Un fallo de red o una cuota agotada NO son un veredicto sobre el correo. Si
  -- el contacto ya tenía uno, se conserva —y se conserva su fecha, que es lo que
  -- lo data—; sólo se anota qué pasó en el último intento. Degradar a «error» un
  -- correo que ayer era válido sería castigar al contacto por un problema
  -- nuestro.
  -- ---------------------------------------------------------------------------
  if p_error is not null then
    update public.contactos_internacionales c
    set verificacion_mensaje = p_error,
        verificacion_estado = case
          when c.verificacion_estado = 'sin_verificar' then 'error'
          else c.verificacion_estado
        end
    where c.id = p_contacto_id
    returning c.verificacion_estado, c.verificacion_mensaje into v_estado, v_mensaje;

    return query select v_estado, v_mensaje;
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- ¿Qué API contestó?
  --
  -- Se deduce de la respuesta y no de un ajuste: un ajuste puede quedarse
  -- desactualizado respecto a la clave que hay puesta, y entonces se
  -- interpretaría bien una respuesta que llegó de otro sitio.
  -- ---------------------------------------------------------------------------
  v_reputacion := jsonb_typeof(p_respuesta -> 'email_deliverability') = 'object';

  if v_reputacion then
    v_entrega     := p_respuesta -> 'email_deliverability';
    v_calidad_obj := p_respuesta -> 'email_quality';

    v_formato     := (v_entrega ->> 'is_format_valid')::boolean;
    v_smtp        := (v_entrega ->> 'is_smtp_valid')::boolean;
    v_mx          := (v_entrega ->> 'is_mx_valid')::boolean;
    v_entregable  := upper(coalesce(v_entrega ->> 'status', 'UNKNOWN'));
    v_detalle     := nullif(btrim(coalesce(v_entrega ->> 'status_detail', '')), '');

    v_calidad     := nullif(v_calidad_obj ->> 'score', '')::numeric;
    v_desechable  := (v_calidad_obj ->> 'is_disposable')::boolean;
    v_gratuito    := (v_calidad_obj ->> 'is_free_email')::boolean;
    v_generico    := (v_calidad_obj ->> 'is_role')::boolean;
    v_acepta_todo := (v_calidad_obj ->> 'is_catchall')::boolean;
    v_sospechoso  := (v_calidad_obj ->> 'is_username_suspicious')::boolean;

    v_riesgo      := lower(nullif(p_respuesta -> 'email_risk' ->> 'address_risk_status', ''));
    v_correccion  := nullif(btrim(coalesce(p_respuesta ->> 'suggested_correction', '')), '');
  else
    -- La forma de Email Validation, que envuelve cada booleano en
    -- {"value": true, "text": "TRUE"}.
    v_formato     := public.fn_jsonb_bool(p_respuesta, 'is_valid_format');
    v_smtp        := public.fn_jsonb_bool(p_respuesta, 'is_smtp_valid');
    v_mx          := public.fn_jsonb_bool(p_respuesta, 'is_mx_found');
    v_desechable  := public.fn_jsonb_bool(p_respuesta, 'is_disposable_email');
    v_gratuito    := public.fn_jsonb_bool(p_respuesta, 'is_free_email');
    v_generico    := public.fn_jsonb_bool(p_respuesta, 'is_role_email');
    v_acepta_todo := public.fn_jsonb_bool(p_respuesta, 'is_catchall_email');
    v_entregable  := upper(coalesce(p_respuesta ->> 'deliverability', 'UNKNOWN'));
    v_calidad     := nullif(p_respuesta ->> 'quality_score', '')::numeric;
    v_correccion  := nullif(btrim(coalesce(p_respuesta ->> 'autocorrect', '')), '');
    v_sospechoso  := null;
    v_riesgo      := null;
    v_detalle     := null;
  end if;

  -- ---------------------------------------------------------------------------
  -- El veredicto, de lo más concluyente a lo menos
  -- ---------------------------------------------------------------------------
  if v_formato is false then
    v_estado  := 'invalido';
    v_mensaje := 'La dirección no tiene una estructura de correo válida.';

  elsif v_entregable = 'UNDELIVERABLE' then
    v_estado  := 'invalido';
    v_mensaje := case
      when v_mx is false then
        'El dominio no tiene servidor de correo: nada de lo que se envíe llegará.'
      when v_detalle in ('inbox_full', 'full_mailbox') then
        'El buzón existe pero está lleno y rechaza el correo. Puede volver a servir más adelante.'
      else 'El servidor rechaza esta dirección: el buzón no existe.'
    end;

  elsif v_desechable then
    -- Entregable, sí, pero a un buzón que se autodestruye. Como contacto
    -- institucional no vale nada.
    v_estado  := 'riesgoso';
    v_mensaje := 'Es un buzón temporal, de usar y tirar. No sirve como contacto estable.';

  elsif v_riesgo = 'high' then
    -- Lo que Reputation añade sobre Validation: un buzón puede existir y aceptar
    -- correo y aun así ser una dirección que conviene mirar dos veces antes de
    -- meterla en un envío institucional.
    v_estado  := 'riesgoso';
    v_mensaje := 'El buzón acepta correo, pero el proveedor marca la dirección como de alto riesgo.';

  elsif v_acepta_todo then
    v_estado  := 'riesgoso';
    v_mensaje := 'El dominio acepta cualquier dirección, así que no se puede confirmar que este buzón exista.';

  elsif v_entregable = 'DELIVERABLE' then
    v_estado  := 'valido';
    v_mensaje := case
      when v_generico then
        'El buzón acepta correo, pero es genérico: llega a una oficina, no a una persona.'
      else 'El buzón existe y acepta correo.'
    end;

  elsif v_entregable = 'RISKY' then
    v_estado  := 'riesgoso';
    v_mensaje := 'El proveedor lo marca como arriesgado: puede rebotar.';

  else
    v_estado  := 'riesgoso';
    v_mensaje := 'El servidor no dio una respuesta concluyente. Conviene reintentarlo más adelante.';
  end if;

  if v_sospechoso then
    v_mensaje := v_mensaje || ' El nombre de usuario parece generado automáticamente.';
  end if;

  if v_correccion is not null then
    v_mensaje := v_mensaje || ' El proveedor sugiere «' || v_correccion || '».';
  end if;

  update public.contactos_internacionales
  set verificacion_estado  = v_estado,
      verificacion_mensaje = v_mensaje,
      verificacion_en      = now(),
      verificacion_por     = p_actor,
      entregable     = v_entregable,
      calidad        = v_calidad,
      formato_valido = v_formato,
      buzon_smtp     = v_smtp,
      dominio_mx     = v_mx,
      es_desechable  = v_desechable,
      es_gratuito    = v_gratuito,
      es_generico    = v_generico,
      acepta_todo    = v_acepta_todo,
      es_sospechoso  = v_sospechoso,
      riesgo         = v_riesgo,
      correccion     = v_correccion,
      verificacion_detalle = p_respuesta
  where id = p_contacto_id;

  return query select v_estado, v_mensaje;
end;
$fn$;

comment on function public.fn_aplicar_verificacion(uuid, jsonb, text, uuid) is
  'Interpreta la respuesta del verificador —Email Reputation o Email Validation, se detecta sola— y sella el veredicto en el contacto.';

revoke all on function public.fn_aplicar_verificacion(uuid, jsonb, text, uuid) from public;
grant execute on function public.fn_aplicar_verificacion(uuid, jsonb, text, uuid) to service_role;

-- =============================================================================
-- La vista, con las columnas nuevas
--
-- Se recrea entera y no se reemplaza: `create or replace view` no puede añadir
-- columnas, y con `select c.*` la lista quedó congelada en su definición.
-- =============================================================================
drop view if exists public.v_contactos_internacionales;

create view public.v_contactos_internacionales
with (security_invoker = true) as
select
  c.*,
  p.nombre  as pais_nombre,
  p.region  as pais_region,
  r.etiqueta as rol_etiqueta,
  s.etiqueta as sector_etiqueta,
  cp.nombre_completo as creado_por_nombre,
  vp.nombre_completo as verificado_por_nombre,
  case
    when c.verificacion_en is null then null
    else (current_date - c.verificacion_en::date)
  end as dias_desde_verificacion
from public.contactos_internacionales c
left join public.paises p            on p.codigo = c.pais_codigo
left join public.contacto_catalogo r on r.id = c.rol_id
left join public.contacto_catalogo s on s.id = c.sector_id
left join public.perfiles cp         on cp.id = c.creado_por
left join public.perfiles vp         on vp.id = c.verificacion_por;

comment on view public.v_contactos_internacionales is
  'Contactos con país, rol, sector y autores ya resueltos. Es la fuente de las pantallas del módulo.';
