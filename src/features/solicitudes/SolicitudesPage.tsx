import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Eye, Filter, Hourglass, Plus, Search, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fechaRelativa } from '@/lib/format'
import { ESTADO_SOLICITUD, PRIORIDAD, TIPO_SOLICITUD } from '@/lib/estados'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { Input, Select } from '@/components/ui/Field'
import {
  Avatar,
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
import { useAuth } from '@/features/auth/AuthProvider'
import { DialogoSolicitud } from './DialogoSolicitud'
import type { EstadoSolicitud, SolicitudDetalleRow, TipoSolicitud } from '@/types/database'

const POR_PAGINA = 15

interface Filtros {
  estado: EstadoSolicitud | 'pendientes' | 'todas'
  tipo: TipoSolicitud | 'todos'
  busqueda: string
}

function useSolicitudes(filtros: Filtros, pagina: number) {
  return useQuery({
    queryKey: ['solicitudes', filtros, pagina],
    queryFn: async () => {
      let q = supabase
        .from('v_solicitudes_detalle')
        .select('*', { count: 'exact' })
        .order('prioridad', { ascending: false })
        .order('creado_en', { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)

      if (filtros.estado === 'pendientes') q = q.in('estado', ['pendiente', 'revision'])
      else if (filtros.estado !== 'todas') q = q.eq('estado', filtros.estado)

      if (filtros.tipo !== 'todos') q = q.eq('tipo', filtros.tipo)

      if (filtros.busqueda.trim()) {
        const t = `%${filtros.busqueda.trim()}%`
        q = q.or(
          `folio.ilike.${t},objetivo_nomenclatura.ilike.${t},solicitante_nombre.ilike.${t}`,
        )
      }

      const { data, error, count } = await q
      if (error) throw error
      return { filas: (data ?? []) as SolicitudDetalleRow[], total: count ?? 0 }
    },
    placeholderData: (prev) => prev, // sin parpadeo al cambiar de página
  })
}

// -----------------------------------------------------------------------------
export function SolicitudesPage() {
  const { puede, perfil } = useAuth()
  const navigate = useNavigate()

  const [filtros, setFiltros] = useState<Filtros>({
    estado: 'pendientes',
    tipo: 'todos',
    busqueda: '',
  })
  const [pagina, setPagina] = useState(0)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)

  const { data, isPending } = useSolicitudes(filtros, pagina)

  // Aprobar y denegar ya no viven aquí. Firmar desde una fila de tabla, con un
  // `window.prompt` como justificación, era exactamente lo contrario de lo que
  // pide un expediente: ahora se abre la vista ampliada y se decide con
  // contexto delante.

  function cambiarFiltro<K extends keyof Filtros>(clave: K, valor: Filtros[K]) {
    setFiltros((f) => ({ ...f, [clave]: valor }))
    setPagina(0) // un filtro nuevo empieza siempre en la primera página
  }

  const hayFiltros = filtros.estado !== 'pendientes' || filtros.tipo !== 'todos' || filtros.busqueda

  return (
    <>
      <PageHeader
        titulo="Solicitudes"
        descripcion="Revisión y aprobación de cambios propuestos sobre la estructura académica."
        acciones={
          <Si puede="solicitudes.crear">
            <LinkButton to="/solicitudes/nueva" variante="primario" iconoIzq={<Plus className="size-4" />}>
              Nueva solicitud
            </LinkButton>
          </Si>
        }
      />

      <Card className="overflow-hidden">
        {/* Barra de filtros ------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              type="search"
              placeholder="Folio, actividad o solicitante…"
              aria-label="Buscar solicitudes"
              className="pl-9"
              value={filtros.busqueda}
              onChange={(e) => cambiarFiltro('busqueda', e.target.value)}
            />
          </div>

          <Select
            aria-label="Filtrar por estado"
            className="w-auto"
            value={filtros.estado}
            onChange={(e) => cambiarFiltro('estado', e.target.value as Filtros['estado'])}
          >
            <option value="pendientes">Pendientes de revisión</option>
            <option value="todas">Todos los estados</option>
            <option value="aprobada">Aprobadas</option>
            <option value="denegada">Denegadas</option>
            <option value="borrador">Borradores</option>
          </Select>

          <Select
            aria-label="Filtrar por tipo"
            className="w-auto"
            value={filtros.tipo}
            onChange={(e) => cambiarFiltro('tipo', e.target.value as Filtros['tipo'])}
          >
            <option value="todos">Todos los tipos</option>
            <option value="crear">Crear</option>
            <option value="editar">Editar</option>
            <option value="eliminar">Eliminar</option>
          </Select>

          {hayFiltros && (
            <Button
              variante="fantasma"
              tamano="sm"
              onClick={() => {
                setFiltros({ estado: 'pendientes', tipo: 'todos', busqueda: '' })
                setPagina(0)
              }}
              iconoIzq={<Filter className="size-3.5" />}
            >
              Limpiar
            </Button>
          )}
        </div>

        {/* Tabla ------------------------------------------------------ */}
        {isPending ? (
          <TableSkeleton filas={8} columnas={6} />
        ) : !data?.filas.length ? (
          <EmptyState
            titulo={hayFiltros ? 'Ningún resultado con esos filtros' : 'La bandeja está vacía'}
            descripcion={
              hayFiltros
                ? 'Prueba a ampliar el estado o el tipo, o borra el término de búsqueda.'
                : 'Cuando llegue una solicitud para revisar, aparecerá aquí.'
            }
            accion={
              hayFiltros ? (
                <Button
                  onClick={() => setFiltros({ estado: 'todas', tipo: 'todos', busqueda: '' })}
                >
                  Quitar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th className="w-32">Folio</Th>
                  <Th className="w-52">Solicitante</Th>
                  <Th className="w-24">Tipo</Th>
                  <Th>Actividad y justificación</Th>
                  <Th className="w-32">Estado</Th>
                  <Th className="w-28">Recibida</Th>
                  <Th alineado="der" className="w-24">
                    Acciones
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((s) => {
                  const abierta = expandida === s.id
                  const esMia = s.solicitante_id === perfil?.id
                  const enCurso = s.estado === 'pendiente' || s.estado === 'revision'

                  // Tres situaciones distintas, tres botones distintos. Antes
                  // las tres caían en un «Ver» genérico y quien tenía que
                  // responder no sabía que le tocaba a él.
                  const meToca =
                    enCurso &&
                    !esMia &&
                    Boolean(s.etapa_vigente_permiso) &&
                    puede(s.etapa_vigente_permiso!)
                  // Ya conceptué y la cadena avanzó: mi acción queda apagada
                  // hasta que —si vuelve a tocarme— llegue otra etapa mía.
                  const yaConceptue = enCurso && !esMia && !meToca && s.ya_respondi

                  return (
                    <Tr
                      key={s.id}
                      className={cn(
                        s.prioridad === 'urgente' && 'border-l-2 border-l-danger',
                      )}
                    >
                      <Td className="font-medium text-fg-muted">{s.folio}</Td>

                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar nombre={s.solicitante_nombre} url={s.solicitante_avatar} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-fg">
                              {s.solicitante_nombre}
                            </span>
                            <span className="block truncate text-body-sm text-fg-subtle">
                              {s.solicitante_vicerrectoria ?? s.solicitante_cargo ?? '—'}
                            </span>
                          </span>
                        </div>
                      </Td>

                      <Td>
                        <Badge tono={TIPO_SOLICITUD[s.tipo].tono}>
                          {TIPO_SOLICITUD[s.tipo].etiqueta}
                        </Badge>
                      </Td>

                      <Td className="max-w-0">
                        <span className="block truncate font-medium text-fg">
                          {s.objetivo_nomenclatura ?? '—'}
                          {s.objetivo_codigo && (
                            <span className="ml-1.5 font-normal text-fg-subtle">
                              {s.objetivo_codigo}
                            </span>
                          )}
                        </span>
                        {/* El texto completo se despliega en su sitio, sin
                            sacar al usuario de la tabla ni abrir un diálogo. */}
                        <p
                          className={cn(
                            'text-body-sm text-fg-muted',
                            abierta ? 'mt-1 whitespace-pre-line' : 'truncate',
                          )}
                        >
                          {s.concepto_justificativo}
                        </p>
                        {s.concepto_justificativo.length > 90 && (
                          <button
                            onClick={() => setExpandida(abierta ? null : s.id)}
                            className="mt-0.5 text-body-sm text-primary underline-offset-4 hover:underline"
                            aria-expanded={abierta}
                          >
                            {abierta ? 'Ver menos' : 'Ver justificación completa'}
                          </button>
                        )}
                      </Td>

                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tono={ESTADO_SOLICITUD[s.estado].tono} punto>
                            {ESTADO_SOLICITUD[s.estado].etiqueta}
                          </Badge>
                          {s.prioridad !== 'normal' && (
                            <Badge tono={PRIORIDAD[s.prioridad].tono}>
                              {PRIORIDAD[s.prioridad].etiqueta}
                            </Badge>
                          )}
                        </div>
                      </Td>

                      <Td className="whitespace-nowrap text-fg-subtle">
                        {fechaRelativa(s.creado_en)}
                      </Td>

                      <Td alineado="der">
                        <div className="flex items-center justify-end gap-1">
                          {/* Quien la presentó ve su Rua Tracker; quien revisa,
                              la vista ampliada para decidir. Dos destinos, un
                              solo expediente detrás. */}
                          {esMia ? (
                            <Button
                              tamano="sm"
                              variante="sutil"
                              aria-label={`Ver el seguimiento de ${s.folio}`}
                              onClick={() => navigate(`/solicitudes/${s.id}`)}
                              iconoIzq={<Activity className="size-3.5" />}
                            >
                              Seguimiento
                            </Button>
                          ) : meToca ? (
                            <Button
                              tamano="sm"
                              variante="primario"
                              aria-label={`Responder al expediente ${s.folio}`}
                              onClick={() => setAbierta(s.id)}
                              iconoIzq={<Eye className="size-3.5" />}
                            >
                              Responder
                            </Button>
                          ) : yaConceptue ? (
                            // Se abre igual: consultar lo que uno mismo
                            // conceptuó no es una acción, es un derecho.
                            <Button
                              tamano="sm"
                              variante="sutil"
                              aria-label={`Ver tu concepto en el expediente ${s.folio}`}
                              title={
                                s.etapa_vigente_nombre
                                  ? `Ya emitiste tu concepto. Ahora está en manos de ${s.etapa_vigente_nombre}.`
                                  : 'Ya emitiste tu concepto.'
                              }
                              onClick={() => setAbierta(s.id)}
                              iconoIzq={<Check className="size-3.5" />}
                            >
                              Concepto emitido
                            </Button>
                          ) : (
                            <Button
                              tamano="sm"
                              variante="fantasma"
                              aria-label={`Abrir el expediente ${s.folio}`}
                              title={
                                enCurso && s.etapa_vigente_nombre
                                  ? `Esperando el concepto de ${s.etapa_vigente_nombre}.`
                                  : undefined
                              }
                              onClick={() => setAbierta(s.id)}
                              iconoIzq={
                                enCurso ? (
                                  <Hourglass className="size-3.5" />
                                ) : (
                                  <Eye className="size-3.5" />
                                )
                              }
                            >
                              Ver
                            </Button>
                          )}
                        </div>
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

      {abierta && <DialogoSolicitud solicitudId={abierta} onCerrar={() => setAbierta(null)} />}
    </>
  )
}
