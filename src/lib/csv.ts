/**
 * Lectura y escritura de CSV.
 *
 * Escrito a mano en lugar de traer una librería porque el caso es acotado y
 * el detalle que importa no es el parseo, sino aceptar lo que la gente pega
 * de verdad: Excel en español separa con punto y coma, al copiar celdas
 * directamente llegan tabuladores, y Windows mete CRLF.
 */

export type DelimitadorCsv = ',' | ';' | '\t'

/** Deduce el separador contando ocurrencias fuera de comillas en la cabecera. */
export function detectarDelimitador(texto: string): DelimitadorCsv {
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? ''
  const candidatos: DelimitadorCsv[] = [';', '\t', ',']

  let mejor: DelimitadorCsv = ','
  let maximo = 0

  for (const d of candidatos) {
    let cuenta = 0
    let enComillas = false
    for (const ch of primeraLinea) {
      if (ch === '"') enComillas = !enComillas
      else if (ch === d && !enComillas) cuenta++
    }
    if (cuenta > maximo) {
      maximo = cuenta
      mejor = d
    }
  }

  return mejor
}

/**
 * Divide el texto en filas de celdas.
 *
 * Recorre carácter a carácter en vez de partir por comas: un campo entre
 * comillas puede contener el separador e incluso saltos de línea, y una
 * nomenclatura como «Prácticas, clínicas y de campo» es exactamente ese caso.
 */
export function parsearCsv(texto: string, delimitador?: DelimitadorCsv): string[][] {
  const d = delimitador ?? detectarDelimitador(texto)
  // El BOM que antepone Excel se colaría en el primer nombre de columna.
  // Escrito con escape: literal es invisible en el editor y ESLint lo marca.
  const limpio = texto.replace(/^\uFEFF/, '')

  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let enComillas = false

  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]

    if (enComillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') {
          celda += '"' // comilla escapada por duplicación
          i++
        } else {
          enComillas = false
        }
      } else {
        celda += ch
      }
      continue
    }

    if (ch === '"') {
      enComillas = true
    } else if (ch === d) {
      fila.push(celda)
      celda = ''
    } else if (ch === '\n') {
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else if (ch !== '\r') {
      celda += ch
    }
  }

  // La última celda no viene seguida de salto de línea
  if (celda !== '' || fila.length > 0) {
    fila.push(celda)
    filas.push(fila)
  }

  // Descarta filas completamente vacías (líneas en blanco al final del archivo)
  return filas.filter((f) => f.some((c) => c.trim() !== ''))
}

/**
 * Convierte el CSV en objetos usando la primera fila como cabecera.
 *
 * Los nombres de columna se normalizan (sin tildes, minúsculas, guion bajo)
 * para que «Código», «codigo» y «CODIGO» sean la misma columna. Nadie debería
 * fallar una importación por una tilde.
 */
export function csvAObjetos(texto: string): Record<string, string>[] {
  const filas = parsearCsv(texto)
  if (filas.length < 2) return []

  const cabecera = filas[0].map(normalizarCabecera)

  return filas.slice(1).map((fila) => {
    const obj: Record<string, string> = {}
    cabecera.forEach((clave, i) => {
      if (clave) obj[clave] = (fila[i] ?? '').trim()
    })
    return obj
  })
}

/** Normaliza un nombre de columna: sin tildes, minúsculas, guion bajo. */
export function normalizarCabecera(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los diacriticos que NFD separo
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Escapa una celda sólo si lo necesita: comillas de más ensucian el archivo. */
function escaparCelda(valor: unknown): string {
  const s = valor == null ? '' : String(valor)
  return /["\n\r,;\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function objetosACsv(
  filas: Record<string, unknown>[],
  columnas: string[],
  delimitador: DelimitadorCsv = ',',
  /**
   * Anteponer la marca de orden de bytes.
   *
   * Por defecto s\u00ED: es lo que hace que Excel abra el archivo como UTF-8 y no
   * destroce las tildes, y casi siempre el destino de una exportaci\u00F3n es Excel.
   *
   * Se puede desactivar para los archivos que van a M\u00C1QUINAS y no a personas.
   * Una plantilla que se devuelve al sistema del que sali\u00F3 tiene que salir byte
   * a byte como entr\u00F3: hay lectores que no esperan el BOM y se lo comen dentro
   * del primer nombre de columna, con lo que \u00ABSource\u00BB pasa a llamarse \u00AB\uFEFFSource\u00BB
   * y la columna deja de reconocerse.
   */
  conBom = true,
): string {
  const lineas = [
    columnas.join(delimitador),
    ...filas.map((f) => columnas.map((c) => escaparCelda(f[c])).join(delimitador)),
  ]
  return (conBom ? '\uFEFF' : '') + lineas.join('\r\n')
}

/** Dispara la descarga de un texto como archivo. */
export function descargarTexto(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenido], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Sin esto el blob se queda en memoria mientras viva la pestaña.
  URL.revokeObjectURL(url)
}
