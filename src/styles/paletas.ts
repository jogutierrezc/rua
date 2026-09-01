import {
  BLANCO,
  NEGRO,
  canales,
  conSaturacion,
  contraste,
  haciaContraste,
  hexARgb,
  hslARgb,
  mezclar,
  rgbAHsl,
  type Rgb,
} from '@/lib/color'

/**
 * Paletas y derivación de tokens.
 *
 * Una paleta de cinco colores no es un sistema de interfaz. Cinco muestras no
 * dicen cuál es el fondo de una fila al pasar el cursor, ni qué azul aguanta
 * texto blanco encima. Lo que se declara aquí son SEMILLAS —tono de marca,
 * tinta, neutro, matiz y claro— y el derivador construye los ~30 tokens que
 * la aplicación usa, buscando en cada paso la luminosidad que cumple el
 * contraste exigido.
 *
 * Consecuencia práctica: los colores de los botones no se eligen, se calculan.
 * Un azul acero como #4d7ea8 sólo llega a 4.3:1 con texto blanco —insuficiente
 * para texto pequeño— así que en modo claro el botón sólido se oscurece hasta
 * pasar, y en oscuro se aclara. La marca se reconoce igual; el texto se lee.
 */

export type ModoTema = 'claro' | 'oscuro'

export interface SemillasPaleta {
  /** Color de marca: define el tono de acciones, enlaces y foco. */
  marca: string
  /** El más oscuro: tinta del texto en claro, superficie en oscuro. */
  tinta: string
  /** Gris de apoyo: bordes y texto secundario. */
  neutro: string
  /** Acento secundario, para lo que pide atención sin ser un error. */
  matiz: string
  /** El más claro: tintes, fondos y superficies. */
  claro: string
}

export interface Paleta {
  id: string
  nombre: string
  descripcion: string
  semillas: SemillasPaleta
  /** Las cinco muestras originales, tal cual, para el selector. */
  muestras: { nombre: string; hex: string }[]
}

// -----------------------------------------------------------------------------
// Catálogo
// -----------------------------------------------------------------------------

export const PALETAS: Paleta[] = [
  {
    id: 'udes-blue',
    nombre: 'UDES Blue',
    descripcion: 'Azul acero institucional sobre grises fríos.',
    semillas: {
      marca: '#4d7ea8',
      tinta: '#272932',
      neutro: '#828489',
      matiz: '#9e90a2',
      claro: '#b6c2d9',
    },
    muestras: [
      { nombre: 'Shadow Grey', hex: '#272932' },
      { nombre: 'Steel Blue', hex: '#4d7ea8' },
      { nombre: 'Grey', hex: '#828489' },
      { nombre: 'Lilac Ash', hex: '#9e90a2' },
      { nombre: 'Powder Blue', hex: '#b6c2d9' },
    ],
  },
  {
    id: 'indigo-udes',
    nombre: 'Indigo UDES',
    descripcion: 'Cian profundo con neutros cálidos.',
    semillas: {
      marca: '#4f9594',
      tinta: '#272e2d',
      neutro: '#828686',
      matiz: '#9d9a99',
      claro: '#b6cfce',
    },
    muestras: [
      { nombre: 'Jet Black', hex: '#272e2d' },
      { nombre: 'Dark Cyan', hex: '#4f9594' },
      { nombre: 'Grey Olive', hex: '#828686' },
      { nombre: 'Rosy Granite', hex: '#9d9a99' },
      { nombre: 'Ash Grey', hex: '#b6cfce' },
    ],
  },
  {
    id: 'soft-sand',
    nombre: 'Soft Sand',
    descripcion: 'Arenas y linos, de bajo contraste y lectura larga.',
    semillas: {
      // La paleta original es toda clara: no hay ningún color que pueda ser
      // tinta ni marca. Se toma su tono cálido y se lleva a la luminosidad que
      // el sistema necesita; el resultado sigue siendo la misma familia.
      marca: '#a17b60',
      tinta: '#33291f',
      neutro: '#8d8378',
      matiz: '#d5bdaf',
      claro: '#f5ebe0',
    },
    muestras: [
      { nombre: 'Parchment', hex: '#edede9' },
      { nombre: 'Dust Grey', hex: '#d6ccc2' },
      { nombre: 'Linen', hex: '#f5ebe0' },
      { nombre: 'Powder Petal', hex: '#e3d5ca' },
      { nombre: 'Almond Silk', hex: '#d5bdaf' },
    ],
  },
  {
    id: 'rua-clasico',
    nombre: 'Rua clásico',
    descripcion: 'El azul marino original del portal.',
    semillas: {
      marca: '#1f4f8f',
      tinta: '#111c2c',
      neutro: '#78828f',
      matiz: '#a14009',
      claro: '#dbe7fb',
    },
    muestras: [
      { nombre: 'Navy', hex: '#002045' },
      { nombre: 'Azure', hex: '#1f4f8f' },
      { nombre: 'Slate', hex: '#78828f' },
      { nombre: 'Ember', hex: '#a14009' },
      { nombre: 'Mist', hex: '#dbe7fb' },
    ],
  },
]

