import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Pencil, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { NIVEL_ACCESO, ESTADO_REGISTRO } from '@/lib/estados'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Campo, Checkbox, Input, Select, Switch } from '@/components/ui/Field'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives'
import type { CodigoPermiso, NivelAcceso, PermisoRow, RolRow } from '@/types/database'

type RolConPermisos = RolRow & { rol_permisos: { permiso_codigo: CodigoPermiso }[] }

interface Borrador {
  id: string | null
  nombre: string
  descripcion: string
  puede_leer: boolean
  puede_editar: boolean
  puede_eliminar: boolean
  nivel_acceso: NivelAcceso
  permisos: Set<CodigoPermiso>
}

const BORRADOR_NUEVO: Borrador = {
  id: null,
  nombre: '',
  descripcion: '',
  puede_leer: true,
  puede_editar: false,
  puede_eliminar: false,
  nivel_acceso: 'visor',
  permisos: new Set(),
}

export function RolesPage() {
  const qc = useQueryClient()
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_NUEVO)
  const [enviado, setEnviado] = useState(false)

  const { data: roles, isPending } = useQuery({
    queryKey: ['roles', 'con-permisos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*, rol_permisos(permiso_codigo)')
        .order('es_sistema', { ascending: false })
        .order('nombre')
      if (error) throw error
      return (data ?? []) as unknown as RolConPermisos[]
    },
  })

  const { data: permisos } = useQuery({
    queryKey: ['permisos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('permisos').select('*').order('codigo')
      if (error) throw error
      return (data ?? []) as PermisoRow[]
    },
    staleTime: Infinity, // catálogo cerrado: sólo cambia con una migración
  })

  const permisosPorModulo = useMemo(() => {
    const mapa = new Map<string, PermisoRow[]>()
    permisos?.forEach((p) => {
      const lista = mapa.get(p.modulo) ?? []
      lista.push(p)
      mapa.set(p.modulo, lista)
    })
    return [...mapa.entries()]
  }, [permisos])

  /**
   * Los interruptores gruesos se escalan: no tiene sentido "puede eliminar"
   * sin "puede editar". La base lo exige con un CHECK; aquí lo hacemos
   * imposible de romper en vez de dejar que falle al guardar.
   */
  useEffect(() => {
    setBorrador((b) => {
      if (b.puede_eliminar && !b.puede_editar) return { ...b, puede_editar: true, puede_leer: true }
      if (b.puede_editar && !b.puede_leer) return { ...b, puede_leer: true }
      if (!b.puede_leer && (b.puede_editar || b.puede_eliminar))
        return { ...b, puede_editar: false, puede_eliminar: false }
      return b
    })
  }, [borrador.puede_leer, borrador.puede_editar, borrador.puede_eliminar])

  const editando = borrador.id !== null
  const rolEditado = roles?.find((r) => r.id === borrador.id)
  const errorNombre = borrador.nombre.trim().length < 2 ? 'Escribe el nombre del cargo.' : null

  function cargar(rol: RolConPermisos) {
    setEnviado(false)
    setBorrador({
      id: rol.id,
      nombre: rol.nombre,
      descripcion: rol.descripcion ?? '',
      puede_leer: rol.puede_leer,
      puede_editar: rol.puede_editar,
      puede_eliminar: rol.puede_eliminar,
      nivel_acceso: rol.nivel_acceso,
      permisos: new Set(rol.rol_permisos.map((p) => p.permiso_codigo)),
    })
  }

  const guardar = useMutation({
    mutationFn: async () => {
      const campos = {
        nombre: borrador.nombre.trim(),
        descripcion: borrador.descripcion.trim() || null,
        puede_leer: borrador.puede_leer,
        puede_editar: borrador.puede_editar,
        puede_eliminar: borrador.puede_eliminar,
        nivel_acceso: borrador.nivel_acceso,
      }

      let rolId = borrador.id

      if (rolId) {
        const { error } = await supabase.from('roles').update(campos).eq('id', rolId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('roles').insert(campos).select('id').single()
        if (error) throw error
        rolId = data.id
      }

      // Sincronización de permisos: borramos y reinsertamos. Con un catálogo
      // de una docena de códigos es más simple y más fiable que calcular el
      // diferencial, y ocurre dentro de la misma acción del usuario.
      const { error: errBorrar } = await supabase.from('rol_permisos').delete().eq('rol_id', rolId)
      if (errBorrar) throw errBorrar

      if (borrador.permisos.size > 0) {
        const { error } = await supabase.from('rol_permisos').insert(
          [...borrador.permisos].map((permiso_codigo) => ({ rol_id: rolId, permiso_codigo })),
        )
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editando ? 'Rol actualizado' : 'Rol creado')
      void qc.invalidateQueries({ queryKey: ['roles'] })
      setBorrador(BORRADOR_NUEVO)
      setEnviado(false)
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('roles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Rol eliminado')
      void qc.invalidateQueries({ queryKey: ['roles'] })
      setBorrador(BORRADOR_NUEVO)
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  return (
    <>
      <PageHeader
        titulo="Roles y Permisos"
        descripcion="Define qué puede hacer cada cargo dentro de la plataforma."
      />

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        {/* Editor -------------------------------------------------------- */}
        <Card className="lg:sticky lg:top-20">
          <CardHeader
            titulo={editando ? `Editar «${rolEditado?.nombre ?? ''}»` : 'Crear rol'}
            icono={<ShieldCheck className="size-4" />}
            acciones={
              editando ? (
                <Button
                  tamano="sm"
                  variante="fantasma"
                  soloIcono
                  aria-label="Cancelar edición"
                  onClick={() => setBorrador(BORRADOR_NUEVO)}
                  iconoIzq={<X className="size-4" />}
                />
              ) : undefined
            }
          />

          <form
            className="flex flex-col gap-4 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              setEnviado(true)
              if (!errorNombre) guardar.mutate()
            }}
            noValidate
          >
            {rolEditado?.es_sistema && (
              <p className="flex items-start gap-2 rounded-md bg-surface-muted px-3 py-2 text-body-sm text-fg-muted">
                <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                Rol de sistema: puedes ajustar sus permisos, pero no renombrarlo ni eliminarlo.
              </p>
            )}

            <Campo etiqueta="Nombre del cargo" requerido error={enviado ? errorNombre : null}>
              {({ id, describedBy, invalido }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalido}
                  placeholder="Ej. Coordinador Académico"
                  disabled={rolEditado?.es_sistema}
                  value={borrador.nombre}
                  onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))}
                />
              )}
            </Campo>

            <Campo etiqueta="Descripción" pista="Qué hace este cargo, en una frase.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  placeholder="Revisa solicitudes y mantiene la estructura."
                  value={borrador.descripcion}
                  onChange={(e) => setBorrador((b) => ({ ...b, descripcion: e.target.value }))}
                />
              )}
            </Campo>

            <fieldset className="border-t border-line pt-3">
              <legend className="text-label text-fg">Acciones permitidas</legend>
              <p className="mt-1 text-body-sm text-fg-subtle">
                Se escalan entre sí: eliminar implica editar, y editar implica leer.
              </p>
              <div className="mt-1 divide-y divide-line">
                <Switch
                  etiqueta="Leer y visualizar"
                  checked={borrador.puede_leer}
                  onChange={(e) => setBorrador((b) => ({ ...b, puede_leer: e.target.checked }))}
                />
                <Switch
                  etiqueta="Editar y modificar"
                  checked={borrador.puede_editar}
                  onChange={(e) => setBorrador((b) => ({ ...b, puede_editar: e.target.checked }))}
                />
                <Switch
                  etiqueta="Eliminar y archivar"
                  checked={borrador.puede_eliminar}
                  onChange={(e) => setBorrador((b) => ({ ...b, puede_eliminar: e.target.checked }))}
                />
              </div>
            </fieldset>

            <Campo etiqueta="Nivel de acceso a actividades">
              {({ id }) => (
                <Select
                  id={id}
                  value={borrador.nivel_acceso}
                  onChange={(e) =>
                    setBorrador((b) => ({ ...b, nivel_acceso: e.target.value as NivelAcceso }))
                  }
                >
                  <option value="completo">Completo</option>
                  <option value="limitado">Limitado</option>
                  <option value="visor">Solo visor</option>
                </Select>
              )}
            </Campo>

            <fieldset className="border-t border-line pt-3">
              <legend className="text-label text-fg">Permisos concedidos</legend>
              <p className="mt-1 text-body-sm text-fg-subtle">
                Estas son las capacidades que aplica realmente la base de datos.
              </p>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-line bg-surface-muted/40 p-2">
                {permisosPorModulo.map(([modulo, lista]) => (
                  <div key={modulo} className="mb-3 last:mb-0">
                    <p className="px-1 pb-1 text-overline uppercase text-fg-subtle">{modulo}</p>
                    {lista.map((p) => (
                      <Checkbox
                        key={p.codigo}
                        etiqueta={p.descripcion}
                        checked={borrador.permisos.has(p.codigo)}
                        onChange={(e) =>
                          setBorrador((b) => {
                            const s = new Set(b.permisos)
                            if (e.target.checked) s.add(p.codigo)
                            else s.delete(p.codigo)
                            return { ...b, permisos: s }
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 border-t border-line pt-3">
              {editando && (
                <Button onClick={() => setBorrador(BORRADOR_NUEVO)}>Cancelar</Button>
              )}
              <Button
                type="submit"
                variante="primario"
                cargando={guardar.isPending}
                iconoIzq={editando ? <Save className="size-4" /> : <Plus className="size-4" />}
              >
                {editando ? 'Guardar cambios' : 'Crear rol'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Listado ------------------------------------------------------ */}
        <Card className="overflow-hidden">
          <CardHeader
            titulo="Roles configurados"
            descripcion="Selecciona uno para editar sus permisos."
          />

          {isPending ? (
            <TableSkeleton filas={5} columnas={5} />
          ) : !roles?.length ? (
            <EmptyState titulo="Sin roles configurados" />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Cargo</Th>
                  <Th className="w-28">Acciones</Th>
                  <Th className="w-32">Nivel</Th>
                  <Th className="w-24">Permisos</Th>
                  <Th className="w-24">Estado</Th>
                  <Th alineado="der" className="w-20">
                    Gestión
                  </Th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <Tr
                    key={r.id}
                    className={cn(borrador.id === r.id && 'bg-primary-soft/50')}
                  >
                    <Td>
                      <span className="flex items-center gap-1.5 font-medium text-fg">
                        {r.nombre}
                        {r.es_sistema && (
                          <Lock aria-label="Rol de sistema" className="size-3 text-fg-subtle" />
                        )}
                      </span>
                      {r.descripcion && (
                        <span className="block truncate text-body-sm text-fg-subtle">
                          {r.descripcion}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {/* Texto además del icono: "L E X" se lee sin adivinar */}
                      <span className="flex gap-1 text-body-sm tabular text-fg-muted">
                        {[
                          ['L', r.puede_leer],
                          ['E', r.puede_editar],
                          ['X', r.puede_eliminar],
                        ].map(([letra, activo]) => (
                          <span
                            key={letra as string}
                            title={
                              letra === 'L' ? 'Leer' : letra === 'E' ? 'Editar' : 'Eliminar'
                            }
                            className={cn(
                              'grid size-5 place-items-center rounded-sm',
                              activo
                                ? 'bg-primary-soft text-primary-softFg'
                                : 'bg-surface-muted text-fg-subtle/50',
                            )}
                          >
                            {letra as string}
                          </span>
                        ))}
                      </span>
                    </Td>
                    <Td>
                      <Badge tono={NIVEL_ACCESO[r.nivel_acceso].tono}>
                        {NIVEL_ACCESO[r.nivel_acceso].etiqueta}
                      </Badge>
                    </Td>
                    <Td className="tabular text-fg-muted">{r.rol_permisos.length}</Td>
                    <Td>
                      <Badge tono={ESTADO_REGISTRO[r.estado].tono} punto>
                        {ESTADO_REGISTRO[r.estado].etiqueta}
                      </Badge>
                    </Td>
                    <Td alineado="der">
                      <div
                        className={cn(
                          'flex justify-end gap-1 opacity-0 transition-opacity duration-fast ease-out',
                          'group-hover:opacity-100 group-focus-within:opacity-100',
                          '[@media(hover:none)]:opacity-100',
                        )}
                      >
                        <Button
                          tamano="sm"
                          variante="fantasma"
                          soloIcono
                          aria-label={`Editar ${r.nombre}`}
                          onClick={() => cargar(r)}
                          iconoIzq={<Pencil className="size-4" />}
                        />
                        <Button
                          tamano="sm"
                          variante="fantasma"
                          soloIcono
                          aria-label={`Eliminar ${r.nombre}`}
                          // Los roles de sistema no se borran: es lo que impide
                          // dejar la instalación sin administrador.
                          disabled={r.es_sistema || eliminar.isPending}
                          title={r.es_sistema ? 'Los roles de sistema no se pueden eliminar' : 'Eliminar'}
                          onClick={() => {
                            if (
                              window.confirm(
                                `¿Eliminar el rol «${r.nombre}»?\n\nLos usuarios que lo tengan quedarán sin rol asignado y perderán el acceso hasta que se les asigne otro.`,
                              )
                            ) {
                              eliminar.mutate(r.id)
                            }
                          }}
                          className="hover:bg-danger-soft hover:text-danger-softFg"
                          iconoIzq={<Trash2 className="size-4" />}
                        />
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      </div>
    </>
  )
}
