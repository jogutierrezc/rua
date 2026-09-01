import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { botonClases } from './buttonStyles'
import type { TamanoBoton, VarianteBoton } from './buttonStyles'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton
  tamano?: TamanoBoton
  cargando?: boolean
  iconoIzq?: ReactNode
  iconoDer?: ReactNode
  /** Boton cuadrado que solo contiene un icono. Exige `aria-label`. */
  soloIcono?: boolean
}

/**
 * El feedback vive en el pointer-down, no en el click: la escala al pulsar es
 * lo que hace que el boton se sienta "escuchado". 120 ms con una curva ease-out
 * fuerte, para que el movimiento arranque de inmediato, que es el instante que
 * el usuario esta mirando.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variante = 'secundario',
    tamano = 'md',
    cargando = false,
    iconoIzq,
    iconoDer,
    soloIcono = false,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || cargando}
      data-motion="transform"
      aria-busy={cargando || undefined}
      className={botonClases({
        variante,
        tamano,
        className: cn(
          soloIcono && (tamano === 'sm' ? 'w-8 px-0' : tamano === 'lg' ? 'w-11 px-0' : 'w-9 px-0'),
          className,
        ),
      })}
      {...props}
    >
      {cargando ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" /> : iconoIzq}
      {!soloIcono && children}
      {!cargando && iconoDer}
    </button>
  )
})
