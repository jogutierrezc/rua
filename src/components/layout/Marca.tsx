import { cn } from '@/lib/cn'

/**
 * Identidad de la aplicación. Un solo componente para que el logotipo,
 * el nombre y el descriptor no se desincronicen entre pantallas.
 */
export function Marca({
  tono = 'oscuro',
  compacto = false,
  className,
}: {
  tono?: 'oscuro' | 'claro'
  compacto?: boolean
  className?: string
}) {
  const claro = tono === 'claro'

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-md text-[1.05rem] font-bold leading-none',
          claro ? 'bg-white/12 text-white ring-1 ring-inset ring-white/20' : 'bg-primary text-primary-fg',
        )}
      >
        R
      </span>
      {!compacto && (
        <span className="min-w-0">
          <span
            className={cn(
              'block truncate text-title-sm leading-tight',
              claro ? 'text-white' : 'text-fg',
            )}
          >
            Rua
          </span>
          <span
            className={cn(
              'block truncate text-body-sm leading-tight',
              claro ? 'text-white/55' : 'text-fg-subtle',
            )}
          >
            Gestión Académica
          </span>
        </span>
      )}
    </div>
  )
}
