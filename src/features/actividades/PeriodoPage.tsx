import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Folder, LifeBuoy, Search, Settings2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ESTADO_EJECUCION, TIPO_ACTIVIDAD } from '@/lib/estados'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import {
  Badge,
  Card,
  EmptyState,
  Pagination,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives'
import { Si } from '@/features/auth/guards'
import { LinkButton } from '@/components/ui/LinkButton'
import type {
  ActividadArbolRow,
  ActividadPeriodoRow,
  EstadoEjecucion,
  PeriodoRow,
} from '@/types/database'

const POR_PAGINA = 25

const ICONO_TIPO = { principal: Folder, directa: FileText, apoyo: LifeBuoy } as const

type Fila = ActividadPeriodoRow & { actividad: ActividadArbolRow | null }

export function PeriodoPage() {
  const [periodoId, setPeriodoId] = useState<string>('')
  const [estado, setEstado] = useState<EstadoEjecucion | 'todos'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)

  const { data: periodos } = useQuery({
    queryKey: ['periodos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('periodos')
        .select('*')
        .order('fecha_inicio', { ascending: false })
      if (error) throw error
      return (data ?? []) as PeriodoRow[]
    },
    staleTime: 5 * 60_000,
  })

  // Sin selección explícita, arrancamos en el periodo abierto: es el que el
  // 95 % de las veces se quiere ver.
  const periodoActivo = periodoId || periodos?.find((p) => p.estado === 'abierto')?.id || ''

  const { data, isPending } = useQuery({
    queryKey: ['actividad-periodo', periodoActivo, estado, busqueda, pagina],
    enabled: Boolean(periodoActivo),
    queryFn: async () => {
      let q = supabase
        .from('actividad_periodo')
        .select('*, actividad:v_actividades_arbol!inner(*)', { count: 'exact' })
        .eq('periodo_id', periodoActivo)
        .order('ruta', { referencedTable: 'v_actividades_arbol', ascending: true })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)

      if (estado !== 'todos') q = q.eq('estado', estado)
      if (busqueda.trim()) {
        q = q.ilike('v_actividades_arbol.nomenclatura', `%${busqueda.trim()}%`)
      }

      const { data, error, count } = await q
      if (error) throw error
      return { filas: (data ?? []) as unknown as Fila[], total: count ?? 0 }
    },
    placeholderData: (prev) => prev,
  })

  const periodo = periodos?.find((p) => p.id === periodoActivo)

  return (
    <>
      <PageHeader
        titulo="Actividades del Periodo"
        descripcion="Ejecución de la estructura académica dentro de un periodo concreto."
        acciones={
          <>
            <Si puede="periodos.administrar">
              <LinkButton to="/periodos" iconoIzq={<Settings2 className="size-4" />}>
                Administrar periodos
              </LinkButton>
            </Si>
            <Si puede="bi.exportar">
              <Button iconoIzq={<Download className="size-4" />}>Exportar CSV</Button>
            </Si>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <Select
            aria-label="Periodo académico"
            className="w-auto"
            value={periodoActivo}
            onChange={(e) => {
              setPeriodoId(e.target.value)
              setPagina(0)
            }}
          >
            {periodos?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.estado === 'abierto' ? ' · abierto' : p.estado === 'cerrado' ? ' · cerrado' : ''}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Estado de ejecución"
            className="w-auto"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value as EstadoEjecucion | 'todos')
              setPagina(0)
            }}
          >
            <option value="todos">Todos los estados</option>
            <option value="planificada">Planificadas</option>
            <option value="en_curso">En curso</option>
            <option value="realizada">Realizadas</option>
            <option value="aprobada">Aprobadas</option>
            <option value="cancelada">Canceladas</option>
          </Select>

          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              type="search"
              placeholder="Buscar actividad…"
              aria-label="Buscar en el periodo"
              className="pl-9"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPagina(0)
              }}
            />
          </div>

          {periodo && (
            <Badge tono={periodo.estado === 'abierto' ? 'exito' : 'neutro'} punto className="ml-auto">
              {periodo.estado === 'abierto' ? 'Periodo abierto' : 'Periodo cerrado'}
            </Badge>
          )}
        </div>

        {isPending ? (
          <TableSkeleton filas={8} columnas={4} />
        ) : !data?.filas.length ? (
          <EmptyState
            titulo="Sin actividades en este periodo"
            descripcion="Ninguna actividad coincide con los filtros seleccionados."
          />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th>Estructura académica</Th>
                  <Th className="w-28">Tipo</Th>
                  <Th className="w-32">Periodo</Th>
                  <Th alineado="der" className="w-36">
                    Estado
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((fila) => {
                  const a = fila.actividad
                  if (!a) return null
                  const Icono = ICONO_TIPO[a.tipo]

                  return (
                    <Tr key={fila.id}>
                      <Td>
                        <div
                          className="flex min-w-0 items-center gap-2"
                          style={{ paddingLeft: `${a.nivel * 1.5}rem` }}
                        >
                          <Icono
                            aria-hidden
                            className={cn(
                              'size-4 shrink-0',
                              a.tipo === 'principal' ? 'text-primary' : 'text-fg-subtle',
                            )}
                          />
                          <span className="min-w-0">
                            <span
                              className={cn(
                                'block truncate text-fg',
                                a.nivel === 0 && 'font-semibold',
                              )}
                            >
                              {a.nomenclatura}
                            </span>
                            <span className="block truncate text-body-sm text-fg-subtle">
                              {a.codigo}
                            </span>
                          </span>
                        </div>
                      </Td>
                      <Td className="text-fg-muted">{TIPO_ACTIVIDAD[a.tipo].etiqueta}</Td>
                      <Td className="text-fg-muted">{periodo?.codigo ?? '—'}</Td>
                      <Td alineado="der">
                        <Badge tono={ESTADO_EJECUCION[fila.estado].tono} punto>
                          {ESTADO_EJECUCION[fila.estado].etiqueta}
                        </Badge>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </TableShell>

            <Pagination
              pagina={pagina}
              porPagina={POR_PAGINA}
              total={data.total}
              onPagina={setPagina}
            />
          </>
        )}
      </Card>
    </>
  )
}