export const PALETA_POR_DEFECTO = 'udes-blue'

export function buscarPaleta(id: string | null | undefined): Paleta {
  return PALETAS.find((p) => p.id === id) ?? PALETAS.find((p) => p.id === PALETA_POR_DEFECTO)!
}

// -----------------------------------------------------------------------------
// Umbrales de contraste
//
// 4.5:1 es el mínimo AA para texto normal. Las etiquetas de los botones son de
// 12 px, así que TODO texto sobre color se mide contra ese listón, no contra el
// 3:1 que se permite en texto grande.
// -----------------------------------------------------------------------------
const TEXTO = 4.6 // margen sobre 4.5 para absorber el redondeo a 8 bits
const TEXTO_SECUNDARIO = 4.6
const TEXTO_FUERTE = 7
const NO_TEXTO = 3.1 // bordes de foco y elementos de interfaz (AA 1.4.11)

/** Tonos de estado. Fijos a propósito: un error debe verse rojo en toda paleta. */
const ESTADOS = {
  success: 145,
  warning: 40,
  danger: 5,
} as const

// -----------------------------------------------------------------------------
// Derivación
// -----------------------------------------------------------------------------

export type Tokens = Record<string, string>

export function derivarTokens(paleta: Paleta, modo: ModoTema): Tokens {
  const marca = hexARgb(paleta.semillas.marca)
  const tinta = hexARgb(paleta.semillas.tinta)
  const neutro = hexARgb(paleta.semillas.neutro)
  const matiz = hexARgb(paleta.semillas.matiz)
  const claro = hexARgb(paleta.semillas.claro)

  return modo === 'claro'
    ? derivarClaro({ marca, tinta, neutro, matiz, claro })
    : derivarOscuro({ marca, tinta, neutro, matiz, claro })
}

interface Semillas {
  marca: Rgb
  tinta: Rgb
  neutro: Rgb
  matiz: Rgb
  claro: Rgb
}

