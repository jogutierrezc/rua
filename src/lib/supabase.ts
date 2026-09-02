import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { entorno } from './entorno'

// La validación ocurre en `main.tsx`, ANTES de importar este módulo: si
// faltaran credenciales, la aplicación ni siquiera se carga y se muestra la
// pantalla de configuración. Aquí ya se puede dar por hecho que son válidas.
const { supabaseUrl, supabaseAnonKey } = entorno

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'rua.auth',
  },
  db: { schema: 'public' },
  global: { headers: { 'x-application-name': 'rua' } },
})

/**
 * Devuelve un access token actual para llamadas a Edge Functions.
 *
 * `getUser()` fuerza a Supabase a validar o renovar la sesión antes de usarla;
 * luego `getSession()` devuelve el token ya actualizado para enviarlo de forma
 * explícita en la petición. Así evitamos depender de un header viejo si la
 * sesión quedó a medio refrescar en el navegador.
 */
export async function obtenerBearerTokenSesion(): Promise<string | null> {
  const { data: usuario, error } = await supabase.auth.getUser()
  if (error || !usuario.user) return null

  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Traduce los errores de PostgREST a algo que un usuario pueda leer. */
export function mensajeDeError(error: unknown): string {
  if (!error) return 'Ocurrió un error inesperado.'

  const e = error as { code?: string; message?: string; details?: string }

  switch (e.code) {
    case '23505':
      return 'Ya existe un registro con esos datos.'
    case '23503':
      return 'No se puede completar: hay registros relacionados que dependen de este.'
    case '23514':
      return 'Los datos no cumplen las reglas de validación del sistema.'
    case '42501':
    case 'PGRST301':
      return 'No tienes permisos para realizar esta acción.'
    case 'PGRST116':
      return 'No se encontró el registro solicitado.'
    default:
      return e.message ?? 'Ocurrió un error inesperado.'
  }
}
