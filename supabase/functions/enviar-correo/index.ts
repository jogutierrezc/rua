/**
 * Vacía la bandeja de salida.
 *
 * Los triggers de la base encolan; esta función envía. Se puede invocar de dos
 * formas y ambas son legítimas:
 *
 *   · Desde el cliente, tras una acción que genera correos. Es lo que hace que
 *     lleguen en segundos.
 *   · Desde un cron de Supabase, cada pocos minutos. Es la red de seguridad:
 *     recoge lo que quedó pendiente porque el navegador se cerró antes o
 *     porque Resend estaba caído.
 *
 * Usa la service_role key porque `correos` no tiene política de escritura: el
 * único camino para marcar un envío como hecho es éste.
 *
 *   supabase secrets set RESEND_API_KEY=re_...
 *   supabase functions deploy enviar-correo
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS, maquetar, enviarPorResend, type ConfigCorreo } from './correo.ts'

/** Tope por invocación: una Edge Function tiene límite de tiempo. */
const LOTE = 25
/** Tras 3 intentos fallidos se deja de reintentar y queda marcado para revisión. */
const MAX_INTENTOS = 3

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = Deno.env.get('RESEND_API_KEY')

  if (!url || !servicio) {
    console.error('Faltan variables de entorno de Supabase')
    return responder({ error: 'La función no está configurada correctamente.' }, 500)
  }
  if (!apiKey) {
    return responder(
      {
        error:
          'Falta RESEND_API_KEY. Configúrala con: supabase secrets set RESEND_API_KEY=re_...',
        codigo: 'sin_api_key',
      },
      500,
    )
  }

  const admin = createClient(url, servicio, { auth: { persistSession: false } })

  // ---------------------------------------------------------------------------
  // Configuración del remitente
  // ---------------------------------------------------------------------------
  const { data: config } = await admin
    .from('configuracion')
    .select('correo, nombre_institucion')
    .maybeSingle()

  const correo = (config?.correo ?? {}) as ConfigCorreo
  const institucion = (config?.nombre_institucion as string) ?? 'Rua'

  if (!correo.activo) {
    return responder({ enviados: 0, motivo: 'El envío de correos está desactivado.' })
  }
  if (!correo.remitente) {
    return responder({ error: 'No hay remitente configurado.', codigo: 'sin_remitente' }, 400)
  }

  // ---------------------------------------------------------------------------
  // Lote pendiente
  // ---------------------------------------------------------------------------
  const { data: pendientes, error: errCola } = await admin
    .from('correos')
    .select('id, destinatario, asunto, cuerpo, intentos')
    .eq('estado', 'pendiente')
    .lt('intentos', MAX_INTENTOS)
    .order('creado_en')
    .limit(LOTE)

  if (errCola) {
    console.error('No se pudo leer la cola:', errCola)
    return responder({ error: 'No se pudo leer la bandeja de salida.' }, 500)
  }
  if (!pendientes?.length) return responder({ enviados: 0, fallidos: 0 })

  // ---------------------------------------------------------------------------
  // Envío
  //
  // Secuencial y no en paralelo: Resend limita la tasa de envío, y una ráfaga
  // de 25 peticiones simultáneas se traduce en errores 429 que luego hay que
  // reintentar de todos modos.
  // ---------------------------------------------------------------------------
  let enviados = 0
  let fallidos = 0

  for (const c of pendientes) {
    const resultado = await enviarPorResend({
      apiKey,
      config: correo,
      para: c.destinatario,
      asunto: c.asunto,
      html: maquetar(c.asunto, c.cuerpo, institucion),
      texto: c.cuerpo,
    })

    const intentos = (c.intentos ?? 0) + 1

    if (resultado.ok) {
      enviados++
      await admin
        .from('correos')
        .update({
          estado: 'enviado',
          intentos,
          enviado_en: new Date().toISOString(),
          proveedor_id: resultado.id ?? null,
          error: null,
        })
        .eq('id', c.id)
    } else {
      fallidos++
      console.error(`Fallo al enviar ${c.id} a ${c.destinatario}:`, resultado.error)
      await admin
        .from('correos')
        .update({
          // Se marca como fallido definitivo sólo al agotar los intentos; hasta
          // entonces vuelve a la cola para el siguiente barrido.
          estado: intentos >= MAX_INTENTOS ? 'fallido' : 'pendiente',
          intentos,
          error: resultado.error ?? 'Error desconocido',
        })
        .eq('id', c.id)
    }
  }

  return responder({ enviados, fallidos, procesados: pendientes.length })
})
