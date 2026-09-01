import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Network, Plus, Save, Trash2, Undo2, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { ESTADO_ACTIVIDAD } from '@/lib/estados'
import { AYUDA_CODIGO, normalizarCodigo, validarCodigo } from '@/lib/codigos'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Campo, Checkbox, Input, Select } from '@/components/ui/Field'
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/primitives'
import type {
  ActividadArbolRow,
  EstadoActividad,
  FilaImportacion,
  TipoActividad,
  VicerrectoriaRow,
} from '@/types/database'

/**
 * Una fila de la tabla en línea.
 *
 * `clave` es la identidad para React y para el desplegable «depende de»: no
 * puede ser el código, porque el usuario lo está escribiendo y cambia con cada
 * pulsación. `id` sólo existe si la fila ya está en la base.
 */
interface Fila {
  clave: string
  id: string | null
  tipo: TipoActividad
  codigo: string
  nomenclatura: string
  /** Clave de la fila padre, o `null` para colgar de la actividad principal. */
  dependeDe: string | null
}

const filaVacia = (tipo: TipoActividad = 'directa'): Fila => ({
  clave: crypto.randomUUID(),
  id: null,
  tipo,
  codigo: '',
  nomenclatura: '',
  dependeDe: null,
})

export function EditorRamaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const editando = Boolean(id)

  const [codigo, setCodigo] = useState('')
  const [nomenclatura, setNomenclatura] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [estado, setEstado] = useState<EstadoActividad>('activa')
  const [unidades, setUnidades] = useState<Set<string>>(new Set())
  const [filas, setFilas] = useState<Fila[]>([filaVacia()])
  const [eliminadas, setEliminadas] = useState<string[]>([])
  const [enviado, setEnviado] = useState(false)
  const [cargado, setCargado] = useState(false)

  // ---------------------------------------------------------------------------
  // Carga de la rama existente
  // ---------------------------------------------------------------------------
  const { data: rama, isPending: cargandoRama } = useQuery({
    queryKey: ['rama', id],
    enabled: editando,
    queryFn: async () => {
      const { data: todas, error } = await supabase
        .from('v_actividades_arbol')
        .select('*')
        .or(`id.eq.${id},raiz_id.eq.${id}`)
        .order('nivel')
        .order('orden')
      if (error) throw error

      const filas = (todas ?? []) as ActividadArbolRow[]
      const principal = filas.find((a) => a.id === id)
      if (!principal) throw new Error('La actividad no existe o no tienes acceso.')

      const { data: vics } = await supabase
        .from('actividad_vicerrectorias')
        .select('vicerrectoria_id')
        .eq('actividad_id', id!)

      return {
        principal,
        hijas: filas.filter((a) => a.id !== id),
        unidades: (vics ?? []).map((v) => v.vicerrectoria_id),
      }
    },
  })

  const { data: vicerrectorias } = useQuery({
    queryKey: ['vicerrectorias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vicerrectorias')
        .select('*')
        .eq('estado', 'activo')
        .order('orden')
      if (error) throw error
      return (data ?? []) as VicerrectoriaRow[]
    },
    staleTime: 10 * 60_000,
  })

  // Se vuelca una sola vez: si repobláramos en cada render de la consulta,
  // un refetch en segundo plano borraría lo que el usuario está escribiendo.
  useEffect(() => {
    if (!rama || cargado) return

    setCodigo(rama.principal.codigo)
    setNomenclatura(rama.principal.nomenclatura)
    setDescripcion(rama.principal.descripcion ?? '')
    setEstado(rama.principal.estado)
    setUnidades(new Set(rama.unidades))

    // El árbol se aplana a la tabla: cada hija apunta a la clave de su padre,
    // o a null si cuelga directamente de la principal.
    const porId = new Map<string, string>()
    const convertidas: Fila[] = rama.hijas.map((h) => {
      const clave = crypto.randomUUID()
      porId.set(h.id, clave)
      return {
        clave,
        id: h.id,
        tipo: h.tipo,
        codigo: h.codigo,
        nomenclatura: h.nomenclatura,
        dependeDe: null,
      }
    })
    convertidas.forEach((f, i) => {
      const original = rama.hijas[i]
      if (original.padre_id && original.padre_id !== rama.principal.id) {
        f.dependeDe = porId.get(original.padre_id) ?? null
      }
    })

    // Si se llegó desde el botón "agregar" del árbol, la rama abre ya con
    // una fila en blanco lista para escribir, en vez de obligar a un clic más.
    const conNueva = params.get('agregar') === '1'
    setFilas(
      convertidas.length > 0
        ? conNueva
          ? [...convertidas, filaVacia()]
          : convertidas
        : [filaVacia()],
    )
    setCargado(true)
  }, [rama, cargado, params])

  // ---------------------------------------------------------------------------
  // Validación
  // ---------------------------------------------------------------------------
  const utiles = filas.filter((f) => f.codigo.trim() || f.nomenclatura.trim())

  const errorCodigo = validarCodigo(codigo)
  const errorNomenclatura =
    nomenclatura.trim().length < 3 ? 'Escribe el nombre oficial de la actividad.' : null

  const errorFila = (f: Fila): string | null => {
    if (!f.codigo.trim() && !f.nomenclatura.trim()) return null // fila vacía: se ignora
    const err = validarCodigo(f.codigo)
    if (err) return err
    if (f.nomenclatura.trim().length < 3) return 'Falta la nomenclatura'
    return null
  }

  // Un código repetido lo rechazaría el índice único de la base; avisar aquí
  // ahorra el viaje de ida y vuelta.
  const duplicados = useMemo(() => {
    const cuenta = new Map<string, number>()
    ;[codigo, ...utiles.map((f) => f.codigo)]
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
      .forEach((c) => cuenta.set(c, (cuenta.get(c) ?? 0) + 1))
    return new Set([...cuenta].filter(([, n]) => n > 1).map(([c]) => c))
  }, [codigo, utiles])

  const valido =
    !errorCodigo &&
    !errorNomenclatura &&
    duplicados.size === 0 &&
    utiles.every((f) => !errorFila(f))

  function actualizar(clave: string, cambios: Partial<Fila>) {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)))
  }

  function quitar(fila: Fila) {
    // Las hijas de la fila borrada suben a colgar de la principal, en vez de
    // quedar apuntando a algo que ya no existe.
    setFilas((prev) =>
      prev
        .filter((f) => f.clave !== fila.clave)
        .map((f) => (f.dependeDe === fila.clave ? { ...f, dependeDe: null } : f)),
    )
    if (fila.id) setEliminadas((prev) => [...prev, fila.id!])
  }

  // ---------------------------------------------------------------------------
  // Guardado
  //
  // Se reutiliza la misma función de importación que usa la carga por CSV: una
  // sola transacción que resuelve la jerarquía por código. Así el editor en
  // línea y el importador comparten camino de escritura, y no hay dos formas
  // distintas de que la estructura acabe mal.
  // ---------------------------------------------------------------------------
  const guardar = useMutation({
    mutationFn: async () => {
      const codigoPrincipal = codigo.trim().toUpperCase()
      const porClave = new Map(filas.map((f) => [f.clave, f.codigo.trim().toUpperCase()]))

      const payload: FilaImportacion[] = [
        {
          codigo: codigoPrincipal,
          nomenclatura: nomenclatura.trim(),
          tipo: 'principal',
          padre_codigo: '',
          estado,
          descripcion: descripcion.trim(),
        },
        ...utiles.map((f) => ({
          codigo: f.codigo.trim().toUpperCase(),
          nomenclatura: f.nomenclatura.trim(),
          tipo: f.tipo,
          padre_codigo: f.dependeDe ? (porClave.get(f.dependeDe) ?? codigoPrincipal) : codigoPrincipal,
          estado,
          descripcion: '',
        })),
      ]

      const { error } = await supabase.rpc('fn_importar_actividades', {
        p_filas: payload,
        p_modo: 'mezclar',
      })
      if (error) throw error

      // Bajas de las filas que el usuario quitó de la tabla
      if (eliminadas.length > 0) {
        const { error: errBorrar } = await supabase
          .from('actividades')
          .delete()
          .in('id', eliminadas)
        if (errBorrar) throw errBorrar
      }

      // Unidades con acceso a la rama
      const { data: principal } = await supabase
        .from('actividades')
        .select('id')
        .eq('codigo', codigoPrincipal)
        .single()

      if (principal) {
        await supabase.from('actividad_vicerrectorias').delete().eq('actividad_id', principal.id)
        if (unidades.size > 0) {
          const { error } = await supabase.from('actividad_vicerrectorias').insert(
            [...unidades].map((vicerrectoria_id) => ({
              actividad_id: principal.id,
              vicerrectoria_id,
            })),
          )
          if (error) throw error
        }
      }
    },
    onSuccess: () => {
      toast.success(
        editando ? 'Rama actualizada' : `Actividad ${codigo.toUpperCase()} creada`,
        { description: `${utiles.length} ${utiles.length === 1 ? 'actividad relacionada' : 'actividades relacionadas'}.` },
      )
      void qc.invalidateQueries({ queryKey: ['actividades'] })
      void qc.invalidateQueries({ queryKey: ['rama'] })
      navigate('/actividades')
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setEnviado(true)
    if (valido) guardar.mutate()
  }

  if (editando && cargandoRama) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        titulo={editando ? `Editar ${rama?.principal.nomenclatura ?? 'rama'}` : 'Nueva actividad principal'}
        descripcion="Define la rama y todas sus actividades relacionadas en una sola pantalla."
        volver={{ a: '/actividades', etiqueta: 'Volver a la estructura' }}
        acciones={
          editando && rama ? (
            <Badge tono={ESTADO_ACTIVIDAD[rama.principal.estado].tono} punto>
              {ESTADO_ACTIVIDAD[rama.principal.estado].etiqueta}
            </Badge>
          ) : undefined
        }
      />

      <form onSubmit={onSubmit} noValidate className="mx-auto flex max-w-4xl flex-col gap-4">
        {/* 1 · Actividad principal -------------------------------------- */}
        <Card>
          <CardHeader
            titulo="1 · Actividad principal"
            descripcion="El nivel raíz. No cuelga de ninguna otra."
            icono={<Network className="size-4" />}
          />
          <div className="grid gap-4 p-4 sm:grid-cols-4">
            <Campo
              etiqueta="Código"
              requerido
              error={enviado ? errorCodigo : null}
              pista={AYUDA_CODIGO}
            >
              {({ id: campoId, describedBy, invalido }) => (
                <Input
                  id={campoId}
                  aria-describedby={describedBy}
                  aria-invalid={invalido}
                  placeholder="ACT-004"
                  autoFocus={!editando}
                  value={codigo}
                  onChange={(e) => setCodigo(normalizarCodigo(e.target.value))}
                />
              )}
            </Campo>

            <Campo
              etiqueta="Nomenclatura oficial"
              requerido
              error={enviado ? errorNomenclatura : null}
              className="sm:col-span-2"
            >
              {({ id: campoId, describedBy, invalido }) => (
                <Input
                  id={campoId}
                  aria-describedby={describedBy}
                  aria-invalid={invalido}
                  placeholder="Ej. Investigación Aplicada"
                  value={nomenclatura}
                  onChange={(e) => setNomenclatura(e.target.value)}
                />
              )}
            </Campo>

            <Campo etiqueta="Estado" pista="Se aplica a toda la rama.">
              {({ id: campoId }) => (
                <Select
                  id={campoId}
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as EstadoActividad)}
                >
                  <option value="activa">Activa</option>
                  <option value="revision">En revisión</option>
                  <option value="borrador">Borrador</option>
                  <option value="archivada">Archivada</option>
                </Select>
              )}
            </Campo>

            <Campo etiqueta="Descripción" className="sm:col-span-4" pista="Opcional.">
              {({ id: campoId, describedBy }) => (
                <Input
                  id={campoId}
                  aria-describedby={describedBy}
                  placeholder="Qué abarca esta rama de la estructura"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              )}
            </Campo>
          </div>

          <div className="border-t border-line p-4">
            <fieldset>
              <legend className="text-label text-fg">Vicerrectorías con acceso</legend>
              <p className="mt-1 text-body-sm text-fg-subtle">
                Determina qué unidades pueden operar sobre esta rama.
              </p>
              <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {vicerrectorias?.map((v) => (
                  <Checkbox
                    key={v.id}
                    etiqueta={v.nombre}
                    checked={unidades.has(v.id)}
                    onChange={(e) =>
                      setUnidades((prev) => {
                        const s = new Set(prev)
                        if (e.target.checked) s.add(v.id)
                        else s.delete(v.id)
                        return s
                      })
                    }
                  />
                ))}
              </div>
            </fieldset>
          </div>
        </Card>

        {/* 2 · Actividades relacionadas -------------------------------- */}
        <Card>
          <CardHeader
            titulo="2 · Actividades relacionadas"
            descripcion="Las directas y de apoyo que cuelgan de esta rama. Se crean y editan aquí mismo."
            icono={<Workflow className="size-4" />}
            acciones={
              <Button
                tamano="sm"
                variante="sutil"
                onClick={() => setFilas((f) => [...f, filaVacia()])}
                iconoIzq={<Plus className="size-3.5" />}
              >
                Agregar fila
              </Button>
            }
          />

          {filas.length === 0 ? (
            <EmptyState
              titulo="Sin actividades relacionadas"
              descripcion="Puedes guardar la rama sola y añadir sus tareas más adelante."
              accion={
                <Button
                  onClick={() => setFilas([filaVacia()])}
                  iconoIzq={<Plus className="size-4" />}
                >
                  Agregar la primera
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left">
                <thead>
                  <tr>
                    {[
                      ['Tipo', 'w-32'],
                      ['Código', 'w-36'],
                      ['Nomenclatura', ''],
                      ['Depende de', 'w-52'],
                    ].map(([titulo, ancho]) => (
                      <th
                        key={titulo}
                        className={cn(
                          'border-b border-line bg-sunken px-3 py-2 text-overline uppercase text-fg-muted',
                          ancho,
                        )}
                      >
                        {titulo}
                      </th>
                    ))}
                    <th className="w-14 border-b border-line bg-sunken px-3 py-2">
                      <span className="sr-only">Quitar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const error = enviado ? errorFila(f) : null
                    const duplicado =
                      f.codigo.trim() && duplicados.has(f.codigo.trim().toUpperCase())

                    return (
                      <tr
                        key={f.clave}
                        className={cn(
                          'border-b border-line last:border-0',
                          (error || duplicado) && 'bg-danger-soft/30',
                        )}
                      >
                        <td className="px-3 py-1.5">
                          <Select
                            aria-label={`Tipo de la fila ${i + 1}`}
                            value={f.tipo}
                            onChange={(e) =>
                              actualizar(f.clave, { tipo: e.target.value as TipoActividad })
                            }
                          >
                            <option value="directa">Directa</option>
                            <option value="apoyo">De apoyo</option>
                          </Select>
                        </td>

                        <td className="px-3 py-1.5">
                          <Input
                            aria-label={`Código de la fila ${i + 1}`}
                            aria-invalid={Boolean(error || duplicado)}
                            placeholder="SUB-00X"
                            className="font-mono"
                            value={f.codigo}
                            onChange={(e) =>
                              actualizar(f.clave, { codigo: normalizarCodigo(e.target.value) })
                            }
                          />
                        </td>

                        <td className="px-3 py-1.5">
                          <Input
                            aria-label={`Nomenclatura de la fila ${i + 1}`}
                            aria-invalid={Boolean(error)}
                            placeholder="Describe la actividad…"
                            value={f.nomenclatura}
                            onChange={(e) => actualizar(f.clave, { nomenclatura: e.target.value })}
                          />
                        </td>

                        {/* Permite el tercer nivel sin salir de la tabla: una
                            actividad de apoyo puede colgar de una directa. */}
                        <td className="px-3 py-1.5">
                          <Select
                            aria-label={`De qué depende la fila ${i + 1}`}
                            value={f.dependeDe ?? ''}
                            onChange={(e) =>
                              actualizar(f.clave, { dependeDe: e.target.value || null })
                            }
                          >
                            <option value="">
                              {codigo.trim() || 'Actividad principal'}
                            </option>
                            {filas
                              // Ni de sí misma, ni de una fila sin código todavía
                              .filter((o) => o.clave !== f.clave && o.codigo.trim())
                              .map((o) => (
                                <option key={o.clave} value={o.clave}>
                                  {o.codigo} · {o.nomenclatura || 'sin nombre'}
                                </option>
                              ))}
                          </Select>
                        </td>

                        <td className="px-3 py-1.5 text-right">
                          <Button
                            tamano="sm"
                            variante="fantasma"
                            soloIcono
                            aria-label={`Quitar la fila ${i + 1}`}
                            title={f.id ? 'Eliminar del sistema al guardar' : 'Quitar fila'}
                            onClick={() => quitar(f)}
                            className="text-fg-subtle hover:bg-danger-soft hover:text-danger-softFg"
                            iconoIzq={<Trash2 className="size-4" />}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Aviso de bajas pendientes, con vuelta atrás: quitar una fila que
              ya existe en la base es destructivo y no debe pasar inadvertido. */}
          {eliminadas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-warning-soft px-4 py-2.5 text-body-sm text-warning-softFg">
              <span>
                {eliminadas.length}{' '}
                {eliminadas.length === 1 ? 'actividad se eliminará' : 'actividades se eliminarán'} al
                guardar, junto con lo que cuelgue de ellas.
              </span>
              <Button
                tamano="sm"
                variante="fantasma"
                className="ml-auto"
                onClick={() => {
                  setEliminadas([])
                  setCargado(false) // repuebla la tabla desde la base
                }}
                iconoIzq={<Undo2 className="size-3.5" />}
              >
                Deshacer
              </Button>
            </div>
          )}

          <div className="flex items-start gap-2 border-t border-line px-4 py-3">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
            <p className="text-body-sm text-fg-subtle">
              Los códigos son únicos en todo el sistema. Las filas vacías se descartan al guardar.
              Para cargar muchas de golpe, usa la{' '}
              <a href="/actividades/importar" className="text-primary underline-offset-4 hover:underline">
                importación por CSV
              </a>
              .
            </p>
          </div>
        </Card>

        {enviado && duplicados.size > 0 && (
          <p
            role="alert"
            className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-body-sm text-danger-softFg"
          >
            Hay códigos repetidos: {[...duplicados].join(', ')}.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => navigate('/actividades')}>Cancelar</Button>
          <Button
            type="submit"
            variante="primario"
            cargando={guardar.isPending}
            iconoIzq={<Save className="size-4" />}
          >
            {editando ? 'Guardar cambios' : 'Guardar actividad'}
          </Button>
        </div>
      </form>
    </>
  )
}
