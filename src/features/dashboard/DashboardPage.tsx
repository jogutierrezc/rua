import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  Inbox,
  Plus,
  TriangleAlert,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fechaRelativa, fmtNumero } from '@/lib/format'
import { ESTADO_SOLICITUD, PRIORIDAD, TIPO_SOLICITUD } from '@/lib/estados'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives'
import { Si } from '@/features/auth/guards'
import type { MetricasSolicitudes, PeriodoRow, SolicitudDetalleRow } from '@/types/database'

// -----------------------------------------------------------------------------
// Consultas
// -----------------------------------------------------------------------------
function usePeriodoAbierto() {
  return useQuery({
    queryKey: ['periodo', 'abierto'],
    queryFn: async (): Promise<PeriodoRow | null> => {
      const { data, error } = await supabase
        .from('periodos')
        .select('*')
        .eq('estado', 'abierto')
        .maybeSingle()
      if (error) throw error
      return data
    },
    staleTime: 5 * 60_000, // el periodo abierto cambia una vez por semestre
  })
}

function useMetricas(periodoId: string | null) {
  return useQuery({
    queryKey: ['metricas', periodoId],
    queryFn: async (): Promise<MetricasSolicitudes> => {
      const { data, error } = await supabase.rpc('fn_metricas_solicitudes', {
        p_periodo_id: periodoId,
      })
      if (error) throw error
      return (
        data?.[0] ?? {
          total: 0,
          aprobadas: 0,
          pendientes: 0,
          denegadas: 0,
          urgentes: 0,
          tasa_aprobacion: null,
        }
      )
    },
  })
}

function useSolicitudesRecientes() {
  return useQuery({
    queryKey: ['solicitudes', 'recientes'],
    queryFn: async (): Promise<SolicitudDetalleRow[]> => {
      const { data, error } = await supabase
        .from('v_solicitudes_detalle')
        .select('*')
        .neq('estado', 'borrador')
        .order('creado_en', { ascending: false })
        .limit(6)
      if (error) throw error
      return data ?? []
    },
  })
}

// -----------------------------------------------------------------------------
// Tarjeta de métrica
//
// El número es el protagonista: tamaño y peso lo dicen antes de leer nada.
// El contexto va debajo, no compitiendo.
// -----------------------------------------------------------------------------
function Metrica({
  etiqueta,
  valor,
  pie,
  proporcion,
  tono = 'neutro',
  icono,
  cargando,
}: {
  etiqueta: string
  valor: number | string
  pie?: string
  /** 0–1. Dibuja una barra bajo la cifra en vez de un gráfico decorativo. */
  proporcion?: number | null
  tono?: 'neutro' | 'exito' | 'aviso'
  icono: React.ReactNode
  cargando?: boolean
}) {
  const acento = {
    neutro: 'text-primary',
    exito: 'text-success',
    aviso: 'text-warning',
  }[tono]

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-overline uppercase text-fg-subtle">{etiqueta}</p>
        <span className={cn('shrink-0 opacity-70', acento)}>{icono}</span>
      </div>

      {cargando ? (
        <Skeleton className="mt-2 h-9 w-24" />
      ) : (
        <p className="mt-1.5 text-metric tabular text-fg">
          {typeof valor === 'number' ? fmtNumero.format(valor) : valor}
        </p>
      )}

      {typeof proporcion === 'number' && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="img"
          aria-label={`${Math.round(proporcion * 100)} por ciento`}
        >
          <div
            className={cn('h-full rounded-full', tono === 'exito' ? 'bg-success' : 'bg-primary')}
            style={{ width: `${Math.min(100, Math.max(0, proporcion * 100))}%` }}
          />
        </div>
      )}

      {pie && <p className="mt-2 text-body-sm text-fg-subtle">{pie}</p>}
    </Card>
  )
}

