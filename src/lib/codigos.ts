/**
 * Reglas del código de actividad.
 *
 * Vive aquí porque el patrón estaba copiado en cuatro sitios —dos formularios,
 * la plantilla de Excel y el validador SQL— y bastó cambiar el mínimo una vez
 * para ver el problema: cuatro copias son cuatro oportunidades de que una se
 * quede atrás y acepte algo que la base luego rechaza.
 *
 * La quinta copia, la del servidor, no puede vivir en este archivo: el CHECK de
 * `actividades` y `fn_validar_importacion` son la autoridad real. Si cambias
 * este patrón, cambia también la migración correspondiente — están enlazadas
 * por comentario en ambos lados.
 */

export const CODIGO_MIN = 2
export const CODIGO_MAX = 32

/** Debe coincidir con el CHECK `actividades_codigo_formato` de la migración 12. */
export const RE_CODIGO_ACTIVIDAD = new RegExp(`^[A-Z0-9-]{${CODIGO_MIN},${CODIGO_MAX}}$`)

export const AYUDA_CODIGO = `Mayúsculas, números y guiones, de ${CODIGO_MIN} a ${CODIGO_MAX} caracteres.`

/**
 * Valida un código y devuelve el motivo del rechazo, o `null` si es válido.
 *
 * Devuelve el mensaje en vez de un booleano para que el formulario pueda
 * explicar QUÉ falla —demasiado corto, carácter no admitido— en lugar de un
 * «código inválido» que obliga a adivinar.
 */
export function validarCodigo(valor: string, obligatorio = true): string | null {
  const limpio = valor.trim().toUpperCase()

  if (!limpio) return obligatorio ? 'El código es obligatorio.' : null
  if (limpio.length < CODIGO_MIN) {
    return `Demasiado corto: mínimo ${CODIGO_MIN} caracteres.`
  }
  if (limpio.length > CODIGO_MAX) {
    return `Demasiado largo: máximo ${CODIGO_MAX} caracteres.`
  }
  if (!RE_CODIGO_ACTIVIDAD.test(limpio)) {
    return 'Sólo se admiten mayúsculas, números y guiones (sin espacios ni acentos).'
  }
  return null
}

/** Normaliza como lo hace la base: sin espacios y en mayúsculas. */
export function normalizarCodigo(valor: string): string {
  return valor.trim().toUpperCase()
}
