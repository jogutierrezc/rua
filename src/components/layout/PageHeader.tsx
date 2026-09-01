import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Cabecera de página. Responde las preguntas de orientación: dónde estoy,
 * qué hay aquí, y cómo salgo.
 */
export function PageHeader({
  titulo,
  descripcion,
  volver,
  acciones,
  className,
}: {
  titulo: string
  descripcion?: string
  volver?: { a: string; etiqueta: string }
  acciones?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6', className)}>
      {volver && (
        <Link
          to={volver.a}
          className={cn(
            'mb-3 inline-flex items-center gap-1 text-body-sm text-fg-muted',
            'transition-colors duration-fast ease-out hover:text-primary',
          )}
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          {volver.etiqueta}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-balance text-title-lg text-fg">{titulo}</h1>
          {descripcion && (
            <p className="mt-1 max-w-2xl text-pretty text-body text-fg-muted">{descripcion}</p>
          )}
        </div>
        {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
      </div>
    </div>
  )
}
