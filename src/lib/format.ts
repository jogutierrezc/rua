const LOCALE = 'es-MX'

export const fmtNumero = new Intl.NumberFormat(LOCALE)
export const fmtPorcentaje = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  maximumFractionDigits: 1,
})

const fmtFechaCorta = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const fmtFechaLarga = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const fmtHora = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })

/**
 * Fecha en el lenguaje con el que la gente habla: "Hoy, 09:30" pesa menos
 * que "01/09/2026 09:30" y se lee de un vistazo en una tabla densa.
 */
export function fechaRelativa(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'

  const hoy = new Date()
  const dias = Math.round(
    (new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  )

  if (dias === 0) return `Hoy, ${fmtHora.format(d)}`
  if (dias === 1) return `Ayer, ${fmtHora.format(d)}`
  if (dias < 7) return `Hace ${dias} días`
  if (d.getFullYear() === hoy.getFullYear()) return `${fmtFechaCorta.format(d)}, ${fmtHora.format(d)}`
  return fmtFechaLarga.format(d)
}

/**
 * Una fecha sin hora, interpretada en la zona de quien mira.
 *
 * `new Date('2026-03-12')` se interpreta como medianoche UTC, y Colombia va
 * cinco horas por detrás: la fecha se veía siempre un día antes. Con fecha y
 * hora completas no pasa, y por eso el fallo sólo asoma en las columnas de
 * tipo `date` — vencimientos y resoluciones, justo donde un día importa.
 */
function aFechaLocal(iso: string): Date {
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!soloFecha) return new Date(iso)
  const [, a, m, d] = soloFecha
  return new Date(Number(a), Number(m) - 1, Number(d))
}

export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = aFechaLocal(iso)
  return Number.isNaN(d.getTime()) ? '—' : fmtFechaLarga.format(d)
}

/**
 * El plazo que queda, en la unidad que la gente usa para hablar de él.
 *
 * «en 428 días» no le dice nada a nadie; «en 1 año y 2 meses» sí. Y por debajo
 * de dos meses se vuelve a los días, porque ahí la cuenta atrás importa al día.
 */
export function tiempoRestante(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return 'Sin registro'

  if (dias < 0) {
    const v = Math.abs(dias)
    if (v < 60) return `Vencido hace ${v} ${v === 1 ? 'día' : 'días'}`
    const meses = Math.floor(v / 30)
    return `Vencido hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
  }

  if (dias === 0) return 'Vence hoy'
  if (dias < 60) return `${dias} ${dias === 1 ? 'día' : 'días'}`

  const meses = Math.floor(dias / 30)
  if (meses < 12) return `${meses} meses`

  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  const parteAnos = `${anos} ${anos === 1 ? 'año' : 'años'}`
  return resto === 0 ? parteAnos : `${parteAnos} y ${resto} ${resto === 1 ? 'mes' : 'meses'}`
}

/** Iniciales para el avatar de respaldo. Refleja fn_iniciales() en la base. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter((p, i) => p.length > 2 || i === 0)
  return partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

/** "1 a 10 de 45" — el texto de paginación, en un solo sitio. */
export function rangoPaginacion(pagina: number, porPagina: number, total: number) {
  if (total === 0) return { desde: 0, hasta: 0, texto: 'Sin registros' }
  const desde = pagina * porPagina + 1
  const hasta = Math.min((pagina + 1) * porPagina, total)
  return { desde, hasta, texto: `${desde} a ${hasta} de ${fmtNumero.format(total)}` }
}
