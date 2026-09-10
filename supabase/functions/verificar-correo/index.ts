/**
 * Verificación de correos contra AbstractAPI.
 *
 * Responde a la única pregunta que la base no puede responder sola: ¿este buzón
 * existe y acepta correo? Para saberlo hay que hablar con los servidores de
 * quien lo hospeda, y de eso se encarga el proveedor.
 *
 * Qué hace esta función y qué NO hace, que es lo que la mantiene honesta:
 *
 *   · Hace de transporte. Pide, recibe y entrega el JSON tal como llegó.
 *   · NO interpreta. Qué se cuenta como válido, riesgoso o inválido lo decide
 *     `fn_aplicar_verificacion` en la base. Es una regla de negocio, y una
 *     segunda copia aquí en TypeScript sería una segunda opinión esperando a
 *     discrepar con la primera.
 *   · NO deja que el navegador escriba el veredicto. La función RPC que sella
 *     el resultado sólo la puede ejecutar `service_role`; si fuera llamable
 *     desde el cliente, cualquiera podría marcar «verificado» un correo sin
 *     haber preguntado a nadie.
 *
 * Se despliega con:
 *
 *   supabase functions deploy verificar-correo
 *   supabase secrets set ABSTRACT_API_KEY=...
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // `x-application-name` la añade el cliente en `src/lib/supabase.ts`. Si no
  // está declarada aquí, el navegador corta en el preflight y la petición no
  // llega a salir — un fallo que sólo aparece desde el navegador y que con curl
  // no se reproduce jamás.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const preflight = (req: Request) => ({
  ...CORS,
  'Access-Control-Allow-Headers':
    req.headers.get('Access-Control-Request-Headers') ?? CORS['Access-Control-Allow-Headers'],
})

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/**
 * Cuántos correos se verifican por llamada.
 *
 * El límite no es de la base ni del proveedor: es del reloj. Una Edge Function
 * tiene un tiempo máximo de ejecución, y a un segundo por consulta —el ritmo que
 * permite el plan— un lote grande se quedaría a medias sin decir por dónde iba.
 * El cliente trocea la lista y llama varias veces, y así puede además pintar el
 * progreso en vez de un reloj de arena de dos minutos.
 */
const MAX_LOTE = 25

/** Espacio entre consultas: el plan gratuito admite una por segundo. */
const MS_ENTRE_CONSULTAS = 1_100

/**
 * A qué API de Abstract se pregunta.
 *
 * Abstract vende Email Reputation y Email Validation como productos SEPARADOS,
 * cada uno con su dominio y —esto es lo que muerde— con su propia clave: «each
 * user has unique API keys for each of Abstract's APIs». Usar la clave de uno
 * contra el otro devuelve «Invalid API key provided», que parece un problema de
 * la clave y es un problema de dirección.
 *
 * Por defecto se pregunta a Reputation, que es el producto contratado y además
 * el que más dice: añade riesgo de la dirección, antigüedad del dominio y
 * filtraciones conocidas. Quien tenga la clave del otro sólo tiene que apuntar
 * `ABSTRACT_API_URL` a su endpoint; la respuesta la entiende igual, porque quien
 * la interpreta —`fn_aplicar_verificacion`, en la base— reconoce las dos formas
 * mirando lo que llega.
 */
const URL_REPUTATION = 'https://emailreputation.abstractapi.com/v1/'

/**
 * Cada cuántos días se considera caducado un veredicto.
 *
 * Una verificación es un hecho fechado, no una propiedad eterna: la gente cambia
 * de trabajo y los buzones se cierran. Pero repetir la consulta de un correo
 * confirmado hace un mes es tirar créditos, así que sólo se rehace si ha pasado
 * este tiempo — o si quien llama lo pide expresamente.
 */
const DIAS_VIGENCIA = 90

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Contacto {
  id: string
  correo: string
  nombre_completo: string
  verificacion_en: string | null
  verificacion_estado: string
}

interface Resultado {
  id: string
  correo: string
  estado: string
  mensaje: string | null
  omitido?: boolean
}

/**
 * Consulta a AbstractAPI.
 *
 * Devuelve el error en lugar de lanzarlo: quien verifica un lote necesita seguir
 * con los demás aunque uno falle, y guardar el motivo en su fila.
 */
