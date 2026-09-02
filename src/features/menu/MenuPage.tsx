import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Info,
  PanelLeft,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { iconoDe, NOMBRES_ICONO } from '@/lib/iconos'
import { RUTAS_MENU, rutaDelCatalogo } from '@/lib/rutas'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Campo, Input, Select } from '@/components/ui/Field'
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import type { MenuEntradaRow, MenuGrupoRow } from '@/types/database'

interface EntradaBorrador {
  codigo: string
  etiqueta: string
  ruta: string
  icono: string
  permiso_codigo: string | null
  visible: boolean
  coincidencia_exacta: boolean
  es_sistema: boolean
}

interface GrupoBorrador {
  codigo: string
  titulo: string
  activo: boolean
  es_sistema: boolean
  entradas: EntradaBorrador[]
}

type GrupoConEntradas = MenuGrupoRow & { menu_entradas: MenuEntradaRow[] }

/**
 * Código estable a partir de un texto. Sin tildes, sin espacios, minúsculas.
 *
 * Puede devolver cadena vacía —la ruta raíz es sólo «/»—, y el respaldo lo pone
 * quien llama: un grupo y una entrada no se llaman igual cuando no hay nada de
 * lo que tirar.
 */
function aCodigo(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function mover<T>(lista: T[], desde: number, hasta: number): T[] {
  if (hasta < 0 || hasta >= lista.length) return lista
  const copia = [...lista]
  const [x] = copia.splice(desde, 1)
  copia.splice(hasta, 0, x)
  return copia
}

// -----------------------------------------------------------------------------
export function MenuPage() {
  const qc = useQueryClient()

  const { data, isPending } = useQuery({
    queryKey: ['menu', 'configuracion'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_grupos')
        .select('*, menu_entradas(*)')
        .order('orden')
      if (error) throw error
      return (data ?? []) as unknown as GrupoConEntradas[]
    },
  })

  const [borrador, setBorrador] = useState<GrupoBorrador[] | null>(null)
  const [gruposBorrados, setGruposBorrados] = useState<string[]>([])
  const [entradasBorradas, setEntradasBorradas] = useState<string[]>([])

  useEffect(() => {
    if (!data || borrador) return
    setBorrador(
      data.map((g) => ({
        codigo: g.codigo,
        titulo: g.titulo,
        activo: g.activo,
        es_sistema: g.es_sistema,
        entradas: [...(g.menu_entradas ?? [])]
          .sort((a, b) => a.orden - b.orden || a.etiqueta.localeCompare(b.etiqueta))
          .map((e) => ({
            codigo: e.codigo,
            etiqueta: e.etiqueta,
            ruta: e.ruta,
            icono: e.icono,
            permiso_codigo: e.permiso_codigo,
            visible: e.visible,
            coincidencia_exacta: e.coincidencia_exacta,
            es_sistema: e.es_sistema,
          })),
      })),
    )
  }, [data, borrador])

  // Rutas del catálogo que todavía no están en ningún grupo. Escribir la ruta
  // a mano permitiría guardar un enlace a ninguna parte, y el fallo aparecería
  // en el menú de todos, no en el de quien se equivocó.
  const disponibles = useMemo(() => {
    const usadas = new Set((borrador ?? []).flatMap((g) => g.entradas.map((e) => e.ruta)))
    return RUTAS_MENU.filter((r) => !usadas.has(r.ruta))
  }, [borrador])

  const guardar = useMutation({
    mutationFn: async (grupos: GrupoBorrador[]) => {
      // El orden se deriva de la posición: mover una fila arriba no obliga a
      // renumerar nada a mano, y no hay índice único que pueda chocar a mitad.
      const filasGrupo = grupos.map((g, i) => ({
        codigo: g.codigo,
        titulo: g.titulo.trim(),
        orden: i + 1,
        activo: g.activo,
        es_sistema: g.es_sistema,
      }))

      const filasEntrada = grupos.flatMap((g, gi) =>
        g.entradas.map((e, i) => ({
          codigo: e.codigo,
          grupo_codigo: g.codigo,
          etiqueta: e.etiqueta.trim(),
          ruta: e.ruta,
          icono: e.icono,
          permiso_codigo: e.permiso_codigo,
          // Se numera dentro del grupo; el grupo ya aporta su propio orden.
          orden: gi * 100 + i + 1,
          visible: e.visible,
          coincidencia_exacta: e.coincidencia_exacta,
          es_sistema: e.es_sistema,
        })),
      )

      // Primero los grupos: una entrada no puede apuntar a un grupo que aún no
      // existe, y las borradas se van antes de que su grupo desaparezca.
      if (entradasBorradas.length) {
        const { error } = await supabase
          .from('menu_entradas')
          .delete()
          .in('codigo', entradasBorradas)
        if (error) throw error
      }

      const { error: errG } = await supabase.from('menu_grupos').upsert(filasGrupo)
      if (errG) throw errG

      const { error: errE } = await supabase.from('menu_entradas').upsert(filasEntrada)
      if (errE) throw errE

      if (gruposBorrados.length) {
        const { error } = await supabase.from('menu_grupos').delete().in('codigo', gruposBorrados)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Menú actualizado', {
        description: 'Los cambios se ven en la barra lateral al instante.',
      })
      setGruposBorrados([])
      setEntradasBorradas([])
      void qc.invalidateQueries({ queryKey: ['menu'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  if (isPending || !borrador) {
    return (
      <>
        <PageHeader titulo="Menú y Navegación" />
        <Skeleton className="h-96" />
      </>
    )
  }

  const set = (fn: (g: GrupoBorrador[]) => GrupoBorrador[]) => setBorrador((b) => fn(b ?? []))

  const editarGrupo = (i: number, cambio: Partial<GrupoBorrador>) =>
    set((g) => g.map((x, j) => (j === i ? { ...x, ...cambio } : x)))

  const editarEntrada = (gi: number, ei: number, cambio: Partial<EntradaBorrador>) =>
    set((g) =>
      g.map((x, j) =>
        j === gi
          ? { ...x, entradas: x.entradas.map((e, k) => (k === ei ? { ...e, ...cambio } : e)) }
          : x,
      ),
    )

  function anadirGrupo() {
    const titulo = 'Nuevo grupo'
    let codigo = aCodigo(titulo) || 'grupo'
    let i = 2
    while (borrador!.some((g) => g.codigo === codigo)) codigo = `${aCodigo(titulo) || 'grupo'}-${i++}`
    set((g) => [...g, { codigo, titulo, activo: true, es_sistema: false, entradas: [] }])
  }

  function anadirEntrada(gi: number, ruta: string) {
    const cat = rutaDelCatalogo(ruta)
    if (!cat) return
    set((g) =>
      g.map((x, j) =>
        j === gi
          ? {
              ...x,
              entradas: [
                ...x.entradas,
                {
                  codigo: aCodigo(ruta) || 'inicio',
                  etiqueta: cat.etiqueta,
                  ruta: cat.ruta,
                  icono: cat.icono,
                  // Del catálogo, no de la pantalla: tiene que seguir
                  // coincidiendo con lo que exige la guarda de la ruta.
                  permiso_codigo: cat.permiso,
                  visible: true,
                  coincidencia_exacta: Boolean(cat.exacta),
                  es_sistema: false,
                },
              ],
            }
          : x,
      ),
    )
  }

  function quitarEntrada(gi: number, ei: number) {
    const e = borrador![gi].entradas[ei]
    setEntradasBorradas((b) => [...b, e.codigo])
    set((g) =>
      g.map((x, j) => (j === gi ? { ...x, entradas: x.entradas.filter((_, k) => k !== ei) } : x)),
    )
  }

  function quitarGrupo(gi: number) {
    const g = borrador![gi]
    setGruposBorrados((b) => [...b, g.codigo])
    setEntradasBorradas((b) => [...b, ...g.entradas.map((e) => e.codigo)])
    set((gs) => gs.filter((_, j) => j !== gi))
  }

  return (
    <>
      <PageHeader
        titulo="Menú y Navegación"
        descripcion="Organiza la barra lateral: renombra, reordena, agrupa y esconde lo que la institución todavía no usa."
        acciones={
          <Button
            variante="primario"
            cargando={guardar.isPending}
            onClick={() => guardar.mutate(borrador)}
            iconoIzq={<Save className="size-4" />}
          >
            Guardar menú
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="flex flex-col gap-4">
          {borrador.map((grupo, gi) => (
            <Card key={grupo.codigo}>
              <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
                <Campo etiqueta="Grupo" className="min-w-[12rem] flex-1">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={grupo.titulo}
                      onChange={(e) => editarGrupo(gi, { titulo: e.target.value })}
                    />
                  )}
                </Campo>

                <div className="flex items-center gap-1">
                  <Button
                    tamano="sm"
                    soloIcono
                    aria-label={`Subir el grupo ${grupo.titulo}`}
                    disabled={gi === 0}
                    onClick={() => set((g) => mover(g, gi, gi - 1))}
                    iconoIzq={<ChevronUp className="size-4" />}
                  />
                  <Button
                    tamano="sm"
                    soloIcono
                    aria-label={`Bajar el grupo ${grupo.titulo}`}
                    disabled={gi === borrador.length - 1}
                    onClick={() => set((g) => mover(g, gi, gi + 1))}
                    iconoIzq={<ChevronDown className="size-4" />}
                  />
                  <Button
                    tamano="sm"
                    variante={grupo.activo ? 'sutil' : 'fantasma'}
                    onClick={() => editarGrupo(gi, { activo: !grupo.activo })}
                    iconoIzq={
                      grupo.activo ? <Eye className="size-4" /> : <EyeOff className="size-4" />
                    }
                  >
                    {grupo.activo ? 'Visible' : 'Oculto'}
                  </Button>
                  {!grupo.es_sistema && (
                    <Button
                      tamano="sm"
                      variante="peligro"
                      soloIcono
                      aria-label={`Eliminar el grupo ${grupo.titulo}`}
                      onClick={() => quitarGrupo(gi)}
                      iconoIzq={<Trash2 className="size-4" />}
                    />
                  )}
                </div>
              </div>

              <ul className="divide-y divide-line">
                {grupo.entradas.map((entrada, ei) => {
                  const Icono = iconoDe(entrada.icono)
                  return (
                    <li key={entrada.codigo} className="grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto]">
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-muted">
                        <Icono aria-hidden className="size-4" />
                      </span>

                      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <Campo etiqueta="Etiqueta">
                          {({ id }) => (
                            <Input
                              id={id}
                              value={entrada.etiqueta}
                              onChange={(e) =>
                                editarEntrada(gi, ei, { etiqueta: e.target.value })
                              }
                            />
                          )}
                        </Campo>

                        <Campo etiqueta="Icono">
                          {({ id }) => (
                            <Select
                              id={id}
                              value={entrada.icono}
                              onChange={(e) => editarEntrada(gi, ei, { icono: e.target.value })}
                            >
                              {NOMBRES_ICONO.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </Select>
                          )}
                        </Campo>

                        <Campo etiqueta="Grupo">
                          {({ id }) => (
                            <Select
                              id={id}
                              value={grupo.codigo}
                              onChange={(e) => {
                                const destino = borrador.findIndex(
                                  (g) => g.codigo === e.target.value,
                                )
                                if (destino < 0 || destino === gi) return
                                set((gs) =>
                                  gs.map((x, j) =>
                                    j === gi
                                      ? { ...x, entradas: x.entradas.filter((_, k) => k !== ei) }
                                      : j === destino
                                        ? { ...x, entradas: [...x.entradas, entrada] }
                                        : x,
                                  ),
                                )
                              }}
                            >
                              {borrador.map((g) => (
                                <option key={g.codigo} value={g.codigo}>
                                  {g.titulo}
                                </option>
                              ))}
                            </Select>
                          )}
                        </Campo>

                        <div className="flex flex-col justify-end">
                          <p className="text-body-sm text-fg-subtle">
                            <span className="font-mono">{entrada.ruta}</span>
                          </p>
                          <p className="text-body-sm text-fg-subtle">
                            Permiso: {entrada.permiso_codigo ?? 'ninguno'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-1">
                        <Button
                          tamano="sm"
                          soloIcono
                          aria-label={`Subir ${entrada.etiqueta}`}
                          disabled={ei === 0}
                          onClick={() =>
                            set((g) =>
                              g.map((x, j) =>
                                j === gi ? { ...x, entradas: mover(x.entradas, ei, ei - 1) } : x,
                              ),
                            )
                          }
                          iconoIzq={<ChevronUp className="size-4" />}
                        />
                        <Button
                          tamano="sm"
                          soloIcono
                          aria-label={`Bajar ${entrada.etiqueta}`}
                          disabled={ei === grupo.entradas.length - 1}
                          onClick={() =>
                            set((g) =>
                              g.map((x, j) =>
                                j === gi ? { ...x, entradas: mover(x.entradas, ei, ei + 1) } : x,
                              ),
                            )
                          }
                          iconoIzq={<ChevronDown className="size-4" />}
                        />
                        <Button
                          tamano="sm"
                          variante={entrada.visible ? 'sutil' : 'fantasma'}
                          aria-label={
                            entrada.visible
                              ? `Esconder ${entrada.etiqueta}`
                              : `Mostrar ${entrada.etiqueta}`
                          }
                          onClick={() => editarEntrada(gi, ei, { visible: !entrada.visible })}
                          iconoIzq={
                            entrada.visible ? (
                              <Eye className="size-4" />
                            ) : (
                              <EyeOff className="size-4" />
                            )
                          }
                        />
                        {!entrada.es_sistema && (
                          <Button
                            tamano="sm"
                            variante="peligro"
                            soloIcono
                            aria-label={`Quitar ${entrada.etiqueta}`}
                            onClick={() => quitarEntrada(gi, ei)}
                            iconoIzq={<Trash2 className="size-4" />}
                          />
                        )}
                      </div>
                    </li>
                  )
                })}

                {grupo.entradas.length === 0 && (
                  <li className="px-4 py-6 text-center text-body-sm text-fg-subtle">
                    Grupo vacío. Añádele una entrada desde el desplegable de abajo, o muévele una
                    desde otro grupo.
                  </li>
                )}
              </ul>

              {disponibles.length > 0 && (
                <div className="flex flex-wrap items-end gap-2 border-t border-line p-4">
                  <Campo
                    etiqueta="Añadir una pantalla a este grupo"
                    className="min-w-[16rem] flex-1"
                    pista="Sólo pantallas que existen. El permiso viene con ella."
                  >
                    {({ id }) => (
                      <Select
                        id={id}
                        value=""
                        onChange={(e) => e.target.value && anadirEntrada(gi, e.target.value)}
                      >
                        <option value="">Selecciona una pantalla…</option>
                        {disponibles.map((r) => (
                          <option key={r.ruta} value={r.ruta}>
                            {r.etiqueta} — {r.ruta}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Campo>
                </div>
              )}
            </Card>
          ))}

          {borrador.length === 0 && (
            <EmptyState
              icono={<PanelLeft className="size-5" />}
              titulo="No queda ningún grupo"
              descripcion="Sin grupos, la barra lateral se pinta desde el catálogo del código para que el portal siga siendo navegable."
            />
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button onClick={anadirGrupo} iconoIzq={<Plus className="size-4" />}>
              Nuevo grupo
            </Button>
            <Button
              variante="primario"
              cargando={guardar.isPending}
              onClick={() => guardar.mutate(borrador)}
              iconoIzq={<Save className="size-4" />}
            >
              Guardar menú
            </Button>
          </div>
        </div>

        <Card className="p-4 lg:sticky lg:top-20">
          <h2 className="flex items-center gap-2 text-label text-fg">
            <Info aria-hidden className="size-4 text-primary" />
            Dónde está la frontera
          </h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 text-body-sm text-fg-muted">
            <li>
              Aquí mandas la <strong>presentación</strong>: nombre, grupo, orden, icono y si se
              ofrece o no.
            </li>
            <li>
              El <strong>permiso</strong> no se edita: espeja el que exige la pantalla. Aflojarlo
              aquí no daría acceso a nada, sólo pintaría un enlace que lleva a «no tienes permiso».
            </li>
            <li>
              <strong>Esconder no es restringir.</strong> Sirve para no ofrecer un módulo que
              todavía no se usa. Quien tenga la dirección seguirá entrando si su rol se lo permite;
              restringir es cosa de Roles y Permisos.
            </li>
            <li>
              Las entradas de fábrica se pueden renombrar, mover y esconder, pero no borrar:
              dejarían su pantalla viva y sin forma de llegar a ella.
            </li>
          </ul>
        </Card>
      </div>
    </>
  )
}
