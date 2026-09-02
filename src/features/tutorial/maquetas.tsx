import type { ReactNode } from 'react'
import {
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Folder,
  Landmark,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Maquetas ilustradas de las pantallas reales.
 *
 * Se dibujan con los mismos tokens que la aplicación en vez de usar capturas.
 * Una captura queda desfasada en cuanto cambia un botón, no sigue la paleta
 * que el usuario haya elegido, y en tema oscuro se ve como un recorte de otra
 * aplicación. Estas maquetas heredan el tema y pueden animarse para mostrar
 * la interacción, que es justo lo que un tutorial necesita explicar.
 */

// -----------------------------------------------------------------------------
// Marco de ventana
// -----------------------------------------------------------------------------
export function Ventana({
  titulo,
  children,
  className,
}: {
  titulo: string
  children: ReactNode
  className?: string
}) {
  return (
    <figure className={cn('overflow-hidden rounded-lg border border-line bg-surface shadow-md', className)}>
      <div className="flex items-center gap-2 border-b border-line bg-sunken px-3 py-2">
        <span aria-hidden className="flex gap-1.5">
          {['bg-danger/40', 'bg-warning/40', 'bg-success/40'].map((c) => (
            <span key={c} className={cn('size-2.5 rounded-full', c)} />
          ))}
        </span>
        <figcaption className="truncate text-body-sm text-fg-subtle">{titulo}</figcaption>
      </div>
      <div className="p-4">{children}</div>
    </figure>
  )
}

/** Etiqueta numerada que señala una parte de la maqueta. */
export function Pista({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-2 text-body-sm text-fg-muted">
      <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-fg">
        {n}
      </span>
      {children}
    </span>
  )
}

// -----------------------------------------------------------------------------
// Piezas falsas, con el aspecto de las reales
// -----------------------------------------------------------------------------
const Etiqueta = ({ children }: { children: ReactNode }) => (
  <span className="mb-1 block text-label text-fg">{children}</span>
)

const Campo = ({
  etiqueta,
  valor,
  marcado,
  mono,
}: {
  etiqueta: string
  valor: string
  marcado?: boolean
  mono?: boolean
}) => (
  <div>
    <Etiqueta>{etiqueta}</Etiqueta>
    <div
      className={cn(
        'flex h-8 items-center rounded border px-2.5 text-body-sm',
        mono && 'font-mono',
        marcado
          ? 'border-primary bg-surface text-fg ring-2 ring-focus/25'
          : 'border-line bg-surface text-fg-muted',
      )}
    >
      {valor}
    </div>
  </div>
)

const Boton = ({
  children,
  primario,
  pulsando,
}: {
  children: ReactNode
  primario?: boolean
  pulsando?: boolean
}) => (
  <span
    data-motion="transform"
    className={cn(
      'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-label',
      primario ? 'bg-primary text-primary-fg' : 'border border-line bg-surface text-fg',
      // El pulso marca dónde hay que hacer clic en este paso.
      pulsando && 'motion-safe:animate-pulse ring-2 ring-focus/40',
    )}
  >
    {children}
  </span>
)

// -----------------------------------------------------------------------------
// Paso 1 · Clasificación
// -----------------------------------------------------------------------------
export function MaquetaClasificacion() {
  return (
    <Ventana titulo="rua.udes.edu.co/solicitudes/nueva">
      <p className="text-title-sm text-fg">Nueva solicitud</p>
      <p className="mt-0.5 text-body-sm text-fg-subtle">
        Propón la creación o modificación de una actividad.
      </p>

      <div className="mt-4 rounded-md border border-line">
        <div className="border-b border-line px-3 py-2 text-label text-fg">Clasificación</div>
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <Campo etiqueta="Qué solicitas" valor="Crear una actividad nueva" marcado />
          <Campo etiqueta="Prioridad" valor="Normal" />
          <div className="sm:col-span-2">
            <Campo etiqueta="Actividad principal" valor="ACT-002 · Investigación Institucional" marcado />
          </div>
        </div>
      </div>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Paso 2 · Propuesta
// -----------------------------------------------------------------------------
export function MaquetaPropuesta() {
  return (
    <Ventana titulo="rua.udes.edu.co/solicitudes/nueva">
      <div className="rounded-md border border-line">
        <div className="border-b border-line px-3 py-2 text-label text-fg">Actividad propuesta</div>
        <div className="grid gap-3 p-3 sm:grid-cols-3">
          <Campo etiqueta="Código sugerido" valor="SUB-014" mono marcado />
          <div className="sm:col-span-2">
            <Campo
              etiqueta="Nomenclatura oficial"
              valor="Seminario de Investigación Aplicada II"
              marcado
            />
          </div>
          <div className="sm:col-span-3">
            <Campo etiqueta="Actividad de apoyo asociada" valor="Preparación de material didáctico" />
          </div>
        </div>
      </div>

      <p className="mt-3 text-body-sm text-fg-subtle">
        El código es opcional: si no lo sabes, lo confirma la administración al crearla.
      </p>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Paso 3 · Justificación
// -----------------------------------------------------------------------------
export function MaquetaJustificacion() {
  return (
    <Ventana titulo="rua.udes.edu.co/solicitudes/nueva">
      <div className="rounded-md border border-line">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-label text-fg">Concepto justificativo</span>
          <span className="rounded bg-danger-soft px-1.5 py-0.5 text-overline uppercase text-danger-softFg">
            Obligatorio
          </span>
        </div>

        <div className="p-3">
          <Etiqueta>Exposición de motivos</Etiqueta>
          <div className="rounded border border-primary bg-surface p-2.5 text-body-sm leading-relaxed text-fg ring-2 ring-focus/25">
            Se requiere aperturar una nueva sección del seminario por la alta demanda
            registrada entre los estudiantes de término. La proyección de matrícula supera
            en un 40 % la capacidad actual…
          </div>

          <div className="mt-2 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full w-[78%] rounded-full bg-warning" />
            </div>
            <span className="shrink-0 tabular text-body-sm text-fg-subtle">117 / 2000</span>
          </div>
          <p className="mt-1.5 text-body-sm text-fg-subtle">
            Mínimo 150 caracteres. La barra avanza mientras escribes.
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Boton>Guardar borrador</Boton>
        <Boton primario pulsando>
          <Send className="size-3.5" />
          Enviar a revisión
        </Boton>
      </div>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Rua Tracker
// -----------------------------------------------------------------------------
export function MaquetaTracker() {
  const fases = [
    { titulo: 'Registrada', estado: 'completa' as const, icono: CheckCircle2 },
    { titulo: 'Validación', estado: 'activa' as const, icono: Clock },
    { titulo: 'Resolución', estado: 'pendiente' as const, icono: Lock },
  ]
  const PICO = '1rem'

  return (
    <Ventana titulo="rua.udes.edu.co/solicitudes/REQ-2026-0001">
      <ol className="flex overflow-hidden rounded-md">
        {fases.map((f, i) => {
          const primera = i === 0
          const ultima = i === fases.length - 1
          const clip = primera
            ? `polygon(0 0, calc(100% - ${PICO}) 0, 100% 50%, calc(100% - ${PICO}) 100%, 0 100%)`
            : ultima
              ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${PICO} 50%)`
              : `polygon(0 0, calc(100% - ${PICO}) 0, 100% 50%, calc(100% - ${PICO}) 100%, 0 100%, ${PICO} 50%)`

          return (
            <li
              key={f.titulo}
              style={{
                clipPath: clip,
                marginLeft: primera ? 0 : `-${PICO}`,
                paddingLeft: primera ? 0 : PICO,
              }}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-3',
                f.estado === 'completa' && 'bg-primary text-primary-fg',
                f.estado === 'activa' && 'bg-accent text-accent-fg',
                f.estado === 'pendiente' && 'bg-surface-muted text-fg-subtle',
              )}
            >
              {f.estado === 'activa' && (
                <span aria-hidden className="absolute inset-0 bg-white/15 motion-safe:animate-pulse" />
              )}
              <span className="relative flex items-center gap-1.5">
                <f.icono className="size-3.5" />
                <span className="text-overline uppercase">{f.titulo}</span>
              </span>
            </li>
          )
        })}
      </ol>

      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          ['Financiera', 'Aprobada · ayer', 'exito'],
          ['Auditoría', 'En espera de firma', 'activa'],
          ['Creación en plataforma', 'Bloqueada', 'espera'],
        ].map(([nombre, estado, tono]) => (
          <li
            key={nombre}
            className={cn(
              'rounded-md border p-2.5',
              tono === 'exito' && 'border-line bg-surface',
              tono === 'activa' && 'border-accent bg-accent-soft',
              tono === 'espera' && 'border-dashed border-line bg-surface-muted/40',
            )}
          >
            <span className="block text-overline uppercase text-fg-muted">{nombre}</span>
            <span
              className={cn(
                'mt-0.5 block text-body-sm',
                tono === 'activa' ? 'text-accent-softFg' : 'text-fg',
              )}
            >
              {estado}
            </span>
          </li>
        ))}
      </ul>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Vista del revisor
// -----------------------------------------------------------------------------
export function MaquetaRevision() {
  return (
    <Ventana titulo="Expediente REQ-2026-0001">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-body-sm text-fg-muted">REQ-2026-0001</span>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-overline uppercase text-primary-softFg">
          Crear
        </span>
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-overline uppercase text-warning-softFg">
          Pendiente
        </span>
      </div>
      <p className="mt-1.5 text-title-sm text-fg">Seminario de Investigación Aplicada II</p>

      <div className="mt-3 rounded-md border border-line p-3">
        <span className="text-overline uppercase text-fg-subtle">
          Actividad y subactividades afectadas
        </span>
        <ul className="mt-2 flex flex-col gap-1">
          <li className="flex items-center gap-2 rounded bg-primary-soft px-2 py-1 text-body-sm text-primary-softFg">
            <Folder className="size-3.5" />
            <span className="font-mono">ACT-002</span>
            <span className="truncate">Investigación Institucional</span>
          </li>
          <li className="ml-5 flex items-center gap-2 px-2 py-1 text-body-sm text-fg-muted">
            <FileText className="size-3.5" />
            <span className="font-mono">SUB-002A</span>
            <span className="truncate">Recolección de Datos de Campo</span>
          </li>
        </ul>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <Etiqueta>Justificación de Auditoría *</Etiqueta>
          <span className="tabular text-body-sm text-success">34 / 20 mín.</span>
        </div>
        <div className="rounded border border-line bg-surface p-2.5 text-body-sm text-fg">
          Cumple la normativa vigente. Se aprueba.
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Boton>Denegar</Boton>
        <Boton primario pulsando>
          <Check className="size-3.5" />
          Aprobar etapa
        </Boton>
      </div>

      <p className="mt-2 text-body-sm text-fg-subtle">
        Sin justificación, los dos botones están desactivados. Se pide también al aprobar.
      </p>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Diagrama del flujo
// -----------------------------------------------------------------------------
const ETAPAS = [
  {
    icono: Building2,
    titulo: 'La oficina solicita',
    detalle: 'Vicerrectorías, Bienestar Institucional, Coordinación Académica',
    tono: 'inicio' as const,
  },
  {
    icono: Landmark,
    titulo: 'Valida lo financiero',
    detalle: 'Vicerrectoría Administrativa y Financiera revisa el impacto presupuestal',
    tono: 'validacion' as const,
  },
  {
    icono: ShieldCheck,
    titulo: 'Valida lo normativo',
    detalle: 'Auditoría verifica el cumplimiento y la trazabilidad del expediente',
    tono: 'validacion' as const,
  },
  {
    icono: Sparkles,
    titulo: 'Se crea la actividad',
    detalle: 'La administración firma y la actividad nace en la estructura maestra',
    tono: 'final' as const,
  },
]

export function DiagramaFlujo() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ETAPAS.map((e, i) => (
        <li key={e.titulo} className="relative">
          {/* Conector: sólo entre tarjetas, y sólo cuando van en fila */}
          {i < ETAPAS.length - 1 && (
            <span
              aria-hidden
              className="absolute -right-3 top-8 hidden h-px w-3 bg-line-strong lg:block"
            />
          )}

          <div
            className={cn(
              'flex h-full flex-col gap-2 rounded-lg border p-4',
              e.tono === 'inicio' && 'border-line bg-surface',
              e.tono === 'validacion' && 'border-line bg-surface',
              e.tono === 'final' && 'border-primary/40 bg-primary-soft',
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-body-sm font-bold',
                  e.tono === 'final'
                    ? 'bg-primary text-primary-fg'
                    : 'bg-primary-soft text-primary-softFg',
                )}
              >
                {i + 1}
              </span>
              <e.icono
                aria-hidden
                className={cn(
                  'size-4',
                  e.tono === 'final' ? 'text-primary-softFg' : 'text-fg-subtle',
                )}
              />
            </span>

            <span
              className={cn(
                'text-body font-medium',
                e.tono === 'final' ? 'text-primary-softFg' : 'text-fg',
              )}
            >
              {e.titulo}
            </span>
            <span
              className={cn(
                'text-body-sm leading-relaxed',
                e.tono === 'final' ? 'text-primary-softFg/85' : 'text-fg-muted',
              )}
            >
              {e.detalle}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

// -----------------------------------------------------------------------------
// Qué ve cada oficina
// -----------------------------------------------------------------------------
export function TablaOficinas() {
  const filas = [
    ['Vicerrectorías y Bienestar Institucional', 'Presentan solicitudes y siguen las suyas', ClipboardList],
    ['Vicerrectoría Administrativa y Financiera', 'Firma la validación presupuestal', Landmark],
    ['Auditoría', 'Firma la validación normativa', ShieldCheck],
    ['Administración de la plataforma', 'Crea la actividad y configura el flujo', Sparkles],
  ] as const

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {filas.map(([oficina, funcion, Icono]) => (
        <li key={oficina} className="flex items-start gap-3 bg-surface p-4">
          <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <div className="min-w-0">
            <p className="text-body font-medium text-fg">{oficina}</p>
            <p className="mt-0.5 text-body-sm text-fg-muted">{funcion}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
