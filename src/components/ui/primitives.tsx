import type { HTMLAttributes, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { cn } from '@/lib/cn'
import { iniciales, rangoPaginacion } from '@/lib/format'
import { Button } from './Button'

// -----------------------------------------------------------------------------
// Tarjeta
// -----------------------------------------------------------------------------
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-line bg-surface shadow-xs',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  titulo,
  descripcion,
  acciones,
  icono,
  className,
}: {
  titulo: ReactNode
  descripcion?: ReactNode
  acciones?: ReactNode
  icono?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icono && <span className="shrink-0 text-fg-subtle">{icono}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-title-sm text-fg">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-body-sm text-fg-subtle">{descripcion}</p>}
        </div>
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Distintivo de estado
//
// Cada tono existe en claro y oscuro con contraste verificado. El color nunca
// es el único portador del significado: siempre va con texto.
// -----------------------------------------------------------------------------
export type TonoBadge = 'neutro' | 'primario' | 'exito' | 'aviso' | 'peligro' | 'acento'

const TONOS: Record<TonoBadge, string> = {
  neutro: 'bg-surface-muted text-fg-muted ring-line',
  primario: 'bg-primary-soft text-primary-softFg ring-primary/20',
  exito: 'bg-success-soft text-success-softFg ring-success/25',
  aviso: 'bg-warning-soft text-warning-softFg ring-warning/25',
  peligro: 'bg-danger-soft text-danger-softFg ring-danger/25',
  acento: 'bg-accent-soft text-accent-softFg ring-accent/25',
}

export function Badge({
  tono = 'neutro',
  punto = false,
  className,
  children,
}: {
  tono?: TonoBadge
  /** Punto de color antes del texto — ayuda a escanear una columna de estados. */
  punto?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5',
        'text-overline uppercase ring-1 ring-inset',
        TONOS[tono],
        className,
      )}
    >
      {punto && <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  )
}

// -----------------------------------------------------------------------------
// Avatar — con respaldo de iniciales cuando no hay foto o falla la carga
// -----------------------------------------------------------------------------
export function Avatar({
  nombre,
  url,
  size = 'md',
  className,
}: {
  nombre: string
  url?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const dims = { sm: 'size-6 text-[10px]', md: 'size-8 text-[11px]', lg: 'size-10 text-body-sm' }[size]

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-primary-soft font-semibold text-primary-softFg ring-1 ring-inset ring-line',
        dims,
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          onError={(e) => {
            // Si la imagen falla, dejamos ver las iniciales de debajo.
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        iniciales(nombre)
      )}
    </span>
  )
}

// -----------------------------------------------------------------------------
// Tabla de datos
// -----------------------------------------------------------------------------
export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  // El desbordamiento horizontal se queda DENTRO de este contenedor:
  // la página nunca debe hacer scroll lateral.
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-[46rem] border-collapse text-left">{children}</table>
    </div>
  )
}

export function Th({
  className,
  alineado = 'izq',
  ...props
}: HTMLAttributes<HTMLTableCellElement> & { alineado?: 'izq' | 'centro' | 'der' }) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-10 bg-sunken px-4 py-2.5',
        'text-overline uppercase text-fg-muted',
        'border-b border-line',
        alineado === 'der' && 'text-right',
        alineado === 'centro' && 'text-center',
        className,
      )}
      {...props}
    />
  )
}

export function Td({
  className,
  alineado = 'izq',
  ...props
}: HTMLAttributes<HTMLTableCellElement> & { alineado?: 'izq' | 'centro' | 'der' }) {
  return (
    <td
      className={cn(
        'px-4 py-2 align-middle text-data text-fg',
        alineado === 'der' && 'text-right',
        alineado === 'centro' && 'text-center',
        className,
      )}
      {...props}
    />
  )
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'group border-b border-line last:border-0',
        'transition-colors duration-fast ease-out',
        '[@media(hover:hover)]:hover:bg-surface-muted',
        className,
      )}
      {...props}
    />
  )
}

// -----------------------------------------------------------------------------
// Paginación
// -----------------------------------------------------------------------------
export function Pagination({
  pagina,
  porPagina,
  total,
  onPagina,
  onPorPagina,
}: {
  pagina: number
  porPagina: number
  total: number
  onPagina: (p: number) => void
  onPorPagina?: (n: number) => void
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  const { texto } = rangoPaginacion(pagina, porPagina, total)

  // Ventana deslizante de 5: con 40 páginas no queremos 40 botones.
  const inicio = Math.max(0, Math.min(pagina - 2, paginas - 5))
  const visibles = Array.from({ length: Math.min(5, paginas) }, (_, i) => inicio + i)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
      <div className="flex items-center gap-3">
        <p className="text-body-sm text-fg-subtle">
          Mostrando <span className="tabular text-fg">{texto}</span>
        </p>
        {onPorPagina && (
          <label className="flex items-center gap-1.5 text-body-sm text-fg-subtle">
            <span className="sr-only">Registros por página</span>
            <select
              value={porPagina}
              onChange={(e) => onPorPagina(Number(e.target.value))}
              className="h-7 rounded border border-line bg-surface px-1.5 text-body-sm text-fg"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / pág.
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <nav aria-label="Paginación" className="flex items-center gap-1">
        <Button
          tamano="sm"
          variante="fantasma"
          soloIcono
          aria-label="Página anterior"
          disabled={pagina === 0}
          onClick={() => onPagina(pagina - 1)}
          iconoIzq={<ChevronLeft className="size-4" />}
        />
        {visibles.map((p) => (
          <Button
            key={p}
            tamano="sm"
            variante={p === pagina ? 'primario' : 'fantasma'}
            aria-current={p === pagina ? 'page' : undefined}
            onClick={() => onPagina(p)}
            className="w-8 px-0 tabular"
          >
            {p + 1}
          </Button>
        ))}
        <Button
          tamano="sm"
          variante="fantasma"
          soloIcono
          aria-label="Página siguiente"
          disabled={pagina >= paginas - 1}
          onClick={() => onPagina(pagina + 1)}
          iconoIzq={<ChevronRight className="size-4" />}
        />
      </nav>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Estado vacío — dice qué pasó y ofrece la salida, nunca sólo "sin datos"
// -----------------------------------------------------------------------------
export function EmptyState({
  titulo,
  descripcion,
  accion,
  icono,
}: {
  titulo: string
  descripcion?: string
  accion?: ReactNode
  icono?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-surface-muted text-fg-subtle">
        {icono ?? <Inbox className="size-5" />}
      </span>
      <div>
        <p className="text-title-sm text-fg">{titulo}</p>
        {descripcion && <p className="mt-1 max-w-sm text-body-sm text-fg-subtle">{descripcion}</p>}
      </div>
      {accion}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Esqueleto de carga
//
// Reserva exactamente el alto de la fila real para que no haya salto de layout
// al llegar los datos.
// -----------------------------------------------------------------------------
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded bg-surface-muted', className)} {...props} />
}

export function TableSkeleton({ filas = 6, columnas = 5 }: { filas?: number; columnas?: number }) {
  return (
    <div className="divide-y divide-line" aria-hidden>
      {Array.from({ length: filas }).map((_, f) => (
        <div key={f} className="flex h-[2.375rem] items-center gap-4 px-4">
          {Array.from({ length: columnas }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-3"
              // Anchos irregulares: una fila de barras idénticas no parece contenido.
              style={{ width: c === 0 ? '28%' : `${10 + ((f + c) % 4) * 4}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
