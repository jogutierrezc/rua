import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  ChevronRight,
  CornerDownRight,
  Download,
  FileSpreadsheet,
  FileText,
  Folder,
  LifeBuoy,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { ESTADO_ACTIVIDAD, TIPO_ACTIVIDAD } from '@/lib/estados'
import { descargarTexto, objetosACsv } from '@/lib/csv'
import { COLUMNAS_ACTIVIDADES, exportarActividadesExcel } from '@/lib/excel'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { Input } from '@/components/ui/Field'
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { Si } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { DialogoEliminar } from './DialogoEliminar'
import type { ActividadArbolRow, EstadoActividad } from '@/types/database'

const ICONO_TIPO = { principal: Folder, directa: FileText, apoyo: LifeBuoy } as const

interface Nodo extends ActividadArbolRow {
  hijos: Nodo[]
}

function construirArbol(filas: ActividadArbolRow[]): Nodo[] {
  const porId = new Map<string, Nodo>()
  filas.forEach((f) => porId.set(f.id, { ...f, hijos: [] }))

  const raices: Nodo[] = []
  porId.forEach((nodo) => {
    if (nodo.padre_id && porId.has(nodo.padre_id)) {
      porId.get(nodo.padre_id)!.hijos.push(nodo)
    } else {
      raices.push(nodo)
    }
  })

  const ordenar = (ns: Nodo[]) => {
    ns.sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo))
    ns.forEach((n) => ordenar(n.hijos))
  }
  ordenar(raices)

  return raices
}

/** Ids del nodo y de toda su descendencia — lo que implica marcar una rama. */
function conDescendencia(nodo: Nodo, acc: string[] = []): string[] {
  acc.push(nodo.id)
  nodo.hijos.forEach((h) => conDescendencia(h, acc))
  return acc
}