function derivarClaro({ marca, tinta, neutro, matiz, claro }: Semillas): Tokens {
  // Superficies: tintes del color claro sobre blanco. El lienzo es el más
  // teñido y las tarjetas el más limpio, para que floten sin necesitar sombra.
  const surface = mezclar(claro, BLANCO, 0.965)
  const canvas = mezclar(claro, BLANCO, 0.86)
  const surfaceMuted = mezclar(claro, BLANCO, 0.8)
  const sunken = mezclar(claro, BLANCO, 0.72)

  const fg = haciaContraste(tinta, surface, 13, 'oscurecer')
  // El texto secundario se calcula contra la superficie MÁS OSCURA sobre la que
  // puede acabar —la cabecera de tabla, no la tarjeta—. Derivarlo contra el
  // fondo más favorable es lo que hace que luego no se lea en las filas grises.
  const fgMuted = haciaContraste(neutro, sunken, TEXTO_FUERTE, 'oscurecer')
  const fgSubtle = haciaContraste(neutro, sunken, TEXTO_SECUNDARIO, 'oscurecer')

  // El botón sólido: se oscurece la marca hasta que el texto blanco encima
  // pase AA. Es exactamente el ajuste que un azul medio necesita.
  const primary = haciaContraste(marca, BLANCO, TEXTO, 'oscurecer')
  // Al pasar el cursor el botón aclara, pero sin caer por debajo del umbral.
  const primaryHover = haciaContraste(mezclar(primary, marca, 0.55), BLANCO, TEXTO, 'oscurecer')
  const primaryActive = mezclar(primary, NEGRO, 0.22)

  const primarySoft = mezclar(marca, BLANCO, 0.88)
  const primarySoftFg = haciaContraste(marca, primarySoft, TEXTO, 'oscurecer')

  // El matiz suele venir desaturado; se realza para que lea como acento y no
  // como otro gris más.
  const acentoBase = conSaturacion(matiz, Math.max(0.42, rgbAHsl(matiz)[1]))
  const accent = haciaContraste(acentoBase, BLANCO, TEXTO, 'oscurecer')
  const accentSoft = mezclar(acentoBase, BLANCO, 0.86)
  const accentSoftFg = haciaContraste(acentoBase, accentSoft, TEXTO, 'oscurecer')

  const estado = (hue: number) => {
    const base = hslARgb([hue, 0.62, 0.42])
    const solido = haciaContraste(base, BLANCO, TEXTO, 'oscurecer')
    const soft = mezclar(base, BLANCO, 0.87)
    const softFg = haciaContraste(base, soft, TEXTO, 'oscurecer')
    return { solido, soft, softFg }
  }

  const exito = estado(ESTADOS.success)
  const aviso = estado(ESTADOS.warning)
  const peligro = estado(ESTADOS.danger)

  return construir({
    canvas,
    sunken,
    surface,
    surfaceMuted,
    surfaceRaised: BLANCO,
    fg,
    fgMuted,
    fgSubtle,
    fgOnDark: mezclar(claro, BLANCO, 0.6),
    // `line` es decorativa (separadores): puede ser suave.
    // `line-strong` dibuja el borde de los campos, que es un componente de
    // interfaz y exige 3:1 por WCAG 1.4.11. Se calcula, no se estima.
    line: mezclar(neutro, BLANCO, 0.78),
    lineStrong: haciaContraste(neutro, surface, NO_TEXTO, 'oscurecer'),
    primary,
    primaryHover,
    primaryActive,
    primaryFg: BLANCO,
    primarySoft,
    primarySoftFg,
    accent,
    accentFg: BLANCO,
    accentSoft,
    accentSoftFg,
    exito,
    aviso,
    peligro,
    focus: haciaContraste(conSaturacion(marca, 0.7), canvas, NO_TEXTO, 'oscurecer'),
    shadow: mezclar(tinta, NEGRO, 0.3),
    materialBg: BLANCO,
    materialAlpha: 0.74,
  })
}

function derivarOscuro({ marca, tinta, neutro, matiz, claro }: Semillas): Tokens {
  // En oscuro los papeles se invierten: la tinta pasa a ser la superficie, y
  // el lienzo se hunde por debajo de ella.
  const surface = mezclar(tinta, claro, 0.06)
  const canvas = mezclar(tinta, NEGRO, 0.42)
  const sunken = mezclar(tinta, NEGRO, 0.22)
  const surfaceMuted = mezclar(tinta, claro, 0.13)
  const surfaceRaised = mezclar(tinta, claro, 0.1)

  const fg = mezclar(claro, BLANCO, 0.45)
  // En oscuro la superficie más CLARA es la fila resaltada, así que es ahí
  // donde el texto secundario lo tiene más difícil. Se deriva contra ella.
  const fgMuted = haciaContraste(neutro, surfaceMuted, 6, 'aclarar')
  const fgSubtle = haciaContraste(neutro, surfaceMuted, TEXTO_SECUNDARIO, 'aclarar')

  // El azul marino profundo desaparece sobre fondo oscuro: la marca sube hasta
  // ser legible, y el texto del botón pasa a ser tinta.
  const primary = haciaContraste(marca, surface, 5.5, 'aclarar')
  const primaryHover = mezclar(primary, BLANCO, 0.16)
  const primaryActive = mezclar(primary, tinta, 0.18)
  const primaryFg = haciaContraste(tinta, primary, TEXTO, 'oscurecer')

  const primarySoft = mezclar(marca, tinta, 0.78)
  const primarySoftFg = haciaContraste(marca, primarySoft, TEXTO, 'aclarar')

  const acentoBase = conSaturacion(matiz, Math.max(0.45, rgbAHsl(matiz)[1]))
  const accent = haciaContraste(acentoBase, surface, 5.5, 'aclarar')
  const accentSoft = mezclar(acentoBase, tinta, 0.8)
  const accentSoftFg = haciaContraste(acentoBase, accentSoft, TEXTO, 'aclarar')

  const estado = (hue: number) => {
    const base = hslARgb([hue, 0.6, 0.58])
    const solido = haciaContraste(base, surface, 5, 'aclarar')
    const soft = mezclar(base, tinta, 0.8)
    const softFg = haciaContraste(base, soft, TEXTO, 'aclarar')
    return { solido, soft, softFg }
  }

  const exito = estado(ESTADOS.success)
  const aviso = estado(ESTADOS.warning)
  const peligro = estado(ESTADOS.danger)

  return construir({
    canvas,
    sunken,
    surface,
    surfaceMuted,
    surfaceRaised,
    fg,
    fgMuted,
    fgSubtle,
    fgOnDark: fg,
    line: mezclar(tinta, claro, 0.2),
    lineStrong: haciaContraste(mezclar(tinta, claro, 0.4), surface, NO_TEXTO, 'aclarar'),
    primary,
    primaryHover,
    primaryActive,
    primaryFg,
    primarySoft,
    primarySoftFg,
    accent,
    accentFg: haciaContraste(tinta, accent, TEXTO, 'oscurecer'),
    accentSoft,
    accentSoftFg,
    exito,
    aviso,
    peligro,
    focus: haciaContraste(conSaturacion(marca, 0.75), canvas, NO_TEXTO, 'aclarar'),
    shadow: NEGRO,
    materialBg: surface,
    materialAlpha: 0.76,
  })
}

