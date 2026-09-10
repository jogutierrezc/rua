import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Briefcase,
  Download,
  FileDown,
  GraduationCap,
  MailCheck,
  Plus,
  Search,
  Table2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { fmtNumero } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { Input, Select } from '@/components/ui/Field'
import {
  Badge,
  Card,
  EmptyState,
  Pagination,
  Skeleton,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/AuthProvider'
import { DialogoContacto } from './DialogoContacto'
import { DialogoExportar } from './DialogoExportar'
import { DialogoPlantillas } from './DialogoPlantillas'
import { DialogoDetalleContacto } from './DialogoDetalleContacto'
import { useCatalogo, usePaises, paisesPorRegion } from './useCatalogos'
import { useVerificacion } from './useVerificacion'
import { ESTADO_VERIFICACION, ESTADOS_VERIFICACION, ORIGEN_CONTACTO } from './dominio'
import type {
  ContactoDetalleRow,
  EstadoVerificacion,
  TipoContactoInternacional,
} from '@/types/database'

const POR_PAGINA = 20

/** Tope de la exportación. Más que esto no es una hoja: es una copia de la tabla. */
const MAX_EXPORTAR = 2_000

type Origen = TipoContactoInternacional | 'todos'

interface Filtros {
  busqueda: string
  pais: string
  rol: string
  sector: string
  verificacion: EstadoVerificacion | 'todas' | 'atencion'
  origen: Origen
}

const FILTROS_INICIALES: Filtros = {
  busqueda: '',
  pais: 'todos',
  rol: 'todos',
  sector: 'todos',
  verificacion: 'todas',
  origen: 'todos',
}

/**
 * Las plantillas, como pestañas y no como un desplegable más.
 *
 * Es la primera pregunta que se le hace a esta libreta —«enséñame los
 * académicos»—, y una pregunta que se hace siempre no puede quedar escondida
 * entre cinco filtros que se usan de vez en cuando. Además llevan el recuento:
 * así la pantalla dice cuántos hay de cada clase sin obligar a entrar en cada
 * una para averiguarlo.
 */
const PESTANAS: { codigo: Origen; nombre: string; icono: typeof Users }[] = [
  { codigo: 'todos', nombre: 'Todos', icono: Users },
  { codigo: 'academico', nombre: 'Académicos', icono: GraduationCap },
  { codigo: 'empleador', nombre: 'Empleadores', icono: Briefcase },
  { codigo: 'general', nombre: 'Alta manual', icono: Table2 },
]

const ICONO_ORIGEN: Record<TipoContactoInternacional, typeof Users> = {
  academico: GraduationCap,
  empleador: Briefcase,
  general: Table2,
}

/**
 * Lo que el aplicador de filtros necesita de un constructor de consultas.
 *
 * Se describe por su FORMA y no por el tipo de PostgREST para no tener que
 * importar sus genéricos: lo que hay que garantizar es que la tabla, los
 * recuentos y la exportación filtren exactamente igual, y para eso basta con que
 * los tres pasen por esta función. Tres cadenas de filtros escritas por separado
 * acaban discrepando el día que se añade una y se olvidan las otras.
 */
interface Encadenable {
  eq(columna: string, valor: string): this
  in(columna: string, valores: string[]): this
  or(filtros: string): this
}

function aplicarFiltros<T extends Encadenable>(consulta: T, f: Filtros): T {
  let q = consulta

  if (f.pais !== 'todos') q = q.eq('pais_codigo', f.pais)
  if (f.rol !== 'todos') q = q.eq('rol_id', f.rol)
  if (f.sector !== 'todos') q = q.eq('sector_id', f.sector)
  if (f.origen !== 'todos') q = q.eq('tipo_contacto', f.origen)

  // «Requieren atención» agrupa lo que hay que arreglar: lo que rebota y lo que
  // puede rebotar. Es la pregunta con la que se entra a esta pantalla después de
  // una carga masiva.
  if (f.verificacion === 'atencion') {
    q = q.in('verificacion_estado', ['invalido', 'riesgoso'])
  } else if (f.verificacion !== 'todas') {
    q = q.eq('verificacion_estado', f.verificacion)
  }

  if (f.busqueda.trim()) {
    const t = `%${f.busqueda.trim()}%`
    q = q.or(
      `nombre_completo.ilike.${t},correo.ilike.${t},organizacion.ilike.${t},cargo.ilike.${t}`,
    )
  }

  return q
}

/** El distintivo de la plantilla de origen. Se repite en la tabla y en las fichas. */
function SelloOrigen({ tipo, className }: { tipo: TipoContactoInternacional; className?: string }) {
  const Icono = ICONO_ORIGEN[tipo]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-body-sm',
        tipo === 'general' ? 'text-fg-subtle' : 'text-fg-muted',
        className,
      )}
    >
      <Icono aria-hidden className="size-3.5 shrink-0" />
      {ORIGEN_CONTACTO[tipo]}
    </span>
  )
}

