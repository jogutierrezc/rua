/**
 * Restablecimiento de contraseña por parte de un administrador.
 *
 * Igual que el alta, esto exige la `service_role` key: cambiar la contraseña de
 * OTRA cuenta es una operación de administración de `auth`, no algo que el
 * titular pueda hacer con su propia sesión.
 *
 * Deja constancia en la bitácora, porque el trigger `fn_auditar` no la ve:
 * la escritura ocurre en `auth.users`, fuera de las tablas auditadas.
 *
 * Despliegue:
 *   supabase functions deploy restablecer-contrasena
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const error = (mensaje: string, status: number, campo?: string) =>
  responder({ error: mensaje, campo }, status)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return error('Método no permitido.', 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !anon || !servicio) {
    console.error('Faltan variables de entorno en la función')
    return error('La función no está configurada correctamente.', 500)
  }

  const autorizacion = req.headers.get('Authorization')
  if (!autorizacion) return error('Falta la sesión.', 401)

  // ---------------------------------------------------------------------------
  // Quién llama, con SU token
  // ---------------------------------------------------------------------------
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  })

  const { data: sesion, error: errSesion } = await comoUsuario.auth.getUser()
  if (errSesion || !sesion.user) return error('Sesión inválida o expirada.', 401)

  const { data: autorizado, error: errPermiso } = await comoUsuario.rpc('fn_tengo_permiso', {
    p_codigo: 'usuarios.administrar',
  })
  if (errPermiso) {
    console.error('Error al comprobar el permiso:', errPermiso)
    return error('No se pudo verificar tus permisos.', 500)
  }
  if (!autorizado) return error('No tienes permiso para restablecer contraseñas.', 403)

  // ---------------------------------------------------------------------------
  // Validación
  // ---------------------------------------------------------------------------
  let cuerpo: { usuario_id?: string; contrasena?: string }
  try {
    cuerpo = await req.json()
  } catch {
    return error('El cuerpo de la petición no es JSON válido.', 400)
  }

  const usuarioId = cuerpo.usuario_id?.trim()
  const contrasena = cuerpo.contrasena ?? ''

  if (!usuarioId) return error('Falta el usuario.', 400, 'usuario_id')
  if (contrasena.length < 10) {
    return error('La contraseña debe tener al menos 10 caracteres.', 400, 'contrasena')
  }

  const admin = createClient(url, servicio, { auth: { persistSession: false } })

  // Se comprueba que el destinatario existe en `perfiles` y no sólo en `auth`:
  // así el mensaje de error distingue «no existe» de «falló el cambio».
  const { data: destino } = await admin
    .from('perfiles')
    .select('id, nombre_completo, correo')
    .eq('id', usuarioId)
    .maybeSingle()

  if (!destino) return error('El usuario no existe.', 404, 'usuario_id')

  // ---------------------------------------------------------------------------
  // Cambio
  // ---------------------------------------------------------------------------
  const { error: errCambio } = await admin.auth.admin.updateUserById(usuarioId, {
    password: contrasena,
  })

  if (errCambio) {
    const msg = errCambio.message ?? ''
    if (/password/i.test(msg)) {
      return error('La contraseña no cumple la política del proyecto.', 400, 'contrasena')
    }
    console.error('Error al restablecer la contraseña:', errCambio)
    return error('No se pudo restablecer la contraseña.', 500)
  }

  // Constancia. Nunca se guarda la contraseña, evidentemente: sólo el hecho.
  await admin.from('auditoria').insert({
    tabla: 'perfiles',
    registro_id: usuarioId,
    accion: 'restablecer_clave',
    actor_id: sesion.user.id,
    datos_despues: {
      nombre_completo: destino.nombre_completo,
      correo: destino.correo,
      restablecida_en: new Date().toISOString(),
    },
  })

  return responder({ ok: true, nombre_completo: destino.nombre_completo })
})