interface Piezas {
  canvas: Rgb
  sunken: Rgb
  surface: Rgb
  surfaceMuted: Rgb
  surfaceRaised: Rgb
  fg: Rgb
  fgMuted: Rgb
  fgSubtle: Rgb
  fgOnDark: Rgb
  line: Rgb
  lineStrong: Rgb
  primary: Rgb
  primaryHover: Rgb
  primaryActive: Rgb
  primaryFg: Rgb
  primarySoft: Rgb
  primarySoftFg: Rgb
  accent: Rgb
  accentFg: Rgb
  accentSoft: Rgb
  accentSoftFg: Rgb
  exito: { solido: Rgb; soft: Rgb; softFg: Rgb }
  aviso: { solido: Rgb; soft: Rgb; softFg: Rgb }
  peligro: { solido: Rgb; soft: Rgb; softFg: Rgb }
  focus: Rgb
  shadow: Rgb
  materialBg: Rgb
  materialAlpha: number
}

function construir(p: Piezas): Tokens {
  return {
    '--c-canvas': canales(p.canvas),
    '--c-sunken': canales(p.sunken),
    '--c-surface': canales(p.surface),
    '--c-surface-muted': canales(p.surfaceMuted),
    '--c-surface-raised': canales(p.surfaceRaised),

    '--c-fg': canales(p.fg),
    '--c-fg-muted': canales(p.fgMuted),
    '--c-fg-subtle': canales(p.fgSubtle),
    '--c-fg-on-dark': canales(p.fgOnDark),

    '--c-line': canales(p.line),
    '--c-line-strong': canales(p.lineStrong),

    '--c-primary': canales(p.primary),
    '--c-primary-hover': canales(p.primaryHover),
    '--c-primary-active': canales(p.primaryActive),
    '--c-primary-fg': canales(p.primaryFg),
    '--c-primary-soft': canales(p.primarySoft),
    '--c-primary-soft-fg': canales(p.primarySoftFg),

    '--c-accent': canales(p.accent),
    '--c-accent-fg': canales(p.accentFg),
    '--c-accent-soft': canales(p.accentSoft),
    '--c-accent-soft-fg': canales(p.accentSoftFg),

    '--c-success': canales(p.exito.solido),
    '--c-success-soft': canales(p.exito.soft),
    '--c-success-soft-fg': canales(p.exito.softFg),

    '--c-warning': canales(p.aviso.solido),
    '--c-warning-soft': canales(p.aviso.soft),
    '--c-warning-soft-fg': canales(p.aviso.softFg),

    '--c-danger': canales(p.peligro.solido),
    '--c-danger-soft': canales(p.peligro.soft),
    '--c-danger-soft-fg': canales(p.peligro.softFg),

    '--c-focus': canales(p.focus),
    '--c-shadow': canales(p.shadow),

    '--material-bg': canales(p.materialBg),
    '--material-alpha': String(p.materialAlpha),
  }
}