export function ContactosPage() {
  const { puede } = useAuth()
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES)
  const [pagina, setPagina] = useState(0)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())

  const [detalle, setDetalle] = useState<ContactoDetalleRow | null>(null)
  const [editando, setEditando] = useState<ContactoDetalleRow | null>(null)
  const [creando, setCreando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [viendoPlantillas, setViendoPlantillas] = useState(false)

  const { data: paises } = usePaises()
  const { data: roles } = useCatalogo('rol')
  const { data: sectores } = useCatalogo('sector')
  const { verificar, progreso, resumir } = useVerificacion()

  const puedeAdministrar = puede('internacionalizacion.administrar')
  const puedeVerificar = puede('internacionalizacion.verificar')

  /**
   * Cuántos hay en cada pestaña.
   *
   * Cuenta con TODOS los filtros menos el de la pestaña: si estás mirando
   * Colombia, los números tienen que decir cuántos académicos y cuántos
   * empleadores hay en Colombia, no en el mundo. Por eso la clave de la consulta
   * fija `origen` en «todos»: cambiar de pestaña no los vuelve a pedir.
   */
  const filtrosSinOrigen: Filtros = { ...filtros, origen: 'todos' }

  const { data: conteos } = useQuery({
    queryKey: ['contactos', 'conteos-origen', filtrosSinOrigen],
    queryFn: async () => {
      const entradas = await Promise.all(
        PESTANAS.map(async ({ codigo }) => {
          let q = aplicarFiltros(
            supabase
              .from('v_contactos_internacionales')
              .select('id', { count: 'exact', head: true })
              .eq('estado', 'activo'),
            filtrosSinOrigen,
          )
          if (codigo !== 'todos') q = q.eq('tipo_contacto', codigo)

          const { count, error } = await q
          if (error) throw error
          return [codigo, count ?? 0] as const
        }),
      )
      return Object.fromEntries(entradas) as Record<Origen, number>
    },
    placeholderData: (prev) => prev,
  })

  const { data, isPending } = useQuery({
    queryKey: ['contactos', filtros, pagina],
    queryFn: async () => {
      const q = aplicarFiltros(
        supabase
          .from('v_contactos_internacionales')
          .select('*', { count: 'exact' })
          .eq('estado', 'activo'),
        filtros,
      )
        .order('nombre_completo')
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)

      const { data, error, count } = await q
      if (error) throw error
      return { filas: (data ?? []) as ContactoDetalleRow[], total: count ?? 0 }
    },
    placeholderData: (prev) => prev,
  })

  /**
   * Trae lo que hay que exportar.
   *
   * Vive aquí y no en el diálogo porque los filtros son de esta pantalla: lo que
   * se exporta tiene que ser exactamente lo que se está viendo, y esa promesa se
   * rompe en cuanto el diálogo construye su propia consulta.
   */
  const cargarParaExportar = async (tipo: 'academico' | 'empleador' | null) => {
    let q = aplicarFiltros(
      supabase.from('v_contactos_internacionales').select('*').eq('estado', 'activo'),
      filtros,
    )
    if (tipo) q = q.eq('tipo_contacto', tipo)

    const { data, error } = await q.order('nombre_completo').limit(MAX_EXPORTAR)
    if (error) throw error
    return (data ?? []) as ContactoDetalleRow[]
  }

  const filas = data?.filas ?? []
  const seleccionados = [...seleccion]
  const hayFiltros = (Object.keys(filtros) as (keyof Filtros)[]).some(
    (k) => filtros[k] !== FILTROS_INICIALES[k],
  )
  const todosMarcados = filas.length > 0 && filas.every((c) => seleccion.has(c.id))

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const alternarPagina = () =>
    setSeleccion((s) => {
      const n = new Set(s)
      // Marca la página entera, o la desmarca si ya lo estaba. La selección de
      // otras páginas no se toca: se acumula a propósito, porque verificar suele
      // hacerse recorriendo varias.
      if (todosMarcados) filas.forEach((c) => n.delete(c.id))
      else filas.forEach((c) => n.add(c.id))
      return n
    })

  const lanzarVerificacion = () => {
    verificar.mutate(
      { ids: seleccionados },
      {
        onSuccess: (r) => {
          toast.success(`Verificación terminada · ${resumir(r)}`)
          setSeleccion(new Set())
        },
        onError: (e) => toast.error(mensajeDeError(e)),
      },
    )
  }

  const cambiarFiltro = (parcial: Partial<Filtros>) => {
    setFiltros((f) => ({ ...f, ...parcial }))
    setPagina(0)
  }

  const casilla = (c: ContactoDetalleRow) => (
    <input
      type="checkbox"
      aria-label={`Seleccionar a ${c.nombre_completo}`}
      checked={seleccion.has(c.id)}
      onChange={() => alternar(c.id)}
      className="size-4 cursor-pointer rounded-sm border-line-strong accent-primary"
    />
  )

  return (
    <>
      <PageHeader
        titulo="Contactos internacionales"
        descripcion="A quién conoce la Universidad fuera: quién es, de qué plantilla vino y si su correo sigue sirviendo."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setViendoPlantillas(true)}
              iconoIzq={<FileDown className="size-4" />}
            >
              Plantillas
            </Button>
            <Button onClick={() => setExportando(true)} iconoIzq={<Download className="size-4" />}>
              Exportar
            </Button>
            {puedeAdministrar && (
              <>
                <LinkButton
                  to="/internacionalizacion/importar"
                  iconoIzq={<Upload className="size-4" />}
                >
                  Importar
                </LinkButton>
                <Button
                  variante="primario"
                  onClick={() => setCreando(true)}
                  iconoIzq={<Plus className="size-4" />}
                >
                  Nuevo contacto
                </Button>
              </>
            )}
          </div>
        }
      />

      <Card>
        {/* Pestañas por plantilla --------------------------------------- */}
        <div
          role="tablist"
          aria-label="Plantilla de origen"
          className="flex flex-wrap items-center gap-1 border-b border-line p-2"
        >
          {PESTANAS.map((p) => {
            const Icono = p.icono
            const activa = filtros.origen === p.codigo
            const cuenta = conteos?.[p.codigo]
            return (
              <button
                key={p.codigo}
                role="tab"
                aria-selected={activa}
                onClick={() => cambiarFiltro({ origen: p.codigo })}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-label',
                  'transition-colors duration-fast ease-out',
                  activa
                    ? 'bg-primary-soft text-primary-softFg'
                    : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                <Icono aria-hidden className="size-4 shrink-0" />
                {p.nombre}
                {cuenta === undefined ? (
                  <Skeleton className="h-3.5 w-6" />
                ) : (
                  <span
                    className={cn(
                      'tabular text-body-sm',
                      activa ? 'text-primary-softFg' : 'text-fg-subtle',
                    )}
                  >
                    {fmtNumero.format(cuenta)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Filtros ------------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[13rem] flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              aria-label="Buscar contactos"
              placeholder="Nombre, correo, cargo u organización…"
              className="pl-8"
              value={filtros.busqueda}
              onChange={(e) => cambiarFiltro({ busqueda: e.target.value })}
            />
          </div>

          <Select
            aria-label="País"
            className="w-auto"
            value={filtros.pais}
            onChange={(e) => cambiarFiltro({ pais: e.target.value })}
          >
            <option value="todos">Todos los países</option>
            {paisesPorRegion(paises ?? []).map(([region, lista]) => (
              <optgroup key={region} label={region}>
                {lista.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>

          <Select
            aria-label="Rol"
            className="w-auto"
            value={filtros.rol}
            onChange={(e) => cambiarFiltro({ rol: e.target.value })}
          >
            <option value="todos">Todos los roles</option>
            {(roles ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.etiqueta}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Sector"
            className="w-auto"
            value={filtros.sector}
            onChange={(e) => cambiarFiltro({ sector: e.target.value })}
          >
            <option value="todos">Todos los sectores</option>
            {(sectores ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.etiqueta}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Estado de verificación"
            className="w-auto"
            value={filtros.verificacion}
            onChange={(e) =>
              cambiarFiltro({ verificacion: e.target.value as Filtros['verificacion'] })
            }
          >
            <option value="todas">Cualquier verificación</option>
            <option value="atencion">Requieren atención</option>
            {ESTADOS_VERIFICACION.map((k) => (
              <option key={k} value={k}>
                {ESTADO_VERIFICACION[k].etiqueta}
              </option>
            ))}
          </Select>
        </div>

        {/* Barra de selección ------------------------------------------- */}
        {puedeVerificar && seleccionados.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-primary-soft px-4 py-2.5">
            <p className="text-body-sm text-primary-softFg">
              {fmtNumero.format(seleccionados.length)}{' '}
              {seleccionados.length === 1 ? 'contacto seleccionado' : 'contactos seleccionados'}
              {progreso && (
                <span className="ml-2 tabular">
                  · verificando {fmtNumero.format(progreso.hechos)} de{' '}
                  {fmtNumero.format(progreso.total)}
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                tamano="sm"
                variante="fantasma"
                onClick={() => setSeleccion(new Set())}
                iconoIzq={<X className="size-4" />}
              >
                Quitar selección
              </Button>
              <Button
                tamano="sm"
                variante="primario"
                cargando={verificar.isPending}
                onClick={lanzarVerificacion}
                iconoIzq={<MailCheck className="size-4" />}
              >
                Verificar correos
              </Button>
            </div>
          </div>
        )}

        {/* Los datos ---------------------------------------------------- */}
        {isPending ? (
          <TableSkeleton filas={8} columnas={4} />
        ) : filas.length === 0 ? (
          <EmptyState
            titulo="Ningún contacto con esos criterios"
            descripcion="Prueba con otra plantilla, amplía el país o borra el término de búsqueda."
            accion={
              hayFiltros ? (
                <Button onClick={() => setFiltros(FILTROS_INICIALES)}>Quitar los filtros</Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Fichas — en pantallas estrechas.
                Una tabla de siete columnas apretada en un móvil no se lee, y
                dejarla desbordar esconde columnas sin avisar de que existen. Aquí
                la misma información se apila: lo que en la tabla son columnas,
                aquí son líneas. */}
            <ul className="divide-y divide-line md:hidden">
              {filas.map((c) => {
                const ver = ESTADO_VERIFICACION[c.verificacion_estado]
                return (
                  <li
                    key={c.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3',
                      c.verificacion_estado === 'invalido' && 'border-l-2 border-l-danger',
                      c.verificacion_estado === 'riesgoso' && 'border-l-2 border-l-warning',
                    )}
                  >
                    {puedeVerificar && <span className="pt-1">{casilla(c)}</span>}

                    <button
                      onClick={() => setDetalle(c)}
                      className="min-w-0 flex-1 text-left"
                      aria-label={`Ver la ficha de ${c.nombre_completo}`}
                    >
                      <span className="block truncate font-medium text-fg">
                        {c.nombre_completo}
                      </span>
                      <span className="block truncate text-body-sm text-fg-subtle">{c.cargo}</span>
                      <span className="mt-0.5 block truncate text-body-sm text-fg-muted">
                        {c.organizacion ?? '—'}
                        {c.pais_nombre ? ` · ${c.pais_nombre}` : ''}
                      </span>
                      <span className="mt-1 block truncate font-mono text-body-sm text-fg-muted">
                        {c.correo}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2">
                        <SelloOrigen tipo={c.tipo_contacto} />
                        <Badge tono={ver.tono} punto>
                          {ver.etiqueta}
                        </Badge>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* Tabla — desde tabletas.
                Las columnas entran donde de verdad caben, que no es donde
                parecería. La barra lateral aparece en `lg` y se lleva 17 rem, así
                que a 1024 px la tabla tiene MENOS sitio que a 768: por eso la
                organización espera a `xl`, y el rol y el sector a `2xl`. Sin ancho
                mínimo, porque la tabla ya sabe encogerse — el scroll lateral es el
                último recurso, no el primero. */}
            <div className="hidden md:block">
              <TableShell anchoMinimo="min-w-0">
                <thead>
                  <tr>
                    {puedeVerificar && (
                      <Th className="w-10">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar toda la página"
                          checked={todosMarcados}
                          onChange={alternarPagina}
                          className="size-4 cursor-pointer rounded-sm border-line-strong accent-primary"
                        />
                      </Th>
                    )}
                    <Th>Contacto</Th>
                    <Th className="w-36">Origen</Th>
                    <Th className="hidden w-48 xl:table-cell">Organización</Th>
                    <Th className="hidden w-36 2xl:table-cell">Rol</Th>
                    <Th className="hidden w-36 2xl:table-cell">Sector</Th>
                    <Th className="w-56">Correo</Th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((c) => {
                    const ver = ESTADO_VERIFICACION[c.verificacion_estado]
                    return (
                      <Tr
                        key={c.id}
                        onClick={() => setDetalle(c)}
                        className={cn(
                          'cursor-pointer',
                          c.verificacion_estado === 'invalido' && 'border-l-2 border-l-danger',
                          c.verificacion_estado === 'riesgoso' && 'border-l-2 border-l-warning',
                        )}
                      >
                        {puedeVerificar && (
                          <Td onClick={(e) => e.stopPropagation()}>{casilla(c)}</Td>
                        )}

                        <Td className="max-w-0">
                          <span className="block truncate font-medium text-fg">
                            {c.nombre_completo}
                          </span>
                          {/* El país viaja con el cargo mientras no haya sitio
                              para su columna: es de lo primero que se mira en un
                              directorio internacional, y no puede desaparecer sin
                              más al estrechar la ventana. */}
                          <span className="block truncate text-body-sm text-fg-subtle">
                            {c.cargo}
                            <span className="xl:hidden">
                              {c.pais_nombre ? ` · ${c.pais_nombre}` : ''}
                            </span>
                          </span>
                        </Td>

                        <Td>
                          <SelloOrigen tipo={c.tipo_contacto} />
                        </Td>

                        <Td className="hidden max-w-0 text-fg-muted xl:table-cell">
                          <span className="block truncate">{c.organizacion ?? '—'}</span>
                          <span className="block truncate text-body-sm text-fg-subtle">
                            {c.pais_nombre ?? 'Sin país'}
                          </span>
                        </Td>

                        <Td className="hidden max-w-0 text-fg-muted 2xl:table-cell">
                          <span className="block truncate">{c.rol_etiqueta ?? '—'}</span>
                        </Td>

                        <Td className="hidden max-w-0 text-fg-muted 2xl:table-cell">
                          <span className="block truncate">{c.sector_etiqueta ?? '—'}</span>
                        </Td>

                        <Td className="max-w-0">
                          <span className="block truncate font-mono text-body-sm text-fg-muted">
                            {c.correo}
                          </span>
                          <Badge tono={ver.tono} punto className="mt-0.5">
                            {ver.etiqueta}
                          </Badge>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </TableShell>
            </div>

            <Pagination
              pagina={pagina}
              porPagina={POR_PAGINA}
              total={data?.total ?? 0}
              onPagina={setPagina}
            />
          </>
        )}
      </Card>

      {detalle && (
        <DialogoDetalleContacto
          contacto={detalle}
          onCerrar={() => setDetalle(null)}
          onEditar={
            puedeAdministrar
              ? () => {
                  setEditando(detalle)
                  setDetalle(null)
                }
              : undefined
          }
        />
      )}

      {viendoPlantillas && <DialogoPlantillas onCerrar={() => setViendoPlantillas(false)} />}

      {exportando && (
        <DialogoExportar
          onCerrar={() => setExportando(false)}
          cargarContactos={cargarParaExportar}
        />
      )}

      {(creando || editando) && (
        <DialogoContacto
          contacto={editando}
          onCerrar={() => {
            setCreando(false)
            setEditando(null)
          }}
        />
      )}
    </>
  )
}
