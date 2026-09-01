import { cn } from '@/lib/cn'

export type VarianteBoton = 'primario' | 'secundario' | 'sutil' | 'fantasma' | 'peligro'
export type TamanoBoton = 'sm' | 'md' | 'lg'

export const VARIANTES_BOTON: Record<VarianteBoton, string> = {
  primario: 'bg-primary text-primary-fg shadow-xs hover:bg-primary-hover active:bg-primary-active',
  secundario:
    'bg-surface text-fg border border-line shadow-xs hover:bg-surface-muted hover:border-line-strong',
  sutil: 'bg-primary-soft text-primary-softFg hover:bg-primary-soft/70',
  fantasma: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  peligro: 'bg-danger-soft text-danger-softFg hover:bg-danger hover:text-white',
}

export const TAMANOS_BOTON: Record<TamanoBoton, string> = {
  sm: 'h-8 px-2.5 gap-1.5 text-label rounded',
  md: 'h-9 px-3.5 gap-2 text-label rounded-md',
  lg: 'h-11 px-5 gap-2 text-body font-medium rounded-md',
}

/**
 * Clases compartidas entre <Button> y <LinkButton>.
 *
 * Viven aquí y no en Button.tsx porque Fast Refresh deja de funcionar en un
 * archivo que exporta componentes Y otras cosas.
 *
 * `transition-[transform,background-color,border-color,color]` en vez de
 * `transition-all`: nombrar las propiedades evita animar por accidente el
 * ancho o la sombra cuando cambia el contenido.
 */
export function botonClases({
  variante = 'secundario',
  tamano = 'md',
  className,
}: {
  variante?: VarianteBoton
  tamano?: TamanoBoton
  className?: string
} = {}) {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap',
    'transition-[transform,background-color,border-color,color]',
    'duration-press ease-out active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTES_BOTON[variante],
    TAMANOS_BOTON[tamano],
    className,
  )
}
