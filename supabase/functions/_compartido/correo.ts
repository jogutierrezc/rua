/**
 * Maquetación y envío por Resend, compartido por las dos funciones de correo.
 *
 * Las plantillas se guardan en TEXTO PLANO a propósito: el administrador que
 * cambia una frase no debería tener que escribir HTML ni poder romper la
 * maqueta. Aquí se envuelve en una plantilla sobria que se ve bien en Gmail,
 * Outlook y clientes móviles.
 */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export interface ConfigCorreo {
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

export function maquetar(asunto: string, cuerpo: string, institucion = 'Rua'): string {
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

export interface ResultadoEnvio {
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
export async function enviarPorResend(opciones: {
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