// -----------------------------------------------------------------------------
// Comprobaciones
//
// Los pares que DEBEN cumplir contraste. Es la misma lista que verifica el
// script `npm run check:contraste`, así que lo que se afirma del sistema es
// comprobable y no una declaración de intenciones.
// -----------------------------------------------------------------------------
export interface Comprobacion {
  descripcion: string
  frente: string
  fondo: string
  minimo: number
}

export const COMPROBACIONES: Comprobacion[] = [
  { descripcion: 'Texto principal sobre tarjeta', frente: '--c-fg', fondo: '--c-surface', minimo: 7 },
  { descripcion: 'Texto principal sobre lienzo', frente: '--c-fg', fondo: '--c-canvas', minimo: 7 },
  { descripcion: 'Texto secundario sobre tarjeta', frente: '--c-fg-muted', fondo: '--c-surface', minimo: 4.5 },
  { descripcion: 'Texto tenue sobre tarjeta', frente: '--c-fg-subtle', fondo: '--c-surface', minimo: 4.5 },
  { descripcion: 'Texto tenue sobre fila resaltada', frente: '--c-fg-subtle', fondo: '--c-surface-muted', minimo: 4.5 },
  { descripcion: 'Texto tenue sobre cabecera de tabla', frente: '--c-fg-subtle', fondo: '--c-sunken', minimo: 4.5 },

  { descripcion: 'Botón primario: etiqueta', frente: '--c-primary-fg', fondo: '--c-primary', minimo: 4.5 },
  { descripcion: 'Botón primario en hover: etiqueta', frente: '--c-primary-fg', fondo: '--c-primary-hover', minimo: 4.5 },
  { descripcion: 'Botón primario pulsado: etiqueta', frente: '--c-primary-fg', fondo: '--c-primary-active', minimo: 4.5 },
  { descripcion: 'Botón sutil: etiqueta', frente: '--c-primary-soft-fg', fondo: '--c-primary-soft', minimo: 4.5 },
  { descripcion: 'Botón secundario: etiqueta', frente: '--c-fg', fondo: '--c-surface', minimo: 4.5 },
  { descripcion: 'Botón secundario en hover', frente: '--c-fg', fondo: '--c-surface-muted', minimo: 4.5 },
  { descripcion: 'Botón fantasma: etiqueta', frente: '--c-fg-muted', fondo: '--c-canvas', minimo: 4.5 },
  { descripcion: 'Botón de peligro: etiqueta', frente: '--c-danger-soft-fg', fondo: '--c-danger-soft', minimo: 4.5 },
  { descripcion: 'Botón de peligro en hover', frente: '--c-primary-fg', fondo: '--c-danger', minimo: 4.5 },

  { descripcion: 'Distintivo de éxito', frente: '--c-success-soft-fg', fondo: '--c-success-soft', minimo: 4.5 },
  { descripcion: 'Distintivo de aviso', frente: '--c-warning-soft-fg', fondo: '--c-warning-soft', minimo: 4.5 },
  { descripcion: 'Distintivo de peligro', frente: '--c-danger-soft-fg', fondo: '--c-danger-soft', minimo: 4.5 },
  { descripcion: 'Distintivo de acento', frente: '--c-accent-soft-fg', fondo: '--c-accent-soft', minimo: 4.5 },
  { descripcion: 'Navegación activa', frente: '--c-primary-soft-fg', fondo: '--c-primary-soft', minimo: 4.5 },

  { descripcion: 'Borde de campo sobre tarjeta', frente: '--c-line-strong', fondo: '--c-surface', minimo: 3 },
  { descripcion: 'Anillo de foco sobre lienzo', frente: '--c-focus', fondo: '--c-canvas', minimo: 3 },
]

/** Ejecuta las comprobaciones sobre un conjunto de tokens ya derivado. */
export function verificar(tokens: Tokens) {
  return COMPROBACIONES.map((c) => {
    const leer = (nombre: string): Rgb => {
      const v = tokens[nombre]
      if (!v) throw new Error(`Token ausente: ${nombre}`)
      const [r, g, b] = v.split(/\s+/).map(Number)
      return [r, g, b]
    }
    const ratio = contraste(leer(c.frente), leer(c.fondo))
    return { ...c, ratio, pasa: ratio >= c.minimo }
  })
}