// -----------------------------------------------------------------------------
function Fila({
  nodo,
  abiertos,
  alternar,
  seleccion,
  alternarSeleccion,
  puedeEditar,
  puedeCrear,
  puedeEliminar,
  onEditar,
  onAgregarHija,
  onEliminar,
}: {
  nodo: Nodo
  abiertos: Set<string>
  alternar: (id: string) => void
  seleccion: Set<string>
  alternarSeleccion: (nodo: Nodo) => void
  puedeEditar: boolean
  puedeCrear: boolean
  puedeEliminar: boolean
  onEditar: (n: Nodo) => void
  onAgregarHija: (n: Nodo) => void
  onEliminar: (ids: string[]) => void
}) {
  const abierto = abiertos.has(nodo.id)
  const tieneHijos = nodo.hijos.length > 0
  const Icono = ICONO_TIPO[nodo.tipo]
  const marcada = seleccion.has(nodo.id)

  return (
    <>
      <div
        className={cn(
          'group grid grid-cols-[2rem_minmax(0,1fr)_7rem_8rem_6.5rem] items-center gap-3 pr-4',
          'border-b border-line py-2',
          'transition-colors duration-fast ease-out',
          marcada ? 'bg-primary-soft/45' : '[@media(hover:hover)]:hover:bg-surface-muted',
          nodo.estado === 'archivada' && 'opacity-60',
        )}
      >
        {/* La sangría escala en rem: con tipografía grande el árbol no colapsa */}
        <label
          className="flex h-full cursor-pointer items-center justify-end"
          style={{ paddingLeft: `${0.75 + nodo.nivel * 1.5}rem` }}
        >
          <span className="sr-only">Seleccionar {nodo.nomenclatura}</span>
          <input
            type="checkbox"
            className="size-4 rounded-sm border-line-strong accent-primary"
            checked={marcada}
            onChange={() => alternarSeleccion(nodo)}
          />
        </label>

        <div className="flex min-w-0 items-center gap-2">
          {tieneHijos ? (
            <button
              onClick={() => alternar(nodo.id)}
              aria-expanded={abierto}
              aria-label={`${abierto ? 'Contraer' : 'Expandir'} ${nodo.nomenclatura}`}
              className="grid size-5 shrink-0 place-items-center rounded text-fg-subtle transition-colors duration-fast ease-out hover:bg-surface-muted hover:text-fg"
            >
              <ChevronRight
                aria-hidden
                data-motion="transform"
                className={cn(
                  'size-3.5 transition-transform duration-fast ease-out',
                  abierto && 'rotate-90',
                )}
              />
            </button>
          ) : (
            <span aria-hidden className="size-5 shrink-0" />
          )}

          <Icono
            aria-hidden
            className={cn(
              'size-4 shrink-0',
              nodo.tipo === 'principal' ? 'text-primary' : 'text-fg-subtle',
            )}
          />

          <span className="min-w-0">
            <span
              className={cn('block truncate text-body text-fg', nodo.nivel === 0 && 'font-semibold')}
            >
              {nodo.nomenclatura}
            </span>
            <span className="block truncate font-mono text-body-sm text-fg-subtle">
              {nodo.codigo}
              {nodo.vicerrectorias.length > 0 && (
                <span className="font-sans"> · {nodo.vicerrectorias.join(', ')}</span>
              )}
            </span>
          </span>
        </div>

        <Badge tono={TIPO_ACTIVIDAD[nodo.tipo].tono} className="justify-self-start">
          {TIPO_ACTIVIDAD[nodo.tipo].etiqueta}
        </Badge>

        <Badge tono={ESTADO_ACTIVIDAD[nodo.estado].tono} punto className="justify-self-start">
          {ESTADO_ACTIVIDAD[nodo.estado].etiqueta}
        </Badge>

        {/* Acciones por fila. Aparecen al pasar el cursor para que la tabla no
            sea un muro de iconos, pero se quedan visibles en táctil y al
            navegar con teclado. */}
        <div
          className={cn(
            'flex items-center justify-end gap-0.5',
            'opacity-0 transition-opacity duration-fast ease-out',
            'group-hover:opacity-100 group-focus-within:opacity-100',
            '[@media(hover:none)]:opacity-100',
          )}
        >
          {puedeEditar && (
            <Button
              tamano="sm"
              variante="fantasma"
              soloIcono
              aria-label={`Editar ${nodo.nomenclatura}`}
              title="Editar"
              onClick={() => onEditar(nodo)}
              iconoIzq={<Pencil className="size-3.5" />}
            />
          )}
          {puedeCrear && nodo.nivel < 2 && (
            <Button
              tamano="sm"
              variante="fantasma"
              soloIcono
              aria-label={`Agregar actividad bajo ${nodo.nomenclatura}`}
              title="Agregar actividad hija"
              onClick={() => onAgregarHija(nodo)}
              iconoIzq={<CornerDownRight className="size-3.5" />}
            />
          )}
          {puedeEliminar && (
            <Button
              tamano="sm"
              variante="fantasma"
              soloIcono
              aria-label={`Eliminar ${nodo.nomenclatura}`}
              title="Eliminar"
              onClick={() => onEliminar([nodo.id])}
              className="hover:bg-danger-soft hover:text-danger-softFg"
              iconoIzq={<Trash2 className="size-3.5" />}
            />
          )}
        </div>
      </div>

      {abierto &&
        nodo.hijos.map((h) => (
          <Fila
            key={h.id}
            nodo={h}
            abiertos={abiertos}
            alternar={alternar}
            seleccion={seleccion}
            alternarSeleccion={alternarSeleccion}
            puedeEditar={puedeEditar}
            puedeCrear={puedeCrear}
            puedeEliminar={puedeEliminar}
            onEditar={onEditar}
            onAgregarHija={onAgregarHija}
            onEliminar={onEliminar}
          />
        ))}
    </>
  )
}

