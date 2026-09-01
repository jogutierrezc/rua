import { Link } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import type { ReactNode } from 'react'
import { botonClases } from './buttonStyles'
import type { TamanoBoton, VarianteBoton } from './buttonStyles'

interface LinkButtonProps extends LinkProps {
  variante?: VarianteBoton
  tamano?: TamanoBoton
  iconoIzq?: ReactNode
  iconoDer?: ReactNode
}

/**
 * Mismos estilos que Button, pero renderiza un ancla de React Router.
 *
 * Existe porque un boton que navega debe SER un enlace: asi funcionan
 * ctrl+clic, "abrir en pestana nueva" y el menu contextual, y el lector de
 * pantalla lo anuncia como enlace y no como accion.
 */
export function LinkButton({
  variante = 'secundario',
  tamano = 'md',
  iconoIzq,
  iconoDer,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      data-motion="transform"
      className={botonClases({ variante, tamano, className })}
      {...props}
    >
      {iconoIzq}
      {children}
      {iconoDer}
    </Link>
  )
}
