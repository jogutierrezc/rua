/**
 * Envío de prueba y diagnóstico de la configuración.
 *
 * No pasa por la bandeja de salida a propósito: una prueba no debe ensuciar la
 * bitácora de correos institucionales, y su valor está en el resultado
 * INMEDIATO — si Resend rechaza el dominio, hay que verlo al pulsar el botón,
 * no descubrirlo revisando la cola.
 *
 * Devuelve además el estado de la configuración, que es lo que la pantalla de
 * administración necesita para decir qué falta sin exponer nunca la API key.
 *
 *   supabase functions deploy probar-correo
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  CORS,
  maquetar,
  enviarPorResend,
  type ConfigCorreo,
} from './correo.ts'

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = Deno.env.get('RESEND_API_KEY')

  if (!url || !anon || !servicio) {
    return responder({ error: 'La función no está configurada correctamente.' }, 500)
  }

  // ---------------------------------------------------------------------------
  // Sólo un administrador. Enviar correo desde el dominio institucional a una
  // dirección arbitraria es exactamente lo que buscaría alguien para hacer
  // suplantación, así que se comprueba con el token de quien llama.
  // ---------------------------------------------------------------------------
  const autorizacion = req.headers.get('Authorization')
  if (!autorizacion) return responder({ error: 'Falta la sesión.' }, 401)

  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  })

  const { data: sesion } = await comoUsuario.auth.getUser()
  if (!sesion?.user) return responder({ error: 'Sesión inválida o expirada.' }, 401)

  const { data: autorizado } = await comoUsuario.rpc('fn_tengo_permiso', {
    p_codigo: 'roles.administrar',
  })
  if (!autorizado) {
    return responder({ error: 'No tienes permiso para enviar correos de prueba.' }, 403)
  }

  const admin = createClient(url, servicio, { auth: { persistSession: false } })

  const { data: config } = await admin
    .from('configuracion')
    .select('correo, nombre_institucion')
    .maybeSingle()

  const correo = (config?.correo ?? {}) as ConfigCorreo
  const institucion = (config?.nombre_institucion as string) ?? 'Rua'

  // ---------------------------------------------------------------------------
  // Diagnóstico: qué falta para poder enviar.
  //
  // Nunca se devuelve la clave, sólo si existe. La pantalla de administración
  // necesita saber si está puesta, no cuál es.
  // ---------------------------------------------------------------------------
  const diagnostico = {
    api_key: Boolean(apiKey),
    remitente: Boolean(correo.remitente?.trim()),
    activo: Boolean(correo.activo),
  }

  let cuerpo: { destinatario?: string; plantilla?: string } = {}
  try {
    cuerpo = await req.json()
  } catch {
    /* sin cuerpo: se interpreta como una consulta de diagnóstico */
  }

  const destinatario = cuerpo.destinatario?.trim()

  // Sin destinatario, la llamada es sólo «¿cómo está esto configurado?».
  if (!destinatario) return responder({ diagnostico })

  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(destinatario)) {
    return responder({ error: 'La dirección de correo no es válida.', diagnostico }, 400)
  }
  if (!apiKey) {
    return responder(
      {
        error: 'Falta RESEND_API_KEY. Configúrala con: supabase secrets set RESEND_API_KEY=re_...',
        diagnostico,
      },
      400,
    )
  }
  if (!correo.remitente) {
    return responder({ error: 'No hay remitente configurado.', diagnostico }, 400)
  }

  // ---------------------------------------------------------------------------
  // Se prueba con una plantilla REAL si se indica, rellenando las variables con
  // datos de muestra. Probar con un texto inventado no diría nada sobre si la
  // plantilla que de verdad se usa está bien escrita.
  // ---------------------------------------------------------------------------
  let asunto = `Prueba de configuración · ${institucion}`
  let texto = `Hola:

Si estás leyendo esto, ${institucion} puede enviar correos correctamente.

Remitente: ${correo.remitente}
Enviado por: ${sesion.user.email}
Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}

No hace falta responder a este mensaje.`

  if (cuerpo.plantilla) {
    const { data: plantilla } = await admin
      .from('plantillas_correo')
      .select('asunto, cuerpo')
      .eq('codigo', cuerpo.plantilla)
      .maybeSingle()

    if (plantilla) {
      const muestra: Record<string, string> = {
        destinatario: 'Nombre del destinatario',
        folio: 'REQ-2026-0001',
        tipo: 'creación',
        estado: 'pendiente',
        decision: 'aprobada',
        actividad: 'Seminario de Investigación Aplicada II',
        codigo_actividad: 'SUB-014',
        solicitante: 'Mtro. Víctor Valdés',
        solicitante_correo: 'v.valdes@institucion.edu',
        unidad: 'Vicerrectoría Académica',
        periodo: '2026-2',
        fecha: new Date().toLocaleDateString('es-CO'),
        justificacion:
          'Texto de ejemplo del concepto justificativo, para comprobar cómo se ve un párrafo largo dentro de la maqueta del correo.',
        etapa: 'Vicerrectoría Administrativa y Financiera',
        revisor: 'Dra. Rosalinda Reyes',
        comentario: 'Comentario de ejemplo dejado por quien firmó la etapa.',
        institucion,
      }

      const render = (t: string) =>
        t
          .replace(/\{\{([a-z_]+)\}\}/g, (_, k: string) => muestra[k] ?? '')
          .trim()

      asunto = `[PRUEBA] ${render(plantilla.asunto)}`
      texto = render(plantilla.cuerpo)
    }
  }

  const resultado = await enviarPorResend({
    apiKey,
    config: correo,
    para: destinatario,
    asunto,
    html: maquetar(asunto, texto, institucion),
    texto,
  })

  if (!resultado.ok) {
    // El mensaje de Resend es el útil de verdad: «domain not verified»,
    // «invalid from address». Se pasa tal cual en vez de un genérico.
    return responder({ error: resultado.error, diagnostico }, 502)
  }

  return responder({ ok: true, id: resultado.id, destinatario, diagnostico })
})
