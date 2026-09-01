/**
 * Variables de entorno, validadas sin reventar el arranque.
 *
 * Vite las INCRUSTA en tiempo de compilación: si no están puestas cuando se
 * ejecuta `vite build`, el bundle sale con `undefined` dentro y no hay forma
 * de arreglarlo desde el servidor. Es la trampa clásica al desplegar en
 * Vercel — se configuran las variables después del primer despliegue y nadie
 * entiende por qué la página sigue en blanco hasta que se vuelve a compilar.
 *
 * Antes esto lanzaba una excepción en el ámbito del módulo. En desarrollo iba
 * bien —el error salía en consola— pero en producción tumbaba el grafo de
 * módulos entero y el usuario veía una página vacía sin ninguna pista. Ahora
 * se reporta qué falta y `main.tsx` decide qué pintar.
 */

interface Variable {
  clave: string
  valor: string | undefined
  descripcion: string
}

const VARIABLES: Variable[] = [
  {
    clave: 'VITE_SUPABASE_URL',
    valor: import.meta.env.VITE_SUPABASE_URL,
    descripcion: 'URL del proyecto Supabase (Project Settings → API)',
  },
  {
    clave: 'VITE_SUPABASE_ANON_KEY',
    valor: import.meta.env.VITE_SUPABASE_ANON_KEY,
    descripcion: 'Clave pública anon del proyecto',
  },
]

/** Las variables que faltan o llegaron vacías. Vacío significa todo correcto. */
export const configuracionIncompleta = VARIABLES.filter((v) => !v.valor?.trim())

export const entorno = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  /** `true` en `vite build`; útil para no mostrar detalles internos en producción. */
  produccion: import.meta.env.PROD,
}
