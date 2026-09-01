import { forwardRef, useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

// -----------------------------------------------------------------------------
// Envoltura común: etiqueta, pista y error.
//
// La validación se muestra JUNTO al campo y en cuanto se conoce, no al enviar
// el formulario: descubrir seis errores de golpe tras pulsar "Guardar" es la
// peor forma de enterarse.
// -----------------------------------------------------------------------------

interface CampoProps {
  etiqueta: string
  pista?: ReactNode
  error?: string | null
  requerido?: boolean
  className?: string
  children: (props: { id: string; describedBy: string | undefined; invalido: boolean }) => ReactNode
}

export function Campo({ etiqueta, pista, error, requerido, className, children }: CampoProps) {
  const id = useId()
  const pistaId = `${id}-pista`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : pista ? pistaId : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label text-fg">
        {etiqueta}
        {requerido && (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        )}
        {requerido && <span className="sr-only"> (obligatorio)</span>}
      </label>

      {children({ id, describedBy, invalido: Boolean(error) })}

      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-body-sm text-danger">
          <AlertCircle aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : pista ? (
        <p id={pistaId} className="text-body-sm text-fg-subtle">
          {pista}
        </p>
      ) : null}
    </div>
  )
}

const baseControl = cn(
  'w-full bg-surface text-fg placeholder:text-fg-subtle',
  'border border-line rounded',
  'transition-[border-color,box-shadow] duration-fast ease-out',
  'hover:border-line-strong',
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/25 focus:ring-offset-0',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20',
)

// -----------------------------------------------------------------------------
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(baseControl, 'h-9 px-3 text-body', className)} {...props} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 5, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(baseControl, 'resize-y px-3 py-2 text-body leading-relaxed', className)}
        {...props}
      />
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(baseControl, 'h-9 cursor-pointer appearance-none pl-3 pr-9 text-body', className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        />
      </div>
    )
  },
)

// -----------------------------------------------------------------------------
// Casilla de verificación
// -----------------------------------------------------------------------------
interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  etiqueta: ReactNode
  descripcion?: string
}

export function Checkbox({ etiqueta, descripcion, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 rounded px-1 py-1 -mx-1',
        'transition-colors duration-fast ease-out',
        '[@media(hover:hover)]:hover:bg-surface-muted',
        props.disabled && 'cursor-not-allowed opacity-55',
        className,
      )}
    >
      <input
        type="checkbox"
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm border-line-strong bg-surface',
          'text-primary accent-primary',
          'transition-[background-color,border-color] duration-fast ease-out',
          'focus-visible:ring-2 focus-visible:ring-focus/60 focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed',
        )}
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-body text-fg">{etiqueta}</span>
        {descripcion && <span className="block text-body-sm text-fg-subtle">{descripcion}</span>}
      </span>
    </label>
  )
}

// -----------------------------------------------------------------------------
// Interruptor
//
// Sólo se anima `translate` del pulgar y el color de la pista: ambas son
// propiedades de compositor, así que el gesto no toca layout ni paint.
// -----------------------------------------------------------------------------
interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  etiqueta: string
  descripcion?: string
}

export function Switch({ etiqueta, descripcion, className, ...props }: SwitchProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 py-2',
        props.disabled && 'cursor-not-allowed opacity-55',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-body text-fg">{etiqueta}</span>
        {descripcion && <span className="block text-body-sm text-fg-subtle">{descripcion}</span>}
      </span>

      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" {...props} />
        <span
          aria-hidden
          className={cn(
            'block h-5 w-9 rounded-full bg-line-strong',
            'transition-colors duration-fast ease-out',
            'peer-checked:bg-primary',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-focus/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface',
          )}
        />
        <span
          aria-hidden
          data-motion="transform"
          className={cn(
            'pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm',
            'transition-transform duration-fast ease-out',
            'peer-checked:translate-x-4',
            'peer-active:scale-95',
          )}
        />
      </span>
    </label>
  )
}