// -----------------------------------------------------------------------------
export function ActividadesPage() {
  const { puede } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [aEliminar, setAEliminar] = useState<string[] | null>(null)
  const [exportando, setExportando] = useState(false)

  const puedeEditar = puede('actividades.editar')
  const puedeCrear = puede('actividades.crear')
  const puedeEliminar = puede('actividades.eliminar')

  const { data, isPending } = useQuery({
    queryKey: ['actividades', 'arbol'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_actividades_arbol').select('*').order('ruta')
      if (error) throw error
      return (data ?? []) as ActividadArbolRow[]
    },
  })

  const cambiarEstado = useMutation({
    mutationFn: async (estado: EstadoActividad) => {
      const { error } = await supabase.rpc('fn_cambiar_estado_actividades', {
        p_ids: [...seleccion],
        p_estado: estado,
        p_incluir_descendientes: true,
      })
      if (error) throw error
    },
    onSuccess: (_, estado) => {
      toast.success(
        estado === 'archivada'
          ? 'Actividades archivadas'
          : `Estado cambiado a ${ESTADO_ACTIVIDAD[estado].etiqueta.toLowerCase()}`,
      )
      void qc.invalidateQueries({ queryKey: ['actividades'] })
      setSeleccion(new Set())
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const arbolCompleto = useMemo(() => (data ? construirArbol(data) : []), [data])

  const arbol = useMemo(() => {
    if (!data) return []
    if (!busqueda.trim()) return arbolCompleto

    // Al buscar se muestran las coincidencias MÁS SUS ANCESTROS: una hoja
    // suelta sin su rama no dice nada sobre dónde vive.
    const t = busqueda.trim().toLowerCase()
    const coincide = (a: ActividadArbolRow) =>
      a.nomenclatura.toLowerCase().includes(t) || a.codigo.toLowerCase().includes(t)

    const porId = new Map(data.map((a) => [a.id, a]))
    const conservar = new Set<string>()

    data.filter(coincide).forEach((a) => {
      let actual: ActividadArbolRow | undefined = a
      while (actual) {
        conservar.add(actual.id)
        actual = actual.padre_id ? porId.get(actual.padre_id) : undefined
      }
    })

    return construirArbol(data.filter((a) => conservar.has(a.id)))
  }, [data, busqueda, arbolCompleto])

  // Con búsqueda activa todo se despliega: ocultar un resultado tras un
  // triángulo cerrado equivale a no haberlo encontrado.
  const abiertosEfectivos = useMemo(() => {
    if (!busqueda.trim() || !data) return abiertos
    return new Set(data.map((a) => a.id))
  }, [busqueda, data, abiertos])

  function alternar(id: string) {
    setAbiertos((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  /**
   * Marcar una rama marca su descendencia. Es lo que el usuario espera al
   * seleccionar una carpeta, y evita el caso peligroso de "archivé el padre
   * pero los hijos siguieron activos".
   */
  function alternarSeleccion(nodo: Nodo) {
    const ids = conDescendencia(nodo)
    setSeleccion((prev) => {
      const s = new Set(prev)
      if (s.has(nodo.id)) ids.forEach((id) => s.delete(id))
      else ids.forEach((id) => s.add(id))
      return s
    })
  }

  /**
   * El formato de salida es EXACTAMENTE el que acepta la importación. Es lo
   * que convierte a Excel en el editor masivo: exportar, corregir, resubir.
   */
  function filasExportables() {
    return (data ?? []).map((a) => ({
      codigo: a.codigo,
      nomenclatura: a.nomenclatura,
      tipo: a.tipo,
      padre_codigo: a.padre_codigo ?? '',
      estado: a.estado,
      descripcion: a.descripcion ?? '',
    }))
  }

  const nombreExport = `actividades-${new Date().toISOString().slice(0, 10)}`

  async function exportarExcel() {
    if (!data?.length) return
    setExportando(true)
    try {
      await exportarActividadesExcel(filasExportables(), `${nombreExport}.xlsx`)
      toast.success('Estructura exportada a Excel', {
        description: 'Edítala y vuelve a importarla para aplicar los cambios.',
      })
    } catch {
      toast.error('No se pudo generar el archivo de Excel.')
    } finally {
      setExportando(false)
    }
  }

  function exportarCsv() {
    if (!data?.length) return
    descargarTexto(
      `${nombreExport}.csv`,
      objetosACsv(filasExportables(), [...COLUMNAS_ACTIVIDADES]),
    )
    toast.success('Estructura exportada a CSV')
  }

  return (
    <>
      <PageHeader
        titulo="Estructura de Actividades"
        descripcion="El árbol de actividades principales, directas y de apoyo de la institución."
        acciones={
          <>
            <Button
              onClick={exportarExcel}
              disabled={!data?.length}
              cargando={exportando}
              iconoIzq={<FileSpreadsheet className="size-4" />}
            >
              Exportar Excel
            </Button>
            <Button
              onClick={exportarCsv}
              disabled={!data?.length}
              iconoIzq={<Download className="size-4" />}
            >
              CSV
            </Button>
            <Si puede="actividades.crear">
              <LinkButton to="/actividades/importar" iconoIzq={<Upload className="size-4" />}>
                Importar
              </LinkButton>
              <LinkButton
                to="/actividades/nueva"
                variante="primario"
                iconoIzq={<Plus className="size-4" />}
              >
                Nueva rama
              </LinkButton>
            </Si>
          </>
        }
      />

      <Card className="overflow-hidden">
        {/* Barra de herramientas. Cambia a modo lote cuando hay selección, en
            lugar de mostrar acciones deshabilitadas que nunca se pueden usar. */}
        {seleccion.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-primary-soft px-4 py-2.5">
            <Button
              tamano="sm"
              variante="fantasma"
              soloIcono
              aria-label="Cancelar selección"
              onClick={() => setSeleccion(new Set())}
              iconoIzq={<X className="size-4" />}
            />
            <p className="text-label text-primary-softFg">
              {seleccion.size} {seleccion.size === 1 ? 'seleccionada' : 'seleccionadas'}
            </p>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Si puede="actividades.editar">
                <Button
                  tamano="sm"
                  disabled={cambiarEstado.isPending}
                  onClick={() => cambiarEstado.mutate('activa')}
                  iconoIzq={<RotateCcw className="size-3.5" />}
                >
                  Activar
                </Button>
                <Button
                  tamano="sm"
                  disabled={cambiarEstado.isPending}
                  onClick={() => cambiarEstado.mutate('archivada')}
                  iconoIzq={<Archive className="size-3.5" />}
                >
                  Archivar
                </Button>
              </Si>
              <Si puede="actividades.eliminar">
                <Button
                  tamano="sm"
                  variante="peligro"
                  onClick={() => setAEliminar([...seleccion])}
                  iconoIzq={<Trash2 className="size-3.5" />}
                >
                  Eliminar
                </Button>
              </Si>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
              />
              <Input
                type="search"
                placeholder="Buscar por nombre o código…"
                aria-label="Buscar actividades"
                className="pl-9"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div className="ml-auto flex items-center gap-3">
              <Button
                tamano="sm"
                variante="fantasma"
                onClick={() =>
                  setAbiertos(
                    abiertos.size > 0 ? new Set() : new Set(data?.map((a) => a.id) ?? []),
                  )
                }
              >
                {abiertos.size > 0 ? 'Contraer todo' : 'Expandir todo'}
              </Button>
              {data && (
                <p className="text-body-sm text-fg-subtle">
                  <span className="tabular text-fg">{data.length}</span> actividades
                </p>
              )}
            </div>
          </div>
        )}

        {/* Encabezado de columnas */}
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_8rem_6.5rem] gap-3 border-b border-line bg-sunken py-2 pr-4 text-overline uppercase text-fg-muted">
          <span className="sr-only">Selección</span>
          <span>Actividad</span>
          <span>Tipo</span>
          <span>Estado</span>
          <span className="text-right">Acciones</span>
        </div>

        {isPending ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6" style={{ marginLeft: `${(i % 3) * 1.5}rem` }} />
            ))}
          </div>
        ) : arbol.length === 0 ? (
          <EmptyState
            titulo={busqueda ? 'Sin coincidencias' : 'Aún no hay actividades'}
            descripcion={
              busqueda
                ? 'Prueba con otro término, o revisa el código de la actividad.'
                : 'Crea la primera rama a mano, o importa la estructura completa desde un CSV.'
            }
            accion={
              !busqueda && puedeCrear ? (
                <div className="flex gap-2">
                  <LinkButton to="/actividades/importar" iconoIzq={<Upload className="size-4" />}>
                    Importar CSV
                  </LinkButton>
                  <LinkButton
                    to="/actividades/nueva"
                    variante="primario"
                    iconoIzq={<Plus className="size-4" />}
                  >
                    Nueva rama
                  </LinkButton>
                </div>
              ) : undefined
            }
          />
        ) : (
          <div>
            {arbol.map((n) => (
              <Fila
                key={n.id}
                nodo={n}
                abiertos={abiertosEfectivos}
                alternar={alternar}
                seleccion={seleccion}
                alternarSeleccion={alternarSeleccion}
                puedeEditar={puedeEditar}
                puedeCrear={puedeCrear}
                puedeEliminar={puedeEliminar}
                onEditar={(nodo) => navigate(`/actividades/${nodo.raiz_id ?? nodo.id}/editar`)}
                onAgregarHija={(nodo) =>
                  navigate(`/actividades/${nodo.raiz_id ?? nodo.id}/editar?agregar=1`)
                }
                onEliminar={setAEliminar}
              />
            ))}
          </div>
        )}
      </Card>

      {aEliminar && (
        <DialogoEliminar
          ids={aEliminar}
          onCerrar={() => {
            setAEliminar(null)
            setSeleccion(new Set())
          }}
        />
      )}
    </>
  )
}
