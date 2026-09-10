import type { TonoBadge } from '@/components/ui/primitives'
import type { EstadoVerificacion, TipoContactoInternacional } from '@/types/database'

/**
 * Cómo se dice cada veredicto, y de qué color.
 *
 * `riesgoso` es aviso y no peligro a propósito: son los contactos que TODAVÍA
 * pueden servir —un buzón genérico, un dominio que acepta todo— y a los que
 * merece la pena escribir con la precaución de saberlo. El rojo se reserva para
 * lo que se sabe que rebota, que es información distinta y lleva a otra acción:
 * buscar otra dirección.
 *
 * `error` no describe al correo, sino a nosotros: significa que no se pudo
 * preguntar. Por eso es neutro y no rojo — teñir de rojo un contacto porque se
 * cayó la red sería culparle de nuestro problema.
 */
export const ESTADO_VERIFICACION: Record<
  EstadoVerificacion,
  { etiqueta: string; tono: TonoBadge; explicacion: string }
> = {
  sin_verificar: {
    etiqueta: 'Sin verificar',
    tono: 'neutro',
    explicacion: 'Todavía no se ha comprobado si el buzón existe.',
  },
  valido: {
    etiqueta: 'Válido',
    tono: 'exito',
    explicacion: 'El buzón existe y acepta correo.',
  },
  riesgoso: {
    etiqueta: 'Riesgoso',
    tono: 'aviso',
    explicacion: 'Puede llegar o no: el proveedor no lo confirma ni lo descarta.',
  },
  invalido: {
    etiqueta: 'Inválido',
    tono: 'peligro',
    explicacion: 'El buzón no existe o el dominio rechaza el correo.',
  },
  error: {
    etiqueta: 'No se pudo consultar',
    tono: 'neutro',
    explicacion: 'Falló la consulta al verificador. No dice nada sobre el correo.',
  },
}

/**
 * De qué plantilla vino el contacto, dicho en castellano.
 *
 * `general` se llama «alta manual» y no «general» porque eso es lo que significa
 * para quien lo lee: nadie lo cargó desde una plantilla de nominación.
 */
export const ORIGEN_CONTACTO: Record<TipoContactoInternacional, string> = {
  general: 'Alta manual',
  academico: 'Académico',
  empleador: 'Empleador',
}

/** El orden en el que se ofrecen los filtros: primero lo que exige actuar. */
export const ESTADOS_VERIFICACION: EstadoVerificacion[] = [
  'sin_verificar',
  'invalido',
  'riesgoso',
  'valido',
  'error',
]

/**
 * Cuántos correos se mandan por llamada a la Edge Function.
 *
 * Tiene que ser menor o igual que el `MAX_LOTE` de la función, que corta a 25.
 * Se deja en 20 para que quede holgura y, sobre todo, para que la barra de
 * progreso avance con frecuencia: un lote demasiado grande se ve igual que uno
 * colgado.
 */
export const TAMANO_LOTE = 20

/**
 * Cuántas filas de la hoja viajan en cada llamada de importación.
 *
 * PostgREST corta cualquier consulta que pase de unos segundos, y con razón: es
 * lo que impide que una llamada mal hecha bloquee la base para todos. Una hoja
 * de cinco mil contactos no cabe en ese margen por muy barata que sea cada fila,
 * así que se trocea.
 *
 * Validar es sólo leer y sale más barato que escribir, de ahí que su trozo sea
 * mayor. Los dos números son conservadores a propósito: el coste de quedarse
 * corto es una llamada más, y el de pasarse es una importación que muere a
 * mitad.
 */
export const FILAS_POR_VALIDACION = 250
export const FILAS_POR_IMPORTACION = 100

/**
 * Por debajo de esto no se sigue encogiendo el lote.
 *
 * Si diez filas no caben en el tiempo que da la base, el problema ya no es el
 * tamaño: es que algo va mal en el servidor, y seguir partiendo sólo convertiría
 * un fallo claro en cien fallos lentos.
 */
export const FILAS_MINIMAS_POR_LOTE = 10

/** Trocea una lista en lotes del tamaño indicado. */
export function enLotes<T>(items: T[], tamano = TAMANO_LOTE): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano))
  return lotes
}

/**
 * El código estable de un valor del catálogo, a partir de su etiqueta.
 *
 * Se deriva y no se pide: nadie quiere teclear dos veces lo mismo, y un código
 * escrito a mano acaba con espacios y tildes. Al separarlos, renombrar «ONG» a
 * «Tercer sector» no pierde a qué apuntaban los contactos que ya lo tenían.
 */
export function aCodigoCatalogo(etiqueta: string): string {
  return etiqueta
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}
