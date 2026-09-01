/**
 * Alta de usuarios con contraseña.
 *
 * Existe como Edge Function y no como llamada desde el navegador porque crear
 * una cuenta en `auth.users` requiere la `service_role` key, que salta TODA la
 * seguridad del proyecto. Esa clave no puede estar en un bundle de JavaScript:
 * cualquiera abriría las herramientas de desarrollo y tendría acceso total.
 *
 * Tampoco sirve `supabase.auth.signUp()` desde el cliente: crea una sesión para
 * la cuenta nueva y expulsaría al administrador de la suya.
 *
 * El flujo aquí es:
 *   1. Verificar quién llama, con SU token (no con la clave de servicio).
 *   2. Comprobar que tiene `usuarios.administrar`, contra las mismas políticas
 *      RLS que rigen el resto de la aplicación.
 *   3. Sólo entonces, y sólo para el alta, usar la clave de servicio.
 *
 * Despliegue:
 *   supabase functions deploy crear-usuario
 *   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<clave>
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Peticion {
  nombre_completo?: string
  numero_documento?: string
  correo?: string
  contrasena?: string
  rol_id?: string
  cargo?: string
  vicerrectoria_id?: string
}

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function error(mensaje: string, status: number, campo?: string) {
  return responder({ error: mensaje, campo }, status)
}

// -----------------------------------------------------------------------------
// Validación. Se repite lo que ya comprueba la base de datos a propósito: un
// mensaje claro por campo vale más que un 23514 genérico rebotando al usuario.
// -----------------------------------------------------------------------------
const RE_CORREO = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i
const RE_DOCUMENTO = /^[A-Za-z0-9-]{5,20}$/

function validar(p: Peticion): { campo: string; mensaje: string } | null {
  const nombre = p.nombre_completo?.trim() ?? ''
  if (nombre.length < 3) {
    return { campo: 'nombre_completo', mensaje: 'Escribe el nombre completo.' }
  }
  if (!RE_DOCUMENTO.test(p.numero_documento?.trim() ?? '')) {
    return {
      campo: 'numero_documento',
      mensaje: 'El documento debe tener entre 5 y 20 caracteres alfanuméricos.',
    }
  }
  if (!RE_CORREO.test(p.correo?.trim() ?? '')) {
    return { campo: 'correo', mensaje: 'El correo institucional no es válido.' }
  }
  // 10 caracteres y no 8: es una contraseña que teclea un administrador y que
  // el titular no eligió, así que conviene que aguante algo más.
  if ((p.contrasena ?? '').length < 10) {
    return { campo: 'contrasena', mensaje: 'La contraseña debe tener al menos 10 caracteres.' }
  }
  if (!p.rol_id) {
    return { campo: 'rol_id', mensaje: 'Selecciona el rol del usuario.' }
  }
  return null
}

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
  // 1 · Quién llama. Con el token de quien llama, nunca con el de servicio.
  // ---------------------------------------------------------------------------
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  })

  const { data: sesion, error: errSesion } = await comoUsuario.auth.getUser()
  if (errSesion || !sesion.user) return error('Sesión inválida o expirada.', 401)

  // ---------------------------------------------------------------------------
  // 2 · Permiso. Se reutiliza la misma función que evalúan las políticas RLS,
  //     así que la regla vive en un solo sitio.
  // ---------------------------------------------------------------------------
  const { data: autorizado, error: errPermiso } = await comoUsuario.rpc('fn_tengo_permiso', {
    p_codigo: 'usuarios.administrar',
  })

  if (errPermiso) {
    console.error('Error al comprobar el permiso:', errPermiso)
    return error('No se pudo verificar tus permisos.', 500)
  }
  if (!autorizado) return error('No tienes permiso para crear usuarios.', 403)

  // ---------------------------------------------------------------------------
  // 3 · Validación
  // ---------------------------------------------------------------------------
  let cuerpo: Peticion
  try {
    cuerpo = await req.json()
  } catch {
    return error('El cuerpo de la petición no es JSON válido.', 400)
  }

  const invalido = validar(cuerpo)
  if (invalido) return error(invalido.mensaje, 400, invalido.campo)

  const nombre = cuerpo.nombre_completo!.trim()
  const documento = cuerpo.numero_documento!.trim().toUpperCase()
  const correo = cuerpo.correo!.trim().toLowerCase()

  const admin = createClient(url, servicio, { auth: { persistSession: false } })

  // El documento se comprueba ANTES de crear la cuenta: si chocara después, nos
  // quedaría un usuario en `auth` sin perfil utilizable y habría que limpiarlo.
  const { data: repetido } = await admin
    .from('perfiles')
    .select('id, nombre_completo')
    .ilike('numero_documento', documento)
    .maybeSingle()

  if (repetido) {
    return error(
      `El documento ${documento} ya está registrado a nombre de ${repetido.nombre_completo}.`,
      409,
      'numero_documento',
    )
  }

  // ---------------------------------------------------------------------------
  // 4 · Alta
  // ---------------------------------------------------------------------------
  const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
    email: correo,
    password: cuerpo.contrasena!,
    // Confirmado de oficio: lo da de alta un administrador, no hay un correo
    // de verificación que el titular deba abrir para poder entrar.
    email_confirm: true,
    user_metadata: { nombre_completo: nombre },
  })

  if (errCrear || !creado.user) {
    const msg = errCrear?.message ?? ''
    if (/already|registered|exists/i.test(msg)) {
      return error(`Ya existe una cuenta con el correo ${correo}.`, 409, 'correo')
    }
    if (/password/i.test(msg)) {
      return error('La contraseña no cumple la política del proyecto.', 400, 'contrasena')
    }
    console.error('Error al crear el usuario:', errCrear)
    return error('No se pudo crear la cuenta.', 500)
  }

  // El trigger `fn_perfil_al_registrar` ya creó el perfil con el rol de menor
  // privilegio. Aquí se completa con lo que eligió el administrador.
  const { error: errPerfil } = await admin
    .from('perfiles')
    .update({
      nombre_completo: nombre,
      numero_documento: documento,
      rol_id: cuerpo.rol_id,
      cargo: cuerpo.cargo?.trim() || null,
      vicerrectoria_id: cuerpo.vicerrectoria_id || null,
    })
    .eq('id', creado.user.id)

  if (errPerfil) {
    // Sin perfil correcto la cuenta es inservible y bloquearía el correo y el
    // documento para siempre. Se deshace el alta antes de devolver el error.
    console.error('Error al completar el perfil; se revierte el alta:', errPerfil)
    await admin.auth.admin.deleteUser(creado.user.id)
    return error('No se pudo completar el perfil. No se creó ningún usuario.', 500)
  }

  // Queda constancia de quién dio el alta, más allá del trigger de auditoría.
  await admin.from('auditoria').insert({
    tabla: 'perfiles',
    registro_id: creado.user.id,
    accion: 'insert',
    actor_id: sesion.user.id,
    datos_despues: { nombre_completo: nombre, correo, numero_documento: documento },
  })

  return responder({ id: creado.user.id, nombre_completo: nombre, correo }, 201)
})
