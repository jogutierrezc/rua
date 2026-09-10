-- =============================================================================
-- Diagnóstico del módulo de Internacionalización
--
-- NO es una migración: no escribe nada. Pégalo entero en el editor SQL cuando no
-- sepas en qué estado está la base, en vez de reaplicar una migración por si
-- acaso —que es justo lo que la rompe—.
--
-- Es UNA sola consulta a propósito. El editor de Supabase muestra el resultado
-- de la última sentencia y descarta las anteriores: un archivo con cinco
-- consultas enseña una y esconde cuatro, que es peor que no diagnosticar nada
-- porque parece que sí lo hizo.
--
-- Todo lo que diga «OK» está bien. Lo que diga «REVISAR» trae al lado qué hacer.
--
-- Un aviso: si falta alguna migración, esta consulta no llega a ejecutarse y
-- falla nombrando la tabla o la columna que no existe —«paises_busqueda» si
-- falta la 26, «tipo_contacto» si falta la 25—. Postgres comprueba que todo lo
-- nombrado exista ANTES de empezar, así que no hay forma de preguntarlo desde
-- una consulta suelta. Ese error también es una respuesta, y bastante clara.
-- =============================================================================
with d as (
  select
    -- Huellas de cada migración
    (to_regclass('public.contactos_internacionales') is not null) as m24,
    (exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'contactos_internacionales'
        and column_name = 'tipo_contacto'
    )) as m25,
    (to_regclass('public.paises_busqueda') is not null) as m26,
    -- La 27 no añade tablas ni columnas: cambia funciones. Su huella es la
    -- columna de salida que estrenó en la previsualización.
    (exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'fn_validar_importacion_contactos'
        and 'sector_ok' = any (p.proargnames)
    )) as m27,
    (exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'contactos_internacionales'
        and column_name = 'riesgo'
    )) as m28,
    (exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = 'paises_nombre_trgm_idx'
    )) as m29,
    (exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_asegurar_catalogo'
    )) as m30,

    -- Versiones vivas de las funciones que cambiaron de firma. Más de una es
    -- basura de una migración reaplicada, y hace ambigua cualquier llamada.
    (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_validar_importacion_contactos'
    ) as v_validar,
    (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_importar_contactos'
    ) as v_importar,

    -- Catálogos
    (select count(*) from public.paises) as paises,
    (select count(*) from public.paises_busqueda) as claves,
    (select count(*) from public.contacto_catalogo where tipo = 'rol' and activo) as roles,
    (select count(*) from public.contacto_catalogo where tipo = 'sector' and activo) as sectores,

    -- Permisos
    (select count(*) from public.rol_permisos rp
      join public.roles r on r.id = rp.rol_id
      where public.fn_normalizar(r.nombre) = 'internacionalizacion'
        and rp.permiso_codigo like 'internacionalizacion.%'
    ) as permisos_rol,

    -- La libreta
    (select count(*) from public.contactos_internacionales where estado = 'activo') as contactos,
    (select count(*) from public.contactos_internacionales
      where estado = 'activo' and tipo_contacto = 'academico') as academicos,
    (select count(*) from public.contactos_internacionales
      where estado = 'activo' and tipo_contacto = 'empleador') as empleadores,
    (select count(*) from public.contactos_internacionales
      where estado = 'activo' and tipo_contacto = 'general') as manuales,
    (select count(*) from public.contactos_internacionales
      where estado = 'activo' and verificacion_estado = 'valido') as correos_validos,
    (select count(*) from public.contactos_internacionales
      where estado = 'activo' and verificacion_estado = 'sin_verificar') as sin_verificar
)
select t.n as "#", t.comprobacion as "Comprobación", t.resultado as "Resultado"
from (
  -- Migraciones -------------------------------------------------------------
  select 1 as n, 'Migración 24 · libreta de contactos' as comprobacion,
         case when d.m24 then 'OK · aplicada'
              else 'REVISAR · aplica 20260901002400_internacionalizacion.sql' end as resultado
  from d
  union all
  select 2, 'Migración 25 · plantillas de nominación',
         case when d.m25 then 'OK · aplicada'
              else 'REVISAR · aplica 20260901002500_plantillas_nominacion.sql' end
  from d
  union all
  select 3, 'Migración 26 · importación rápida',
         case when d.m26 then 'OK · aplicada'
              else 'REVISAR · aplica 20260901002600_importacion_rapida.sql' end
  from d
  union all
  select 4, 'Migración 27 · listas que coexisten',
         case when d.m27 then 'OK · aplicada'
              else 'REVISAR · aplica 20260901002700_listas_que_coexisten.sql' end
  from d
  union all
  select 5, 'Migración 28 · Email Reputation',
         case when d.m28 then 'OK · aplicada'
              else 'REVISAR · aplica 20260901002800_email_reputation.sql' end
  from d
  union all
  select 6, 'Migración 29 · sugerencias indexadas',
         case when d.m29 then 'OK · aplicada'
              else 'REVISAR · aplica 20260901002900_sugerencias_indexadas.sql' end
  from d

  -- Funciones duplicadas ----------------------------------------------------
  union all
  select 7, 'Migración 30 · catálogo que aprende',
         case when d.m30 then 'OK · aplicada'
              else 'REVISAR · aplica 20260901003000_catalogo_que_aprende.sql' end
  from d
  union all
  select 8, 'Versiones vivas de fn_validar_importacion_contactos',
         case when d.v_validar = 1 then 'OK · 1'
              when d.v_validar = 0 then 'REVISAR · ninguna; falta la migración 24'
              else 'REVISAR · ' || d.v_validar || ' conviviendo; vuelve a aplicar la 26, que las limpia' end
  from d
  union all
  select 9, 'Versiones vivas de fn_importar_contactos',
         case when d.v_importar = 1 then 'OK · 1'
              when d.v_importar = 0 then 'REVISAR · ninguna; falta la migración 24'
              else 'REVISAR · ' || d.v_importar || ' conviviendo; vuelve a aplicar la 26, que las limpia' end
  from d

  -- Catálogos ---------------------------------------------------------------
  union all
  select 10, 'Países sembrados',
         case when d.paises >= 150 then 'OK · ' || d.paises
              else 'REVISAR · sólo ' || d.paises || '; la siembra de la 24 no entró' end
  from d
  union all
  select 11, 'Claves de búsqueda de países',
         case when not d.m26 then 'n/a · llega con la migración 26'
              when d.claves > d.paises then 'OK · ' || d.claves
              else 'REVISAR · ' || d.claves || '; ejecuta: select public.fn_reconstruir_paises_busqueda();' end
  from d
  union all
  select 12, 'Roles y sectores del catálogo',
         case when d.roles > 0 and d.sectores > 0
              then 'OK · ' || d.roles || ' roles y ' || d.sectores || ' sectores'
              else 'REVISAR · falta sembrar el catálogo' end
  from d

  -- Permisos ----------------------------------------------------------------
  union all
  select 13, 'Permisos del rol Internacionalización',
         case when d.permisos_rol = 3 then 'OK · los 3'
              when d.permisos_rol = 0 then 'REVISAR · el rol no existe o no tiene permisos'
              else 'REVISAR · sólo ' || d.permisos_rol || ' de 3' end
  from d

  -- La libreta --------------------------------------------------------------
  union all
  select 14, 'Contactos activos', d.contactos::text from d
  union all
  select 15, 'Clasificación por plantilla',
         d.academicos || ' académicos · ' || d.empleadores || ' empleadores · ' ||
         d.manuales || ' de alta manual'
  from d
  union all
  select 16, 'Verificación de correos',
         d.correos_validos || ' válidos · ' || d.sin_verificar || ' sin verificar'
  from d
) t
order by t.n;
