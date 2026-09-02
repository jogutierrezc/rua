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

// =============================================================================
// Maquetación y envío por Resend — BLOQUE DUPLICADO A PROPÓSITO
//
// Vivía en `_compartido/correo.ts`. El despliegue desde el panel de Supabase
// sube un solo archivo por función, así que cualquier import a otro archivo
// del proyecto deja la función sin arrancar: no da error, deja de responder.
// Una función = un archivo = un pegado.
//
// Este bloque es idéntico en `enviar-correo/index.ts` y en
// `probar-correo/index.ts`. Si tocas algo aquí, cópialo a la otra.
// =============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // `x-application-name` la añade el cliente en `src/lib/supabase.ts`. Si no
  // está declarada aquí, el navegador corta en el preflight y la petición no
  // llega a salir — un fallo que sólo aparece desde el navegador y que con
  // curl no se reproduce jamás.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Cabeceras del preflight, devolviendo las que el navegador PIDE.
 *
 * Una lista fija obliga a redesplegar las cuatro funciones cada vez que el
 * cliente añade una cabecera, y el fallo sólo se descubre en producción.
 * Reflejar lo pedido no abre nada: el permiso se comprueba más abajo con el
 * token de quien llama, no con la lista de cabeceras.
 */
const preflight = (req: Request) => ({
  ...CORS,
  'Access-Control-Allow-Headers':
    req.headers.get('Access-Control-Request-Headers') ?? CORS['Access-Control-Allow-Headers'],
})

interface ConfigCorreo {
  activo?: boolean
  remitente?: string
  nombre_remitente?: string
  responder_a?: string | null
  copia_oculta?: string | null
}

/** Escapa lo que va dentro del HTML: el cuerpo lo escribe una persona. */
function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Convierte el texto plano de la plantilla en HTML.
 *
 * Reglas mínimas y predecibles: los párrafos se separan por línea en blanco,
 * y una línea con `Etiqueta: valor` se pinta como fila de datos. No es
 * Markdown; es lo justo para que un correo institucional se lea bien.
 */
function cuerpoAHtml(texto: string): string {
  const parrafos = texto.trim().split(/\n\s*\n/)

  return parrafos
    .map((p) => {
      const lineas = p.split('\n').filter((l) => l.trim())

      // Una variable que se resolvió vacía deja el párrafo vacío. Se descarta en
      // vez de imprimir un hueco: el correo no tiene por qué delatar qué se
      // quedó sin configurar.
      if (lineas.length === 0) return ''

      // Una línea que es SÓLO una dirección web se convierte en botón. No hay
      // sintaxis que aprender: en el texto plano se lee como un enlace, y en el
      // correo se ve como lo que es.
      if (lineas.length === 1 && /^https?:\/\/\S+$/.test(lineas[0].trim())) {
        const destino = escapar(lineas[0].trim())
        return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px">
          <tr><td style="border-radius:8px;background:#0f2f56">
            <a href="${destino}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Entrar al portal</a>
          </td></tr>
        </table>`
      }

      // Bloque de "Etiqueta: valor" → ficha de datos
      const esDatos = lineas.length > 1 && lineas.every((l) => /^[^:]{2,40}:\s/.test(l))
      if (esDatos) {
        const filas = lineas
          .map((l) => {
            const i = l.indexOf(':')
            return `<tr>
              <td style="padding:5px 16px 5px 0;color:#5b6472;font-size:13px;white-space:nowrap;vertical-align:top">${escapar(l.slice(0, i))}</td>
              <td style="padding:5px 0;color:#111c2c;font-size:14px;font-weight:500">${escapar(l.slice(i + 1).trim())}</td>
            </tr>`
          })
          .join('')
        // Enmarcada: en una bienvenida este bloque son las credenciales, y
        // tienen que encontrarse de un vistazo entre el resto del texto.
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f7f8fb;border:1px solid #e4e7ec;border-radius:10px;border-collapse:separate">
          <tr><td style="padding:14px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${filas}</table>
          </td></tr>
        </table>`
      }

      // Un párrafo de una sola línea corta y sin punto final funciona como
      // encabezado de sección: es como la gente escribe estas plantillas.
      if (lineas.length === 1 && lineas[0].length < 60 && !/[.:!?]$/.test(lineas[0].trim())) {
        return `<p style="margin:24px 0 8px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#5b6472">${escapar(lineas[0])}</p>`
      }

      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#111c2c">${escapar(p).replace(/\n/g, '<br>')}</p>`
    })
    .join('')
}

function maquetar(asunto: string, cuerpo: string, institucion = 'Rua'): string {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f6fa;-webkit-font-smoothing:antialiased">
  <!-- Preheader: lo que se ve en la bandeja junto al asunto, sin ocupar sitio -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapar(asunto)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa">
    <tr><td align="center" style="padding:32px 16px">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:600px;background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

        <tr><td style="padding:20px 28px;background:#0f2f56">
          <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-.01em">${escapar(institucion)}</span>
        </td></tr>

        <tr><td style="padding:28px">
          ${cuerpoAHtml(cuerpo)}
        </td></tr>

        <tr><td style="padding:18px 28px;background:#f7f8fb;border-top:1px solid #e4e7ec">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7585">
            Este mensaje se generó automáticamente desde el portal de gestión académica.
            No respondas a esta dirección.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

interface ResultadoEnvio {
  ok: boolean
  id?: string
  error?: string
}

/**
 * Envía un mensaje por Resend.
 *
 * Devuelve el error en vez de lanzarlo: quien vacía la cola necesita seguir
 * con los demás correos aunque uno falle, y guardar el motivo en su fila.
 */
async function enviarPorResend(opciones: {
  apiKey: string
  config: ConfigCorreo
  para: string
  asunto: string
  html: string
  texto: string
}): Promise<ResultadoEnvio> {
  const { apiKey, config, para, asunto, html, texto } = opciones

  const remitente = config.nombre_remitente
    ? `${config.nombre_remitente} <${config.remitente}>`
    : (config.remitente ?? '')

  try {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remitente,
        to: [para],
        subject: asunto,
        html,
        // Alternativa en texto plano: mejora la entregabilidad y sirve a quien
        // lee el correo sin HTML.
        text: texto,
        ...(config.responder_a ? { reply_to: config.responder_a } : {}),
        ...(config.copia_oculta ? { bcc: [config.copia_oculta] } : {}),
      }),
    })

    const cuerpo = await respuesta.json().catch(() => ({}))

    if (!respuesta.ok) {
      const detalle =
        (cuerpo as { message?: string; name?: string }).message ??
        (cuerpo as { name?: string }).name ??
        `HTTP ${respuesta.status}`
      return { ok: false, error: detalle }
    }

    return { ok: true, id: (cuerpo as { id?: string }).id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red al contactar con Resend' }
  }
}

// ============================ fin del bloque =================================

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: preflight(req) })
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
