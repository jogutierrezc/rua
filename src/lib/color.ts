/**
 * Matemática de color.
 *
 * Existe para que el contraste de la interfaz sea una CONSECUENCIA del sistema
 * y no una esperanza. En vez de elegir hexadecimales a ojo y confiar en que se
 * lean, aquí se declara el ratio que hace falta y se busca la luminosidad que
 * lo consigue. Un botón sólido pide 4.5:1 contra su texto; si el azul de marca
 * no llega, se oscurece hasta llegar.
 *
 * Todo es WCAG 2.1: luminancia relativa y ratio (L1+0.05)/(L2+0.05).
 */

export type Rgb = [number, number, number]
export type Hsl = [number, number, number] // h 0-360, s 0-1, l 0-1

// -----------------------------------------------------------------------------
// Conversiones
// -----------------------------------------------------------------------------

export function hexARgb(hex: string): Rgb {
  const h = hex.replace('#', '').trim()
  const completo =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h

  if (!/^[0-9a-fA-F]{6}$/.test(completo)) {
    throw new Error(`Color hexadecimal inválido: "${hex}"`)
  }

  return [
    parseInt(completo.slice(0, 2), 16),
    parseInt(completo.slice(2, 4), 16),
    parseInt(completo.slice(4, 6), 16),
  ]
}

const aDosDigitos = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')

export function rgbAHex([r, g, b]: Rgb): string {
  return `#${aDosDigitos(r)}${aDosDigitos(g)}${aDosDigitos(b)}`
}

/** Formato que consumen las custom properties: "39 41 50". */
export function canales([r, g, b]: Rgb): string {
  return `${Math.round(clamp(r, 0, 255))} ${Math.round(clamp(g, 0, 255))} ${Math.round(clamp(b, 0, 255))}`
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function rgbAHsl([r, g, b]: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  const l = (max + min) / 2

  if (d === 0) return [0, 0, l]

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60

  return [h, s, l]
}

export function hslARgb([h, s, l]: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = l - c / 2

  let rgb: [number, number, number]
  if (hn < 60) rgb = [c, x, 0]
  else if (hn < 120) rgb = [x, c, 0]
  else if (hn < 180) rgb = [0, c, x]
  else if (hn < 240) rgb = [0, x, c]
  else if (hn < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]

  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255]
}

// -----------------------------------------------------------------------------
// Contraste
// -----------------------------------------------------------------------------

function aLineal(canal: number) {
  const c = canal / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Luminancia relativa WCAG. 0 = negro, 1 = blanco. */
export function luminancia([r, g, b]: Rgb): number {
  return 0.2126 * aLineal(r) + 0.7152 * aLineal(g) + 0.0722 * aLineal(b)
}

/** Ratio de contraste WCAG entre dos colores. De 1:1 a 21:1. */
export function contraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const [claro, oscuro] = la > lb ? [la, lb] : [lb, la]
  return (claro + 0.05) / (oscuro + 0.05)
}

// -----------------------------------------------------------------------------
// Derivación
// -----------------------------------------------------------------------------

/** Interpola dos colores. `t = 0` devuelve `a`; `t = 1`, `b`. */
export function mezclar(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp(t, 0, 1)
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

export function conLuminosidad(color: Rgb, l: number): Rgb {
  const [h, s] = rgbAHsl(color)
  return hslARgb([h, s, clamp(l, 0, 1)])
}

export function conSaturacion(color: Rgb, s: number): Rgb {
  const [h, , l] = rgbAHsl(color)
  return hslARgb([h, clamp(s, 0, 1), l])
}

export const BLANCO: Rgb = [255, 255, 255]
export const NEGRO: Rgb = [0, 0, 0]

/**
 * Mueve la luminosidad de `base` hasta alcanzar `objetivo` de contraste contra
 * `fondo`, conservando tono y saturación.
 *
 * Búsqueda binaria sobre la luminosidad HSL: el contraste crece de forma
 * monótona conforme nos alejamos del fondo, así que 24 iteraciones bastan para
 * clavarlo. Si ni el extremo (negro puro o blanco puro) alcanza el objetivo,
 * devuelve ese extremo — es lo mejor disponible, y el verificador lo delatará.
 */
export function haciaContraste(
  base: Rgb,
  fondo: Rgb,
  objetivo: number,
  direccion: 'oscurecer' | 'aclarar',
): Rgb {
  if (contraste(base, fondo) >= objetivo) return base

  const [, , lBase] = rgbAHsl(base)
  const extremo = direccion === 'oscurecer' ? 0 : 1

  // ¿Alcanza siquiera el extremo? Si no, no hay nada mejor que devolver.
  if (contraste(conLuminosidad(base, extremo), fondo) < objetivo) {
    return conLuminosidad(base, extremo)
  }

  let cerca = lBase // no cumple
  let lejos = extremo // sí cumple

  for (let i = 0; i < 24; i++) {
    const medio = (cerca + lejos) / 2
    if (contraste(conLuminosidad(base, medio), fondo) >= objetivo) lejos = medio
    else cerca = medio
  }

  return conLuminosidad(base, lejos)
}

/** Elige el texto (claro u oscuro) que mejor se lee sobre `fondo`. */
export function textoSobre(fondo: Rgb, claro: Rgb = BLANCO, oscuro: Rgb = [17, 20, 28]): Rgb {
  return contraste(claro, fondo) >= contraste(oscuro, fondo) ? claro : oscuro
}
