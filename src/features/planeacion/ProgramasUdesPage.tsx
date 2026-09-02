import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, MessageSquare, Paperclip, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { tiempoRestante } from '@/lib/format'
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
import { useAuth } from '@/features/auth/AuthProvider'
import { DialogoPrograma } from './DialogoPrograma'
import { DialogoDetallePrograma } from './DialogoDetallePrograma'
import { ESTADO_VIGENCIA, MODALIDAD_PROGRAMA, NIVEL_PROGRAMA } from './dominio'
import type { EstadoVigencia, NivelPrograma, ProgramaUdesDetalleRow } from '@/types/database'

const POR_PAGINA = 20

interface Filtros {
  busqueda: string
  nivel: NivelPrograma | 'todos'
  vigencia: EstadoVigencia | 'todas' | 'atencion'
}

export function ProgramasUdesPage() {
  const { puede } = useAuth()
  const [filtros, setFiltros] = useState<Filtros>({
    busqueda: '',
    nivel: 'todos',
    vigencia: 'todas',
  })
  const [pagina, setPagina] = useState(0)

  const [detalle, setDetalle] = useState<ProgramaUdesDetalleRow | null>(null)
  const [editando, setEditando] = useState<ProgramaUdesDetalleRow | null>(null)
  const [creando, setCreando] = useState(false)

  const { data, isPending } = useQuery({
    queryKey: ['programas', filtros, pagina],
    queryFn: async () => {
      let q = supabase
        .from('v_programas_udes')
        .select('*', { count: 'exact' })
        .eq('estado', 'activo')
        // Lo que está más cerca de vencer, primero. Es el orden que responde a
        // la pregunta con la que se entra a esta pantalla.
        .order('rc_fecha_vencimiento', { ascending: true, nullsFirst: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)

      if (filtros.nivel !== 'todos') q = q.eq('nivel', filtros.nivel)

      if (filtros.vigencia === 'atencion') {
        q = q.in('estado_vigencia', ['vencido', 'por_vencer'])
      } else if (filtros.vigencia !== 'todas') {
        q = q.eq('estado_vigencia', filtros.vigencia)
      }

      if (filtros.busqueda.trim()) {
        const t = `%${filtros.busqueda.trim()}%`
        q = q.or(`nombre.ilike.${t},codigo_unico.ilike.${t},snies.ilike.${t},facultad.ilike.${t}`)
      }

      const { data, error, count } = await q
      if (error) throw error
      return { filas: (data ?? []) as ProgramaUdesDetalleRow[], total: count ?? 0 }
    },
    placeholderData: (prev) => prev,
  })

  const enAtencion = data?.filas.filter(
    (p) => p.estado_vigencia === 'vencido' || p.estado_vigencia === 'por_vencer',
  ).length

  return (
    <>
      <PageHeader
        titulo="Programas UDES"
        descripcion="La oferta académica con su registro calificado, su acreditación y sus cupos aprobados."
        acciones={
          puede('planeacion.administrar') && (
            <Button
              variante="primario"
              onClick={() => setCreando(true)}
              iconoIzq={<Plus className="size-4" />}
            >
              Nuevo programa
            </Button>
          )
        }
      />

      <Card>
        {/* Filtros ------------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[15rem] flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              aria-label="Buscar programas"
              placeholder="Nombre, código único, SNIES o facultad…"
              className="pl-8"
              value={filtros.busqueda}
              onChange={(e) => {
                setFiltros((f) => ({ ...f, busqueda: e.target.value }))
                setPagina(0)
              }}
            />
          </div>

          <Select
            aria-label="Nivel"
            className="w-auto"
            value={filtros.nivel}
            onChange={(e) => {
              setFiltros((f) => ({ ...f, nivel: e.target.value as Filtros['nivel'] }))
              setPagina(0)
            }}
          >
            <option value="todos">Todos los niveles</option>
            {Object.entries(NIVEL_PROGRAMA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Vigencia del registro"
            className="w-auto"
            value={filtros.vigencia}
            onChange={(e) => {
              setFiltros((f) => ({ ...f, vigencia: e.target.value as Filtros['vigencia'] }))
              setPagina(0)
            }}
          >
            <option value="todas">Cualquier vigencia</option>
            <option value="atencion">Requieren atención</option>
            <option value="vencido">Vencidos</option>
            <option value="por_vencer">Por vencer (3 meses)</option>
            <option value="proximo">Próximos (12 meses)</option>
            <option value="vigente">Vigentes</option>
            <option value="sin_registro">Sin registro</option>
          </Select>
        </div>

        {/* Aviso de lo urgente ------------------------------------------ */}
        {!isPending && Boolean(enAtencion) && filtros.vigencia === 'todas' && (
          <button
            onClick={() => setFiltros((f) => ({ ...f, vigencia: 'atencion' }))}
            className={cn(
              'flex w-full items-center gap-2 border-b border-line bg-warning-soft px-4 py-2.5',
              'text-left text-body-sm text-warning-softFg',
              'transition-colors duration-fast ease-out hover:brightness-95',
            )}
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>
              {enAtencion} {enAtencion === 1 ? 'programa tiene' : 'programas tienen'} el registro
              vencido o a menos de tres meses. Pulsa para verlos.
            </span>
          </button>
        )}

        {/* Tabla -------------------------------------------------------- */}
        {isPending ? (
          <TableSkeleton filas={8} columnas={7} />
        ) : !data?.filas.length ? (
          <EmptyState
            titulo="Ningún programa con esos criterios"
            descripcion="Prueba a ampliar el nivel o la vigencia, o borra el término de búsqueda."
          />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th className="w-28">Código</Th>
                  <Th className="w-20">SNIES</Th>
                  <Th>Programa</Th>
                  <Th className="w-36">Nivel</Th>
                  <Th className="w-36">Campus</Th>
                  <Th className="w-20">Cupos</Th>
                  <Th className="w-48">Registro calificado</Th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((p) => {
                  const vig = ESTADO_VIGENCIA[p.estado_vigencia]
                  return (
                    <Tr
                      key={p.id}
                      onClick={() => setDetalle(p)}
                      className={cn(
                        'cursor-pointer',
                        p.estado_vigencia === 'vencido' && 'border-l-2 border-l-danger',
                        p.estado_vigencia === 'por_vencer' && 'border-l-2 border-l-warning',
                      )}
                    >
                      <Td className="font-mono text-fg-muted">{p.codigo_unico}</Td>
                      <Td className="text-fg-muted">{p.snies ?? '—'}</Td>

                      <Td className="max-w-0">
                        <span className="block truncate font-medium text-fg">{p.nombre}</span>
                        <span className="flex items-center gap-2 truncate text-body-sm text-fg-subtle">
                          {p.facultad}
                          {p.rc_archivo_ruta && (
                            <Paperclip aria-label="Con resolución adjunta" className="size-3" />
                          )}
                          {p.total_observaciones > 0 && (
                            <span className="flex items-center gap-0.5">
                              <MessageSquare aria-hidden className="size-3" />
                              {p.total_observaciones}
                            </span>
                          )}
                        </span>
                      </Td>

                      <Td className="text-fg-muted">{NIVEL_PROGRAMA[p.nivel]}</Td>

                      <Td className="text-fg-muted">
                        <span className="block truncate">{p.campus}</span>
                        <span className="block truncate text-body-sm text-fg-subtle">
                          {MODALIDAD_PROGRAMA[p.modalidad]}
                        </span>
                      </Td>

                      <Td className="tabular text-fg-muted">{p.cupos_aprobados ?? '—'}</Td>

                      <Td>
                        <Badge tono={vig.tono} punto>
                          {vig.etiqueta}
                        </Badge>
                        <span className="mt-0.5 block text-body-sm text-fg-subtle">
                          {tiempoRestante(p.dias_para_vencimiento)}
                        </span>
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

      {detalle && (
        <DialogoDetallePrograma
          programa={detalle}
          onCerrar={() => setDetalle(null)}
          onEditar={() => {
            setEditando(detalle)
            setDetalle(null)
          }}
        />
      )}

      {(creando || editando) && (
        <DialogoPrograma
          programa={editando}
          onCerrar={() => {
            setCreando(false)
            setEditando(null)
          }}
        />
      )}
    </>
  )
}
