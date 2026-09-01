import { useMemo } from 'react'
import {
  CheckCircle2,
  Clock,
  FileText,
  Hourglass,
  Lock,
  MessageSquare,
  Send,
  ShieldCheck,
  Timer,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { fechaRelativa, fmtNumero } from '@/lib/format'
import { ESTADO_ETAPA, ESTADO_SOLICITUD } from '@/lib/estados'
import { Avatar, Badge, Card } from '@/components/ui/primitives'
import type { EstadoEtapa, SolicitudDetalleRow, SolicitudEtapaRow } from '@/types/database'

/** Plazo normativo para resolver una solicitud, en días hábiles. */
const PLAZO_HABILES = 15

// -----------------------------------------------------------------------------
// Fases macro
//
// El expediente tiene tres momentos que el solicitante entiende sin explicación:
// se registró, se está validando, se resolvió. Las etapas individuales viven
// DENTRO de la segunda — mostrar cinco cajas al mismo nivel obligaría a leer
// para saber en qué punto está.
// -----------------------------------------------------------------------------
type Fase = 'registrada' | 'validacion' | 'resolucion'

interface DefinicionFase {
  clave: Fase
  titulo: string
  icono: typeof Send
}

const FASES: DefinicionFase[] = [
  { clave: 'registrada', titulo: 'Registrada', icono: Send },
  { clave: 'validacion', titulo: 'Validación', icono: ShieldCheck },
  { clave: 'resolucion', titulo: 'Resolución', icono: CheckCircle2 },
]

type EstadoFase = 'completa' | 'activa' | 'pendiente' | 'fallida'

function calcularFases(
  solicitud: SolicitudDetalleRow,
  etapas: SolicitudEtapaRow[],
): Record<Fase, EstadoFase> {
  const resuelta = solicitud.estado === 'aprobada' || solicitud.estado === 'denegada'
  const denegada = solicitud.estado === 'denegada'
  const enValidacion = etapas.some((e) => e.estado === 'pendiente')

  return {
    registrada: 'completa',
    validacion: denegada ? 'fallida' : enValidacion ? 'activa' : resuelta ? 'completa' : 'pendiente',
    resolucion: denegada ? 'fallida' : resuelta ? 'completa' : 'pendiente',
  }
}

// -----------------------------------------------------------------------------
// Barra de fases
//
// Los galones encajan unos en otros con `clip-path`, que es sólo pintura: no
// afecta al layout ni al área de foco. La fase activa se realza con sombra y
// un pulso muy tenue — algo que se mira una vez al día puede permitírselo.
// -----------------------------------------------------------------------------
function BarraFases({ fases }: { fases: Record<Fase, EstadoFase> }) {
  const PICO = '1.25rem'

  return (
    <ol
      className="flex overflow-hidden rounded-lg"
      aria-label="Progreso del expediente"
    >
      {FASES.map((fase, i) => {
        const estado = fases[fase.clave]
        const Icono =
          estado === 'fallida'
            ? XCircle
            : estado === 'completa'
              ? CheckCircle2
              : estado === 'activa'
                ? Hourglass
                : Lock

        const primera = i === 0
        const ultima = i === FASES.length - 1

        // El primer galón no tiene muesca a la izquierda; el último, ni pico
        // a la derecha. Sin esto los extremos quedan mordidos.
        const clip = primera
          ? `polygon(0 0, calc(100% - ${PICO}) 0, 100% 50%, calc(100% - ${PICO}) 100%, 0 100%)`
          : ultima
            ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${PICO} 50%)`
            : `polygon(0 0, calc(100% - ${PICO}) 0, 100% 50%, calc(100% - ${PICO}) 100%, 0 100%, ${PICO} 50%)`

        return (
          <li
            key={fase.clave}
            aria-current={estado === 'activa' ? 'step' : undefined}
            style={{
              clipPath: clip,
              // El galón se solapa con el anterior para que el pico encaje en
              // la muesca; el relleno compensa ese solape y recentra el texto.
              // Va en línea y no como clase: el JIT de Tailwind no ve un valor
              // arbitrario construido por interpolación.
              marginLeft: primera ? 0 : `-${PICO}`,
              paddingLeft: primera ? 0 : PICO,
            }}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-1 py-4',
              'transition-colors duration-panel ease-out',
              estado === 'completa' && 'bg-primary text-primary-fg',
              estado === 'activa' && 'bg-accent text-accent-fg',
              estado === 'fallida' && 'bg-danger text-white',
              estado === 'pendiente' && 'bg-surface-muted text-fg-subtle',
            )}
          >
            {/* Brillo tenue sólo en la fase activa. `motion-safe` lo apaga
                para quien pidió movimiento reducido. */}
            {estado === 'activa' && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-white/15 motion-safe:animate-pulse"
              />
            )}

            <span className="relative flex items-center gap-1.5">
              <Icono
                aria-hidden
                className={cn('size-4', estado === 'activa' && 'motion-safe:animate-pulse')}
              />
              <span className="text-overline uppercase">{fase.titulo}</span>
            </span>
            <span className="relative text-body-sm opacity-80">
              {estado === 'completa'
                ? 'Completada'
                : estado === 'activa'
                  ? 'En curso'
                  : estado === 'fallida'
                    ? 'Detenida'
                    : 'Pendiente'}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// -----------------------------------------------------------------------------
// Etapas de la fase de validación
// -----------------------------------------------------------------------------
const ICONO_ETAPA: Record<EstadoEtapa, typeof CheckCircle2> = {
  aprobada: CheckCircle2,
  denegada: XCircle,
  pendiente: Clock,
  bloqueada: Lock,
  omitida: Lock,
}

function TarjetaEtapa({ etapa, indice }: { etapa: SolicitudEtapaRow; indice: number }) {
  const Icono = ICONO_ETAPA[etapa.estado]
  const activa = etapa.estado === 'pendiente'

  return (
    <li
      // Entrada escalonada: 60 ms entre tarjetas. Es decorativo y no bloquea
      // nada, así que se apaga entero con movimiento reducido.
      style={{ animationDelay: `${indice * 60}ms` }}
      className={cn(
        'flex gap-3 rounded-lg border p-3',
        'motion-safe:animate-fade-rise',
        'transition-[border-color,background-color] duration-fast ease-out',
        activa && 'border-accent bg-accent-soft',
        etapa.estado === 'aprobada' && 'border-line bg-surface',
        etapa.estado === 'denegada' && 'border-danger/30 bg-danger-soft',
        (etapa.estado === 'bloqueada' || etapa.estado === 'omitida') &&
          'border-dashed border-line bg-surface-muted/40',
      )}
    >
      <Icono
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          activa && 'text-accent-softFg motion-safe:animate-pulse',
          etapa.estado === 'aprobada' && 'text-success',
          etapa.estado === 'denegada' && 'text-danger',
          (etapa.estado === 'bloqueada' || etapa.estado === 'omitida') && 'text-fg-subtle',
        )}
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-overline uppercase',
            activa ? 'text-accent-softFg' : 'text-fg-muted',
          )}
        >
          {etapa.etapa_nombre}
        </p>

        <p className="mt-0.5 text-body-sm text-fg">
          {etapa.estado === 'pendiente'
            ? 'En espera de firma'
            : etapa.estado === 'bloqueada'
              ? 'A la espera de la etapa anterior'
              : etapa.estado === 'omitida'
                ? 'No llegó a revisarse'
                : `${ESTADO_ETAPA[etapa.estado].etiqueta} · ${fechaRelativa(etapa.decidida_en)}`}
        </p>

        {etapa.revisor_nombre && (
          <p className="mt-1.5 flex items-center gap-1.5 text-body-sm text-fg-muted">
            <Avatar nombre={etapa.revisor_nombre} url={etapa.revisor_avatar} size="sm" />
            <span className="truncate">{etapa.revisor_nombre}</span>
          </p>
        )}
      </div>
    </li>
  )
}

// -----------------------------------------------------------------------------
// Indicador de plazo
// -----------------------------------------------------------------------------
function Plazo({ solicitud }: { solicitud: SolicitudDetalleRow }) {
  const dias = useMemo(() => {
    // Días hábiles desde el registro. La base tiene `fn_dias_habiles`, pero
    // recalcularlo aquí evita una consulta por cada tarjeta.
    const desde = new Date(solicitud.creado_en)
    const hasta = solicitud.resuelto_en ? new Date(solicitud.resuelto_en) : new Date()
    let n = 0
    const cursor = new Date(desde)
    while (cursor < hasta) {
      cursor.setDate(cursor.getDate() + 1)
      const d = cursor.getDay()
      if (d !== 0 && d !== 6) n++
    }
    return n
  }, [solicitud.creado_en, solicitud.resuelto_en])

  const proporcion = Math.min(1, dias / PLAZO_HABILES)
  const excedido = dias > PLAZO_HABILES
  const cerca = !excedido && proporcion > 0.7

  return (
    <Card className="relative overflow-hidden bg-primary p-4 text-primary-fg">
      <Timer
        aria-hidden
        className="pointer-events-none absolute -right-4 -top-4 size-24 opacity-10"
      />

      <p className="text-overline uppercase opacity-75">
        {solicitud.resuelto_en ? 'Resuelta en' : 'Tiempo transcurrido'}
      </p>

      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-metric tabular">{fmtNumero.format(dias)}</span>
        <span className="text-body-sm opacity-75">
          {dias === 1 ? 'día hábil' : 'días hábiles'}
        </span>
      </p>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20"
        role="img"
        aria-label={`${Math.round(proporcion * 100)} por ciento del plazo`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-panel ease-out',
            excedido ? 'bg-danger' : cerca ? 'bg-warning' : 'bg-white/80',
          )}
          style={{ width: `${Math.max(4, proporcion * 100)}%` }}
        />
      </div>

      <p className="mt-2 text-body-sm opacity-75">
        {excedido
          ? `Excede el plazo normativo de ${PLAZO_HABILES} días.`
          : `Plazo normativo: ${PLAZO_HABILES} días hábiles.`}
      </p>
    </Card>
  )
}

// -----------------------------------------------------------------------------
// Línea de tiempo
//
// Se construye desde `solicitud_etapas`, que es donde vive la justificación de
// cada firma, más el evento de registro. Es la respuesta a «¿qué ha pasado y
// quién dijo qué?».
// -----------------------------------------------------------------------------
interface Hito {
  clave: string
  titulo: string
  cuando: string | null
  autor?: { nombre: string; avatar: string | null; rol: string | null }
  comentario?: string | null
  tono: 'inicio' | 'exito' | 'peligro' | 'activo' | 'espera'
}

function construirHitos(
  solicitud: SolicitudDetalleRow,
  etapas: SolicitudEtapaRow[],
): Hito[] {
  const hitos: Hito[] = [
    {
      clave: 'registro',
      titulo: 'Solicitud registrada',
      cuando: solicitud.creado_en,
      autor: {
        nombre: solicitud.solicitante_nombre,
        avatar: solicitud.solicitante_avatar,
        rol: solicitud.solicitante_cargo,
      },
      comentario: solicitud.concepto_justificativo,
      tono: 'inicio',
    },
  ]

  // De más reciente a más antiguo se lee peor un expediente: aquí interesa el
  // orden en que ocurrieron las firmas.
  for (const e of [...etapas].sort((a, b) => a.orden - b.orden)) {
    if (e.estado === 'bloqueada') {
      hitos.push({
        clave: e.id,
        titulo: e.etapa_nombre,
        cuando: null,
        tono: 'espera',
      })
      continue
    }
    if (e.estado === 'omitida') continue

    hitos.push({
      clave: e.id,
      titulo:
        e.estado === 'pendiente'
          ? `${e.etapa_nombre} · en espera de firma`
          : `${e.etapa_nombre} · ${ESTADO_ETAPA[e.estado].etiqueta.toLowerCase()}`,
      cuando: e.decidida_en,
      autor: e.revisor_nombre
        ? { nombre: e.revisor_nombre, avatar: e.revisor_avatar, rol: e.revisor_rol }
        : undefined,
      comentario: e.justificacion,
      tono:
        e.estado === 'aprobada' ? 'exito' : e.estado === 'denegada' ? 'peligro' : 'activo',
    })
  }

  return hitos
}

function LineaDeTiempo({ hitos }: { hitos: Hito[] }) {
  const punto = {
    inicio: 'bg-fg-subtle',
    exito: 'bg-success',
    peligro: 'bg-danger',
    activo: 'bg-accent motion-safe:animate-pulse',
    espera: 'bg-line-strong',
  }

  return (
    <ol className="relative ml-2 space-y-5 border-l border-line pl-6">
      {hitos.map((h, i) => (
        <li
          key={h.clave}
          style={{ animationDelay: `${i * 50}ms` }}
          className={cn('relative motion-safe:animate-fade-rise', h.tono === 'espera' && 'opacity-55')}
        >
          <span
            aria-hidden
            className={cn(
              'absolute -left-[1.9375rem] top-1 size-3 rounded-full ring-4 ring-surface',
              punto[h.tono],
            )}
          />

          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h4 className="text-body font-medium text-fg">{h.titulo}</h4>
            <span className="text-body-sm text-fg-subtle">
              {h.cuando ? fechaRelativa(h.cuando) : 'Sin iniciar'}
            </span>
          </div>

          {h.autor && (
            <p className="mt-1.5 flex items-center gap-1.5 text-body-sm text-fg-muted">
              <Avatar nombre={h.autor.nombre} url={h.autor.avatar} size="sm" />
              <span className="truncate">{h.autor.nombre}</span>
              {h.autor.rol && <span className="truncate text-fg-subtle">· {h.autor.rol}</span>}
            </p>
          )}

          {h.comentario && (
            <blockquote
              className={cn(
                'mt-2 rounded-md border-l-2 px-3 py-2 text-body-sm',
                h.tono === 'peligro'
                  ? 'border-danger bg-danger-soft text-danger-softFg'
                  : 'border-line-strong bg-surface-muted text-fg-muted',
              )}
            >
              {h.comentario}
            </blockquote>
          )}
        </li>
      ))}
    </ol>
  )
}

// -----------------------------------------------------------------------------
export function RuaTracker({
  solicitud,
  etapas,
  compacto = false,
}: {
  solicitud: SolicitudDetalleRow
  etapas: SolicitudEtapaRow[]
  /** Oculta el plazo y la ficha lateral: para usarlo dentro de un diálogo. */
  compacto?: boolean
}) {
  const fases = useMemo(() => calcularFases(solicitud, etapas), [solicitud, etapas])
  const hitos = useMemo(() => construirHitos(solicitud, etapas), [solicitud, etapas])
  const enValidacion = etapas.filter((e) => e.estado !== 'omitida')

  return (
    <div className="flex flex-col gap-4">
      <BarraFases fases={fases} />

      {enValidacion.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-label text-fg">
            <ShieldCheck aria-hidden className="size-4 text-fg-subtle" />
            Cadena de validación
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {enValidacion
              .sort((a, b) => a.orden - b.orden)
              .map((e, i) => (
                <TarjetaEtapa key={e.id} etapa={e} indice={i} />
              ))}
          </ul>
        </section>
      )}

      <div className={cn('grid gap-4', !compacto && 'lg:grid-cols-[18rem_minmax(0,1fr)]')}>
        {!compacto && (
          <div className="flex flex-col gap-4">
            <Plazo solicitud={solicitud} />

            <Card className="p-4">
              <h3 className="flex items-center gap-2 text-label text-fg">
                <FileText aria-hidden className="size-4 text-fg-subtle" />
                Ficha del expediente
              </h3>
              <dl className="mt-3 flex flex-col gap-3 text-body-sm">
                {[
                  ['Folio', solicitud.folio],
                  ['Solicitante', solicitud.solicitante_nombre],
                  ['Unidad', solicitud.solicitante_vicerrectoria ?? '—'],
                  ['Actividad', solicitud.objetivo_nomenclatura ?? '—'],
                  ['Código', solicitud.objetivo_codigo ?? '—'],
                  ['Periodo', solicitud.periodo_codigo ?? 'Sin periodo'],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-overline uppercase text-fg-subtle">{k}</dt>
                    <dd className="mt-0.5 break-words text-fg">{v}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-overline uppercase text-fg-subtle">Estado</dt>
                  <dd className="mt-1">
                    <Badge tono={ESTADO_SOLICITUD[solicitud.estado].tono} punto>
                      {ESTADO_SOLICITUD[solicitud.estado].etiqueta}
                    </Badge>
                  </dd>
                </div>
              </dl>
            </Card>
          </div>
        )}

        <Card className="p-4">
          <h3 className="mb-4 flex items-center gap-2 text-label text-fg">
            <MessageSquare aria-hidden className="size-4 text-fg-subtle" />
            Observaciones y seguimiento
          </h3>
          <LineaDeTiempo hitos={hitos} />
        </Card>
      </div>
    </div>
  )
}
