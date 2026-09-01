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

export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : fmtFechaLarga.format(d)
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
