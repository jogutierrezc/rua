import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Fallamos en el arranque y no en la primera consulta: un error claro aquí
 * ahorra media hora persiguiendo un 401 sin contexto.
 */
if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY.\n' +
      'Copia .env.example a .env.local y rellena las credenciales de tu proyecto Supabase.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'rua.auth',
  },
  db: { schema: 'public' },
  global: { headers: { 'x-application-name': 'rua' } },
})

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
