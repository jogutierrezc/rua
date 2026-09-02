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

      // Bloque de "Etiqueta: valor" → tabla de datos
      const esDatos = lineas.length > 1 && lineas.every((l) => /^[^:]{2,40}:\s/.test(l))
      if (esDatos) {
        const filas = lineas
          .map((l) => {
            const i = l.indexOf(':')
            return `<tr>
              <td style="padding:4px 16px 4px 0;color:#5b6472;font-size:13px;white-space:nowrap;vertical-align:top">${escapar(l.slice(0, i))}</td>
              <td style="padding:4px 0;color:#111c2c;font-size:14px">${escapar(l.slice(i + 1).trim())}</td>
            </tr>`
          })
          .join('')
        return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse">${filas}</table>`
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

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: preflight(req) })
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
