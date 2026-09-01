import { useMemo, useState } from 'react'
import { Check, Contrast, Monitor, Moon, ShieldCheck, Sun, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge, Card, CardHeader, TableShell, Td, Th, Tr } from '@/components/ui/primitives'
import { useTema, type PreferenciaModo } from './TemaProvider'
import { PALETAS, derivarTokens, verificar, type ModoTema, type Paleta } from '@/styles/paletas'

const MODOS: { valor: PreferenciaModo; etiqueta: string; icono: typeof Sun; pista: string }[] = [
  { valor: 'claro', etiqueta: 'Claro', icono: Sun, pista: 'Siempre en claro' },
  { valor: 'oscuro', etiqueta: 'Oscuro', icono: Moon, pista: 'Siempre en oscuro' },
  { valor: 'sistema', etiqueta: 'Sistema', icono: Monitor, pista: 'Sigue a tu equipo' },
]

export function AparienciaPage() {
  const { paleta, modo, modoEfectivo, setPaleta, setModo } = useTema()
  const [modoPrevia, setModoPrevia] = useState<ModoTema>(modoEfectivo)

  return (
    <>
      <PageHeader
        titulo="Apariencia"
        descripcion="Elige la paleta institucional y cómo se comporta el tema claro y oscuro. La preferencia viaja con tu cuenta."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-4">
          {/* Paletas ------------------------------------------------- */}
          <Card>
            <CardHeader
              titulo="Paleta"
              descripcion="Cada paleta genera el sistema completo a partir de cinco colores."
            />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {PALETAS.map((p) => (
                <TarjetaPaleta
                  key={p.id}
                  paleta={p}
                  activa={p.id === paleta.id}
                  modo={modoPrevia}
                  onElegir={() => setPaleta(p.id)}
                />
              ))}
            </div>
          </Card>

          {/* Modo ------------------------------------------------------ */}
          <Card>
            <CardHeader
              titulo="Tema claro y oscuro"
              descripcion="Los colores de botones y distintivos se recalculan para cada modo."
            />
            <div
              role="radiogroup"
              aria-label="Modo de color"
              className="grid gap-3 p-4 sm:grid-cols-3"
            >
              {MODOS.map(({ valor, etiqueta, icono: Icono, pista }) => {
                const activo = modo === valor
                return (
                  <button
                    key={valor}
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setModo(valor)}
                    data-motion="transform"
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border p-3 text-left',
                      'transition-[border-color,background-color,transform] duration-press ease-out',
                      'active:scale-[0.98]',
                      activo
                        ? 'border-primary bg-primary-soft'
                        : 'border-line hover:border-line-strong hover:bg-surface-muted',
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      <Icono
                        aria-hidden
                        className={cn('size-4', activo ? 'text-primary-softFg' : 'text-fg-subtle')}
                      />
                      <span
                        className={cn(
                          'text-label',
                          activo ? 'text-primary-softFg' : 'text-fg',
                        )}
                      >
                        {etiqueta}
                      </span>
                      {activo && (
                        <Check aria-hidden className="ml-auto size-4 text-primary-softFg" />
                      )}
                    </span>
                    <span
                      className={cn(
                        'text-body-sm',
                        activo ? 'text-primary-softFg/80' : 'text-fg-subtle',
                      )}
                    >
                      {pista}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Verificación de contraste --------------------------------- */}
          <Auditoria paleta={paleta} modo={modoPrevia} />
        </div>

        {/* Previsualización ------------------------------------------ */}
        <Card className="lg:sticky lg:top-20">
          <CardHeader
            titulo="Vista previa"
            acciones={
              <div className="flex items-center gap-0.5 rounded-md bg-surface-muted p-0.5">
                {(['claro', 'oscuro'] as ModoTema[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setModoPrevia(m)}
                    aria-pressed={modoPrevia === m}
                    className={cn(
                      'rounded px-2 py-1 text-label transition-colors duration-fast ease-out',
                      modoPrevia === m ? 'bg-surface text-fg shadow-xs' : 'text-fg-subtle hover:text-fg',
                    )}
                  >
                    {m === 'claro' ? 'Claro' : 'Oscuro'}
                  </button>
                ))}
              </div>
            }
          />
          <div className="p-4">
            <Previsualizacion paleta={paleta} modo={modoPrevia} />
            <p className="mt-3 text-body-sm text-fg-subtle">
              La vista previa aplica los tokens del modo elegido de forma aislada, para que puedas
              comparar sin cambiar el tema de toda la aplicación.
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------
function TarjetaPaleta({
  paleta,
  activa,
  modo,
  onElegir,
}: {
  paleta: Paleta
  activa: boolean
  modo: ModoTema
  onElegir: () => void
}) {
  const tokens = useMemo(() => derivarTokens(paleta, modo), [paleta, modo])

  return (
    <button
      onClick={onElegir}
      aria-pressed={activa}
      data-motion="transform"
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3 text-left',
        'transition-[border-color,box-shadow,transform] duration-press ease-out',
        'active:scale-[0.99]',
        activa
          ? 'border-primary shadow-sm ring-1 ring-primary'
          : 'border-line hover:border-line-strong',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-title-sm text-fg">{paleta.nombre}</span>
          <span className="block text-body-sm text-fg-subtle">{paleta.descripcion}</span>
        </span>
        {activa && (
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-fg">
            <Check aria-hidden className="size-3" />
          </span>
        )}
      </span>

      {/* Muestras originales de la paleta */}
      <span className="flex overflow-hidden rounded" aria-hidden>
        {paleta.muestras.map((m) => (
          <span
            key={m.hex}
            title={`${m.nombre} · ${m.hex}`}
            className="h-6 flex-1"
            style={{ backgroundColor: m.hex }}
          />
        ))}
      </span>

      {/* Y cómo quedan los botones que se derivan de ellas */}
      <span
        className="flex items-center gap-1.5 rounded-md p-2"
        style={{ backgroundColor: `rgb(${tokens['--c-canvas']})` }}
      >
        <span
          className="rounded px-2 py-1 text-[11px] font-semibold"
          style={{
            backgroundColor: `rgb(${tokens['--c-primary']})`,
            color: `rgb(${tokens['--c-primary-fg']})`,
          }}
        >
          Primario
        </span>
        <span
          className="rounded px-2 py-1 text-[11px] font-semibold"
          style={{
            backgroundColor: `rgb(${tokens['--c-primary-soft']})`,
            color: `rgb(${tokens['--c-primary-soft-fg']})`,
          }}
        >
          Sutil
        </span>
        <span
          className="rounded px-2 py-1 text-[11px] font-semibold"
          style={{
            backgroundColor: `rgb(${tokens['--c-danger-soft']})`,
            color: `rgb(${tokens['--c-danger-soft-fg']})`,
          }}
        >
          Peligro
        </span>
      </span>
    </button>
  )
}

// -----------------------------------------------------------------------------
/**
 * Previsualización aislada.
 *
 * Los tokens se aplican en línea a este contenedor, así que sus descendientes
 * los heredan sin tocar el resto de la página. Es la forma de comparar claro y
 * oscuro lado a lado sin marear al usuario cambiándole el tema entero.
 */
function Previsualizacion({ paleta, modo }: { paleta: Paleta; modo: ModoTema }) {
  const tokens = useMemo(() => derivarTokens(paleta, modo), [paleta, modo])
  const estilo = Object.fromEntries(
    Object.entries(tokens).map(([k, v]) => [k, v]),
  ) as React.CSSProperties

  return (
    <div
      style={estilo}
      className="overflow-hidden rounded-lg border border-line bg-canvas p-4"
    >
      <div className="rounded-md border border-line bg-surface p-3">
        <p className="text-title-sm text-fg">Solicitudes recientes</p>
        <p className="mt-0.5 text-body-sm text-fg-muted">
          Cuatro pendientes de revisión en este periodo.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-overline uppercase text-success-softFg ring-1 ring-inset ring-success/25">
            Aprobada
          </span>
          <span className="inline-flex items-center rounded-full bg-warning-soft px-2 py-0.5 text-overline uppercase text-warning-softFg ring-1 ring-inset ring-warning/25">
            Pendiente
          </span>
          <span className="inline-flex items-center rounded-full bg-danger-soft px-2 py-0.5 text-overline uppercase text-danger-softFg ring-1 ring-inset ring-danger/25">
            Urgente
          </span>
          <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-overline uppercase text-accent-softFg ring-1 ring-inset ring-accent/25">
            Editar
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex h-8 items-center rounded px-2.5 text-label text-primary-fg" style={{ backgroundColor: `rgb(${tokens['--c-primary']})` }}>
            Aprobar
          </span>
          <span className="inline-flex h-8 items-center rounded border border-line bg-surface px-2.5 text-label text-fg">
            Cancelar
          </span>
          <span className="inline-flex h-8 items-center rounded bg-primary-soft px-2.5 text-label text-primary-softFg">
            Filtrar
          </span>
          <span className="inline-flex h-8 items-center rounded bg-danger-soft px-2.5 text-label text-danger-softFg">
            Denegar
          </span>
        </div>

        <div className="mt-3 rounded border border-line-strong bg-surface px-2.5 py-1.5 text-body text-fg-subtle">
          Campo de formulario
        </div>
      </div>

      <div className="mt-3 rounded-md bg-sunken px-3 py-2">
        <p className="text-overline uppercase text-fg-muted">Cabecera de tabla</p>
        <p className="mt-1 text-body-sm text-fg-subtle">Texto secundario sobre superficie hundida</p>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
/**
 * Auditoría de contraste en vivo.
 *
 * Es la misma lista de comprobaciones que ejecuta `npm run check:contraste`.
 * Está aquí para que quien elija una paleta pueda ver que se lee, en vez de
 * confiar en que alguien lo comprobó alguna vez.
 */
function Auditoria({ paleta, modo }: { paleta: Paleta; modo: ModoTema }) {
  const [abierto, setAbierto] = useState(false)
  const resultados = useMemo(() => verificar(derivarTokens(paleta, modo)), [paleta, modo])
  const fallos = resultados.filter((r) => !r.pasa)

  return (
    <Card>
      <CardHeader
        titulo="Contraste"
        descripcion={`${resultados.length} pares verificados contra WCAG AA en modo ${modo}.`}
        icono={<Contrast className="size-4" />}
        acciones={
          <div className="flex items-center gap-2">
            {fallos.length === 0 ? (
              <Badge tono="exito" punto>
                Todo pasa
              </Badge>
            ) : (
              <Badge tono="peligro" punto>
                {fallos.length} fallan
              </Badge>
            )}
            <Button tamano="sm" variante="fantasma" onClick={() => setAbierto((v) => !v)}>
              {abierto ? 'Ocultar detalle' : 'Ver detalle'}
            </Button>
          </div>
        }
      />

      {!abierto ? (
        <p className="flex items-start gap-2 px-4 py-3 text-body-sm text-fg-muted">
          {fallos.length === 0 ? (
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          )}
          {fallos.length === 0
            ? 'Cada texto sobre color alcanza al menos 4.5:1, y los bordes de campo 3:1. Los tonos de los botones se calculan hasta cumplirlo, no se eligen a ojo.'
            : 'Hay combinaciones por debajo del mínimo legible. Revisa el detalle.'}
        </p>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Par comprobado</Th>
              <Th className="w-24" alineado="der">
                Ratio
              </Th>
              <Th className="w-24" alineado="der">
                Mínimo
              </Th>
              <Th className="w-20" alineado="der">
                Estado
              </Th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((r) => (
              <Tr key={r.descripcion}>
                <Td>{r.descripcion}</Td>
                <Td alineado="der" className="tabular">
                  {r.ratio.toFixed(2)}:1
                </Td>
                <Td alineado="der" className="tabular text-fg-subtle">
                  {r.minimo}:1
                </Td>
                <Td alineado="der">
                  <Badge tono={r.pasa ? 'exito' : 'peligro'}>{r.pasa ? 'Pasa' : 'Falla'}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  )
}
