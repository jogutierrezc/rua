import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CheckCircle2, Download, Pencil, Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { fechaRelativa } from '@/lib/format'
import { ESTADO_REGISTRO } from '@/lib/estados'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Checkbox, Input } from '@/components/ui/Field'
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
import { DialogoCrearUsuario } from './DialogoCrearUsuario'
import { DialogoEditarUsuario } from './DialogoEditarUsuario'
import type { EstadoRegistro, PerfilRow, RolRow, VicerrectoriaRow } from '@/types/database'

const POR_PAGINA = 15

type FilaUsuario = PerfilRow & {
  rol: Pick<RolRow, 'id' | 'nombre' | 'nivel_acceso'> | null
  vicerrectoria: Pick<VicerrectoriaRow, 'nombre'> | null
}

export function UsuariosPage() {
  const { perfil } = useAuth()
  const qc = useQueryClient()

  const [busqueda, setBusqueda] = useState('')
  const [rolesFiltro, setRolesFiltro] = useState<Set<string>>(new Set())
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoRegistro | 'todos'>('todos')
  const [pagina, setPagina] = useState(0)
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<FilaUsuario | null>(null)

  const { data: roles } = useQuery({
    queryKey: ['roles', 'lista'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, nombre, nivel_acceso, estado')
        .order('nombre')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })

  const { data, isPending } = useQuery({
    queryKey: ['usuarios', busqueda, [...rolesFiltro], estadoFiltro, pagina],
    queryFn: async () => {
      let q = supabase
        .from('perfiles')
        .select('*, rol:roles(id, nombre, nivel_acceso), vicerrectoria:vicerrectorias(nombre)', {
          count: 'exact',
        })
        .order('nombre_completo')
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)

      if (busqueda.trim()) {
        const t = `%${busqueda.trim()}%`
        q = q.or(
          `nombre_completo.ilike.${t},correo.ilike.${t},cargo.ilike.${t},numero_documento.ilike.${t}`,
        )
      }
      if (rolesFiltro.size > 0) q = q.in('rol_id', [...rolesFiltro])
      if (estadoFiltro !== 'todos') q = q.eq('estado', estadoFiltro)

      const { data, error, count } = await q
      if (error) throw error
      return { filas: (data ?? []) as unknown as FilaUsuario[], total: count ?? 0 }
    },
    placeholderData: (prev) => prev,
  })

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoRegistro }) => {
      const { error } = await supabase.from('perfiles').update({ estado }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { estado }) => {
      toast.success(estado === 'activo' ? 'Usuario habilitado' : 'Usuario deshabilitado')
      void qc.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  function alternarRol(id: string) {
    setRolesFiltro((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
    setPagina(0)
  }

  return (
    <>
      <PageHeader
        titulo="Usuarios"
        descripcion="Accesos y roles del personal académico y administrativo."
        acciones={
          <>
            <Si puede="bi.exportar">
              <Button iconoIzq={<Download className="size-4" />}>Exportar</Button>
            </Si>
            <Si puede="usuarios.administrar">
              <Button
                variante="primario"
                onClick={() => setCreando(true)}
                iconoIzq={<UserPlus className="size-4" />}
              >
                Crear usuario
              </Button>
            </Si>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        {/* Filtros ------------------------------------------------------ */}
        <Card className="p-4 lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <h2 className="text-label text-fg">Filtros</h2>
            {(rolesFiltro.size > 0 || estadoFiltro !== 'todos') && (
              <button
                onClick={() => {
                  setRolesFiltro(new Set())
                  setEstadoFiltro('todos')
                  setPagina(0)
                }}
                className="text-body-sm text-primary underline-offset-4 hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>

          <fieldset className="mt-4">
            <legend className="text-overline uppercase text-fg-subtle">Rol en el sistema</legend>
            <div className="mt-2 flex flex-col gap-0.5">
              {roles?.map((r) => (
                <Checkbox
                  key={r.id}
                  etiqueta={r.nombre}
                  checked={rolesFiltro.has(r.id)}
                  onChange={() => alternarRol(r.id)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5 border-t border-line pt-4">
            <legend className="text-overline uppercase text-fg-subtle">Estado de cuenta</legend>
            <div className="mt-2 flex flex-col gap-0.5">
              {(['todos', 'activo', 'inactivo'] as const).map((v) => (
                <label
                  key={v}
                  className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 -mx-1 transition-colors duration-fast ease-out [@media(hover:hover)]:hover:bg-surface-muted"
                >
                  <input
                    type="radio"
                    name="estado-cuenta"
                    className="size-4 accent-primary"
                    checked={estadoFiltro === v}
                    onChange={() => {
                      setEstadoFiltro(v)
                      setPagina(0)
                    }}
                  />
                  <span className="text-body text-fg">
                    {v === 'todos' ? 'Todos' : ESTADO_REGISTRO[v].etiqueta}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        {/* Tabla -------------------------------------------------------- */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
              />
              <Input
                type="search"
                placeholder="Nombre, documento, correo o cargo…"
                aria-label="Buscar usuarios"
                className="pl-9"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value)
                  setPagina(0)
                }}
              />
            </div>
            {data && (
              <p className="text-body-sm text-fg-subtle">
                <span className="tabular text-fg">{data.total}</span> usuarios
              </p>
            )}
          </div>

          {isPending ? (
            <TableSkeleton filas={8} columnas={5} />
          ) : !data?.filas.length ? (
            <EmptyState
              titulo="Ningún usuario coincide"
              descripcion="Ajusta los filtros o cambia el término de búsqueda."
            />
          ) : (
            <>
              <TableShell>
                <thead>
                  <tr>
                    <Th>Nombre</Th>
                    <Th className="w-32">Documento</Th>
                    <Th>Correo institucional</Th>
                    <Th className="w-44">Rol</Th>
                    <Th className="w-28">Estado</Th>
                    <Th className="w-32">Último acceso</Th>
                    <Th alineado="der" className="w-20">
                      Acciones
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map((u) => {
                    const esYo = u.id === perfil?.id
                    const activo = u.estado === 'activo'

                    return (
                      <Tr key={u.id}>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <Avatar nombre={u.nombre_completo} url={u.avatar_url} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-fg">
                                {u.nombre_completo}
                                {esYo && (
                                  <span className="ml-1.5 text-body-sm font-normal text-fg-subtle">
                                    (tú)
                                  </span>
                                )}
                              </span>
                              <span className="block truncate text-body-sm text-fg-subtle">
                                {u.vicerrectoria?.nombre ?? u.cargo ?? '—'}
                              </span>
                            </span>
                          </div>
                        </Td>
                        <Td className="font-mono text-body-sm text-fg-muted">
                          {u.numero_documento ?? <span className="font-sans">—</span>}
                        </Td>
                        <Td className="truncate text-fg-muted">{u.correo}</Td>
                        <Td>
                          {u.rol ? (
                            <Badge tono="primario">{u.rol.nombre}</Badge>
                          ) : (
                            <span className="text-body-sm text-fg-subtle">Sin rol</span>
                          )}
                        </Td>
                        <Td>
                          <Badge tono={ESTADO_REGISTRO[u.estado].tono} punto>
                            {ESTADO_REGISTRO[u.estado].etiqueta}
                          </Badge>
                        </Td>
                        <Td className="whitespace-nowrap text-fg-subtle">
                          {fechaRelativa(u.ultimo_acceso_en)}
                        </Td>
                        <Td alineado="der">
                          <Si puede="usuarios.administrar">
                            <div
                              className={cn(
                                'flex justify-end opacity-0 transition-opacity duration-fast ease-out',
                                'group-hover:opacity-100 group-focus-within:opacity-100',
                                '[@media(hover:none)]:opacity-100',
                              )}
                            >
                              <Button
                                tamano="sm"
                                variante="fantasma"
                                soloIcono
                                aria-label={`Editar a ${u.nombre_completo}`}
                                title="Editar usuario"
                                onClick={() => setEditando(u)}
                                iconoIzq={<Pencil className="size-4" />}
                              />
                              <Button
                                tamano="sm"
                                variante="fantasma"
                                soloIcono
                                // Nadie se deshabilita a sí mismo: es la vía
                                // más rápida de quedarse fuera del sistema.
                                disabled={esYo || cambiarEstado.isPending}
                                title={
                                  esYo
                                    ? 'No puedes cambiar tu propio estado'
                                    : activo
                                      ? 'Deshabilitar usuario'
                                      : 'Habilitar usuario'
                                }
                                aria-label={`${activo ? 'Deshabilitar' : 'Habilitar'} a ${u.nombre_completo}`}
                                onClick={() =>
                                  cambiarEstado.mutate({
                                    id: u.id,
                                    estado: activo ? 'inactivo' : 'activo',
                                  })
                                }
                                className={cn(
                                  activo
                                    ? 'hover:bg-danger-soft hover:text-danger-softFg'
                                    : 'hover:bg-success-soft hover:text-success-softFg',
                                )}
                                iconoIzq={
                                  activo ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />
                                }
                              />
                            </div>
                          </Si>
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
      </div>

      {creando && <DialogoCrearUsuario onCerrar={() => setCreando(false)} />}

      {editando && (
        <DialogoEditarUsuario usuario={editando} onCerrar={() => setEditando(null)} />
      )}
    </>
  )
}