async function consultar(
  apiKey: string,
  correo: string,
  base: string,
): Promise<{ respuesta?: Record<string, unknown>; error?: string }> {
  const url =
    base +
    (base.includes('?') ? '&' : '?') +
    'api_key=' +
    encodeURIComponent(apiKey) +
    '&email=' +
    encodeURIComponent(correo)

  try {
    // Un servidor de correo lento no puede colgar el lote entero: se corta a los
    // 20 segundos y esa fila se anota como «no se pudo preguntar».
    const control = new AbortController()
    const reloj = setTimeout(() => control.abort(), 20_000)

    const r = await fetch(url, { signal: control.signal })
    clearTimeout(reloj)

    const cuerpo = (await r.json().catch(() => ({}))) as Record<string, unknown>

    // Lo que diga el proveedor, si dice algo. Suele ser lo más útil de todo.
    const suyo =
      (cuerpo.error as { message?: string } | undefined)?.message ??
      (cuerpo.message as string | undefined) ??
      null

    if (!r.ok) {
      // Los errores que de verdad ocurren merecen su propio texto: con «HTTP
      // 401» nadie sabe qué hacer, y con éstos sí.
      if (r.status === 401 || r.status === 403) {
        return {
          error:
            `AbstractAPI rechaza la clave en ${base}. Abstract da una clave DISTINTA por cada ` +
            'una de sus APIs, así que comprueba que la configurada sea la de ese mismo producto ' +
            'y no la de otro. Si tu clave es de otra de sus APIs, apunta el secreto ' +
            'ABSTRACT_API_URL a su endpoint.' + (suyo ? ` El proveedor dice: «${suyo}».` : ''),
        }
      }
      if (r.status === 422) {
        return {
          error:
            'Se agotaron los créditos del plan de AbstractAPI.' +
            (suyo ? ` El proveedor dice: «${suyo}».` : ''),
        }
      }
      if (r.status === 429) return { error: 'Demasiadas consultas seguidas: espera un momento.' }

      return { error: suyo || `El proveedor respondió HTTP ${r.status}.` }
    }

    return { respuesta: cuerpo }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { error: 'El proveedor tardó demasiado en responder.' }
    }
    return {
      error: e instanceof Error ? e.message : 'Error de red al contactar con el verificador.',
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: preflight(req) })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  // La clave se limpia antes de usarla.
  //
  // Un salto de línea al final —lo deja cualquier copia y pega— o unas comillas
  // alrededor —pasa al pegarla en el panel, donde no hacen falta— viajan dentro
  // de la URL, y el proveedor responde «Invalid API key provided» sin decir que
  // el problema es un carácter de más. Se quitan aquí porque nunca forman parte
  // de una clave y porque el fallo, sin esto, es indistinguible de una clave
  // equivocada.
  const bruto = Deno.env.get('ABSTRACT_API_KEY')?.trim() ?? ''
  const apiKey = bruto.replace(/^["'`]+|["'`]+$/g, '').trim() || undefined

  const endpoint = Deno.env.get('ABSTRACT_API_URL')?.trim() || URL_REPUTATION

  if (!url || !anon || !servicio) {
    return responder({ error: 'La función no está configurada correctamente.' }, 500)
  }

  // ---------------------------------------------------------------------------
  // Quién llama
  //
  // Se comprueba con el token de quien llama y no con la clave de servicio: cada
  // consulta cuesta un crédito del plan, así que esto no es sólo una cuestión de
  // datos, es una cuestión de gasto.
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
    p_codigo: 'internacionalizacion.verificar',
  })
  if (!autorizado) {
    return responder({ error: 'No tienes permiso para verificar correos.' }, 403)
  }

  let cuerpo: { contacto_ids?: string[]; forzar?: boolean } = {}
  try {
    cuerpo = await req.json()
  } catch {
    /* sin cuerpo: se interpreta como una consulta de diagnóstico */
  }

  /**
   * El diagnóstico nunca devuelve la clave, pero sí lo justo para reconocerla.
   *
   * «Está puesta» resultó no bastar: cuando el proveedor la rechaza, la pregunta
   * deja de ser si hay una clave y pasa a ser CUÁL hay —si es la del servicio
   * equivocado, si se pegó a medias, si se coló un espacio—. Con la longitud y
   * los cuatro caracteres de cada extremo, eso se comprueba de un vistazo contra
   * el panel de Abstract sin que la clave salga nunca entera de aquí.
   *
   * Cuatro y cuatro es el mismo mínimo que enseñan los paneles de Stripe o AWS
   * para identificar una credencial. Por debajo de doce caracteres no se enseña
   * nada: la parte oculta ya no ocultaría gran cosa.
   */
  const diagnostico = {
    api_key: Boolean(apiKey),
    longitud: apiKey?.length ?? 0,
    huella: apiKey && apiKey.length >= 12 ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : null,
    // A cuál de las APIs de Abstract se está preguntando. Sin esto, «clave
    // inválida» es indistinguible de «clave correcta, puerta equivocada», que
    // es exactamente la confusión que costó más tiempo resolver.
    api: endpoint === URL_REPUTATION ? 'Email Reputation' : endpoint,
  }

  const ids = (cuerpo.contacto_ids ?? []).filter((s) => typeof s === 'string')
  if (ids.length === 0) return responder({ diagnostico })

  if (ids.length > MAX_LOTE) {
    return responder(
      {
        error: `Máximo ${MAX_LOTE} correos por llamada. Divide la lista en lotes más pequeños.`,
        diagnostico,
      },
      400,
    )
  }

  if (!apiKey) {
    return responder(
      {
        error:
          'Falta ABSTRACT_API_KEY. Configúrala con: supabase secrets set ABSTRACT_API_KEY=...',
        diagnostico,
      },
      400,
    )
  }

  const admin = createClient(url, servicio, { auth: { persistSession: false } })

  const { data: contactos, error: errorLectura } = await admin
    .from('contactos_internacionales')
    .select('id, correo, nombre_completo, verificacion_en, verificacion_estado')
    .in('id', ids)

  if (errorLectura) {
    return responder({ error: 'No se pudieron leer los contactos.', diagnostico }, 500)
  }
  if (!contactos?.length) {
    return responder({ error: 'Ninguno de esos contactos existe.', diagnostico }, 404)
  }

  const limite = Date.now() - DIAS_VIGENCIA * 86_400_000
  const resultados: Resultado[] = []
  let consultados = 0

  for (const contacto of contactos as Contacto[]) {
    // Vigente y nadie ha pedido rehacerla: se salta y se dice, en vez de gastar
    // un crédito en confirmar lo que ya se sabe.
    const fresco =
      !cuerpo.forzar &&
      contacto.verificacion_en !== null &&
      contacto.verificacion_estado !== 'error' &&
      new Date(contacto.verificacion_en).getTime() > limite

    if (fresco) {
      resultados.push({
        id: contacto.id,
        correo: contacto.correo,
        estado: contacto.verificacion_estado,
        mensaje: `Verificado hace menos de ${DIAS_VIGENCIA} días: no se volvió a consultar.`,
        omitido: true,
      })
      continue
    }

    // El espaciado va ANTES de cada consulta menos la primera: así el lote no
    // arranca con una espera muerta, pero tampoco atropella el límite del plan.
    if (consultados > 0) await esperar(MS_ENTRE_CONSULTAS)
    consultados++

    const { respuesta, error } = await consultar(apiKey, contacto.correo, endpoint)

    const { data: veredicto, error: errorSello } = await admin.rpc('fn_aplicar_verificacion', {
      p_contacto_id: contacto.id,
      p_respuesta: respuesta ?? null,
      p_error: error ?? null,
      p_actor: sesion.user.id,
    })

    if (errorSello) {
      resultados.push({
        id: contacto.id,
        correo: contacto.correo,
        estado: 'error',
        mensaje: 'No se pudo guardar el resultado de la verificación.',
      })
      continue
    }

    const fila = (veredicto as { estado: string; mensaje: string }[] | null)?.[0]
    resultados.push({
      id: contacto.id,
      correo: contacto.correo,
      estado: fila?.estado ?? 'error',
      mensaje: fila?.mensaje ?? null,
    })
  }

  const resumen = resultados.reduce<Record<string, number>>((acc, r) => {
    const clave = r.omitido ? 'omitidos' : r.estado
    acc[clave] = (acc[clave] ?? 0) + 1
    return acc
  }, {})

  return responder({ ok: true, resultados, resumen, consultados, diagnostico })
})
