/**
 * Generación y medida de contraseñas.
 */

// Sin caracteres ambiguos: I/l/1 y O/0 se confunden al dictar una contraseña
// por teléfono o al copiarla de un papel, que es exactamente lo que ocurre
// cuando la genera un administrador para otra persona.
const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const MINUSCULAS = 'abcdefghijkmnopqrstuvwxyz'
const DIGITOS = '23456789'
const SIMBOLOS = '!@#$%&*+-=?'

/** Entero uniforme en [0, max) sin el sesgo de `% max`. */
function aleatorio(max: number): number {
  const limite = Math.floor(0xffffffff / max) * max
  const buffer = new Uint32Array(1)
  let n: number
  do {
    crypto.getRandomValues(buffer)
    n = buffer[0]
  } while (n >= limite)
  return n % max
}

/**
 * Contraseña con al menos un carácter de cada familia.
 *
 * Usa `crypto.getRandomValues` y no `Math.random`: la segunda es predecible
 * y no debe generar nada que proteja una cuenta.
 */
export function generarContrasena(longitud = 16): string {
  const familias = [MAYUSCULAS, MINUSCULAS, DIGITOS, SIMBOLOS]
  const todos = familias.join('')

  // Una de cada familia primero, para garantizar la composición...
  const caracteres = familias.map((f) => f[aleatorio(f.length)])
  while (caracteres.length < longitud) {
    caracteres.push(todos[aleatorio(todos.length)])
  }

  // ...y después se baraja (Fisher-Yates), o las cuatro primeras posiciones
  // tendrían siempre el mismo tipo de carácter.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1)
    ;[caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]]
  }

  return caracteres.join('')
}

export interface FuerzaContrasena {
  puntos: 0 | 1 | 2 | 3 | 4
  etiqueta: string
  /** Qué le falta para subir de nivel. Vacío si ya es fuerte. */
  sugerencia: string | null
}

/**
 * Estimación de fuerza.
 *
 * No pretende ser zxcvbn: mide longitud y variedad, que es lo que el usuario
 * puede corregir mientras escribe. Lo que de verdad manda es la política del
 * proyecto en Supabase, que se aplica en el servidor.
 */
export function medirFuerza(contrasena: string): FuerzaContrasena {
  if (!contrasena) {
    return { puntos: 0, etiqueta: 'Sin contraseña', sugerencia: null }
  }

  const familias = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(contrasena))
  const variedad = familias.length

  if (contrasena.length < 10) {
    return {
      puntos: 1,
      etiqueta: 'Muy débil',
      sugerencia: `Faltan ${10 - contrasena.length} caracteres para el mínimo.`,
    }
  }

  // Una secuencia repetida infla la longitud sin añadir nada.
  if (/^(.)\1+$/.test(contrasena)) {
    return { puntos: 1, etiqueta: 'Muy débil', sugerencia: 'Repetir un carácter no la hace segura.' }
  }

  if (variedad <= 2) {
    return {
      puntos: 2,
      etiqueta: 'Débil',
      sugerencia: 'Combina mayúsculas, minúsculas, números y símbolos.',
    }
  }

  if (contrasena.length >= 16 && variedad === 4) {
    return { puntos: 4, etiqueta: 'Muy fuerte', sugerencia: null }
  }

  if (contrasena.length >= 12 && variedad >= 3) {
    return {
      puntos: 3,
      etiqueta: 'Fuerte',
      sugerencia: variedad < 4 ? 'Añade un símbolo para reforzarla.' : null,
    }
  }

  return { puntos: 2, etiqueta: 'Aceptable', sugerencia: 'Alárgala hasta 12 caracteres o más.' }
}