// -----------------------------------------------------------------------------
export function DashboardPage() {
  const { data: periodo } = usePeriodoAbierto()
  const { data: m, isPending: cargandoMetricas } = useMetricas(periodo?.id ?? null)
  const { data: recientes, isPending: cargandoTabla } = useSolicitudesRecientes()

  const tasa = m?.tasa_aprobacion != null ? m.tasa_aprobacion / 100 : null

  return (
    <>
      <PageHeader
        titulo="Inteligencia de Negocios"
        descripcion={
          periodo
            ? `Resumen del periodo ${periodo.codigo}, abierto hasta el ${new Date(periodo.fecha_fin).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.`
            : 'Resumen general de solicitudes y estructura académica.'
        }
        acciones={
          <>
            <Si puede="bi.exportar">
              <Button iconoIzq={<Download className="size-4" />}>Exportar reporte</Button>
            </Si>
            <Si puede="solicitudes.crear">
              <LinkButton
                to="/solicitudes/nueva"
                variante="primario"
                iconoIzq={<Plus className="size-4" />}
              >
                Nueva solicitud
              </LinkButton>
            </Si>
          </>
        }
      />

      {/* Métricas ------------------------------------------------------- */}
      <section aria-label="Indicadores del periodo" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          etiqueta="Total de solicitudes"
          valor={m?.total ?? 0}
          pie="En el periodo actual"
          icono={<Inbox className="size-5" />}
          cargando={cargandoMetricas}
        />
        <Metrica
          etiqueta="Aprobadas"
          valor={m?.aprobadas ?? 0}
          proporcion={tasa}
          pie={tasa != null ? `${m?.tasa_aprobacion}% de tasa de aprobación` : 'Sin resoluciones aún'}
          tono="exito"
          icono={<CheckCircle2 className="size-5" />}
          cargando={cargandoMetricas}
        />
        <Metrica
          etiqueta="Pendientes"
          valor={m?.pendientes ?? 0}
          pie={
            m?.urgentes
              ? `${m.urgentes} marcadas como urgentes`
              : 'Ninguna marcada como urgente'
          }
          tono="aviso"
          icono={<TriangleAlert className="size-5" />}
          cargando={cargandoMetricas}
        />
        <Metrica
          etiqueta="Denegadas"
          valor={m?.denegadas ?? 0}
          pie="Requieren reformulación"
          icono={<ArrowUpRight className="size-5" />}
          cargando={cargandoMetricas}
        />
      </section>

      {/* Solicitudes recientes ----------------------------------------- */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader
          titulo="Solicitudes recientes"
          descripcion="Las últimas peticiones que entraron al flujo de aprobación."
          acciones={
            <Link
              to="/solicitudes"
              className="text-label text-primary underline-offset-4 hover:underline"
            >
              Ver la bandeja completa
            </Link>
          }
        />

        {cargandoTabla ? (
          <TableSkeleton filas={6} columnas={5} />
        ) : !recientes?.length ? (
          <EmptyState
            titulo="Todavía no hay solicitudes"
            descripcion="Cuando alguien proponga un cambio en la estructura académica, aparecerá aquí."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th className="w-32">Folio</Th>
                <Th>Solicitante</Th>
                <Th className="w-28">Tipo</Th>
                <Th>Actividad</Th>
                <Th className="w-32">Estado</Th>
                <Th alineado="der" className="w-28">
                  Recibida
                </Th>
              </tr>
            </thead>
            <tbody>
              {recientes.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium text-fg-muted">{s.folio}</Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        nombre={s.solicitante_nombre}
                        url={s.solicitante_avatar}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg">
                          {s.solicitante_nombre}
                        </span>
                        {s.solicitante_cargo && (
                          <span className="block truncate text-body-sm text-fg-subtle">
                            {s.solicitante_cargo}
                          </span>
                        )}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tono={TIPO_SOLICITUD[s.tipo].tono}>{TIPO_SOLICITUD[s.tipo].etiqueta}</Badge>
                  </Td>
                  <Td>
                    <span className="block truncate text-fg">
                      {s.objetivo_nomenclatura ?? '—'}
                    </span>
                    {s.objetivo_codigo && (
                      <span className="block text-body-sm text-fg-subtle">{s.objetivo_codigo}</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Badge tono={ESTADO_SOLICITUD[s.estado].tono} punto>
                        {ESTADO_SOLICITUD[s.estado].etiqueta}
                      </Badge>
                      {s.prioridad === 'urgente' && (
                        <Badge tono={PRIORIDAD.urgente.tono}>Urgente</Badge>
                      )}
                    </div>
                  </Td>
                  <Td alineado="der" className="whitespace-nowrap text-fg-subtle">
                    {fechaRelativa(s.creado_en)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>
    </>
  )
}
