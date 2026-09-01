import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Info,
  Plus,
  Power,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Campo, Checkbox, Input } from '@/components/ui/Field'
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/primitives'
import type { CodigoPermiso, EtapaConfiguracionRow, RolRow } from '@/types/database'

export function FlujoPage() {
  const qc = useQueryClient()
  const [creando, setCreando] = useState(false)
  const [editandoRoles, setEditandoRoles] = useState<EtapaConfiguracionRow | null>(null)

  const { data: etapas, isPending } = useQuery({
    queryKey: ['flujo', 'etapas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_etapas_configuracion')
        .select('*')
        .order('orden')
      if (error) throw error
      return (data ?? []) as EtapaConfiguracionRow[]
    },
  })

  const { data: roles } = useQuery({
    queryKey: ['roles', 'lista'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('estado', 'activo')
        .order('nombre')
      if (error) throw error
      return (data ?? []) as RolRow[]
    },
    staleTime: 5 * 60_000,
  })

  const activas = etapas?.filter((e) => e.activa) ?? []
  const inactivas = etapas?.filter((e) => !e.activa) ?? []

  const reordenar = useMutation({
    mutationFn: async (codigos: string[]) => {
      const { error } = await supabase.rpc('fn_reordenar_etapas', { p_codigos: codigos })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['flujo'] }),
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const alternarActiva = useMutation({
    mutationFn: async (etapa: EtapaConfiguracionRow) => {
      const { error } = await supabase
        .from('etapas_flujo')
        .update({ activa: !etapa.activa })
        .eq('codigo', etapa.codigo)
      if (error) throw error
    },
    onSuccess: (_, etapa) => {
      toast.success(etapa.activa ? 'Etapa desactivada' : 'Etapa activada', {
        description: 'Afecta a las solicitudes que se envíen a partir de ahora.',
      })
      void qc.invalidateQueries({ queryKey: ['flujo'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  /** Mueve una etapa una posición y reenvía la secuencia completa. */
  function mover(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion
    if (destino < 0 || destino >= activas.length) return
    const orden = activas.map((e) => e.codigo)
    ;[orden[indice], orden[destino]] = [orden[destino], orden[indice]]
    reordenar.mutate([...orden, ...inactivas.map((e) => e.codigo)])
  }

  return (
    <>
      <PageHeader
        titulo="Flujo de validación"
        descripcion="Define por qué firmas pasa una solicitud antes de convertirse en una actividad."
        acciones={
          <Button
            variante="primario"
            onClick={() => setCreando(true)}
            iconoIzq={<Plus className="size-4" />}
          >
            Añadir etapa
          </Button>
        }
      />

      {/* Cómo funciona. Es la primera vez que alguien ve esta pantalla y sin
          esto no sabría dónde encaja Coordinación, que no firma nada. */}
      <Card className="mb-4 flex items-start gap-3 bg-primary-soft p-4">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-softFg" />
        <div className="text-body-sm leading-relaxed text-primary-softFg">
          <p>
            <strong className="font-semibold">Coordinación Académica solicita</strong> la creación
            de los códigos: no aparece aquí porque no firma. La cadena de abajo son las
            validaciones que su petición debe superar.
          </p>
          <p className="mt-1.5">
            La última etapa <strong className="font-semibold">materializa</strong> el cambio: al
            firmarla, la actividad se crea, se modifica o se archiva en la estructura maestra.
          </p>
        </div>
      </Card>

      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {activas.map((etapa, i) => (
            <li key={etapa.codigo} className="motion-safe:animate-fade-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <Card
                className={cn(
                  'flex flex-wrap items-start gap-4 p-4',
                  etapa.materializa && 'border-primary/40',
                )}
              >
                {/* Posición en la cadena */}
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-full text-title-sm tabular',
                      etapa.materializa
                        ? 'bg-primary text-primary-fg'
                        : 'bg-primary-soft text-primary-softFg',
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="flex flex-col">
                    <Button
                      tamano="sm"
                      variante="fantasma"
                      soloIcono
                      aria-label={`Subir ${etapa.nombre}`}
                      disabled={i === 0 || reordenar.isPending}
                      onClick={() => mover(i, -1)}
                      className="h-6 w-6"
                      iconoIzq={<ArrowUp className="size-3" />}
                    />
                    <Button
                      tamano="sm"
                      variante="fantasma"
                      soloIcono
                      aria-label={`Bajar ${etapa.nombre}`}
                      disabled={i === activas.length - 1 || reordenar.isPending}
                      onClick={() => mover(i, 1)}
                      className="h-6 w-6"
                      iconoIzq={<ArrowDown className="size-3" />}
                    />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-title-sm text-fg">{etapa.nombre}</h2>
                    {etapa.materializa && (
                      <Badge tono="primario">
                        <Sparkles aria-hidden className="size-3" />
                        Crea la actividad
                      </Badge>
                    )}
                    {etapa.expedientes_esperando > 0 && (
                      <Badge tono="aviso" punto>
                        {etapa.expedientes_esperando} esperando
                      </Badge>
                    )}
                  </div>

                  {etapa.descripcion && (
                    <p className="mt-1 text-body-sm text-fg-muted">{etapa.descripcion}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-overline uppercase text-fg-subtle">Firman:</span>
                    {etapa.roles.length === 0 ? (
                      <span className="text-body-sm text-danger">
                        Ningún rol — los expedientes se atascarán aquí
                      </span>
                    ) : (
                      etapa.roles.map((r) => (
                        <Badge key={r} tono="neutro">
                          {r}
                        </Badge>
                      ))
                    )}
                    <Button
                      tamano="sm"
                      variante="fantasma"
                      onClick={() => setEditandoRoles(etapa)}
                      iconoIzq={<Users className="size-3.5" />}
                    >
                      Cambiar
                    </Button>
                  </div>
                </div>

                <Button
                  tamano="sm"
                  aria-label={`Desactivar ${etapa.nombre}`}
                  title="Quitar del flujo"
                  disabled={etapa.materializa || alternarActiva.isPending}
                  onClick={() => alternarActiva.mutate(etapa)}
                  iconoIzq={<Power className="size-3.5" />}
                >
                  Desactivar
                </Button>
              </Card>
            </li>
          ))}
        </ol>
      )}

      {inactivas.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            titulo="Etapas fuera del flujo"
            descripcion="No se aplican a las solicitudes nuevas. Se conservan por los expedientes que ya pasaron por ellas."
          />
          <ul className="divide-y divide-line">
            {inactivas.map((etapa) => (
              <li key={etapa.codigo} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-fg-muted">{etapa.nombre}</span>
                  <span className="block truncate text-body-sm text-fg-subtle">
                    {etapa.descripcion}
                  </span>
                </span>
                <Button
                  tamano="sm"
                  onClick={() => alternarActiva.mutate(etapa)}
                  iconoIzq={<CheckCircle2 className="size-3.5" />}
                >
                  Reactivar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editandoRoles && roles && (
        <DialogoRoles
          etapa={editandoRoles}
          roles={roles}
          onCerrar={() => setEditandoRoles(null)}
        />
      )}

      {creando && <DialogoNuevaEtapa orden={activas.length + 1} onCerrar={() => setCreando(false)} />}
    </>
  )
}

// -----------------------------------------------------------------------------
// Qué roles firman una etapa
//
// El administrador razona en roles; el modelo, en permisos. Esta pantalla
// traduce: marcar un rol concede el permiso de la etapa a ese rol, que es lo
// que RLS y `fn_decidir_etapa` comprueban de verdad.
// -----------------------------------------------------------------------------
function DialogoRoles({
  etapa,
  roles,
  onCerrar,
}: {
  etapa: EtapaConfiguracionRow
  roles: RolRow[]
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(etapa.rol_ids))

  const guardar = useMutation({
    mutationFn: async () => {
      // Se borra y se reinserta: con una docena de roles es más simple y más
      // fiable que calcular el diferencial, y ocurre en una sola acción.
      const { error: errBorrar } = await supabase
        .from('rol_permisos')
        .delete()
        .eq('permiso_codigo', etapa.permiso_codigo)
      if (errBorrar) throw errBorrar

      if (seleccion.size > 0) {
        const { error } = await supabase.from('rol_permisos').insert(
          [...seleccion].map((rol_id) => ({ rol_id, permiso_codigo: etapa.permiso_codigo })),
        )
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Firmantes actualizados')
      void qc.invalidateQueries({ queryKey: ['flujo'] })
      void qc.invalidateQueries({ queryKey: ['roles'] })
      onCerrar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  return (
    <Modal titulo={`Quién firma «${etapa.nombre}»`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-1 p-4">
        {roles.map((r) => (
          <Checkbox
            key={r.id}
            etiqueta={r.nombre}
            descripcion={r.descripcion ?? undefined}
            checked={seleccion.has(r.id)}
            onChange={(e) =>
              setSeleccion((prev) => {
                const s = new Set(prev)
                if (e.target.checked) s.add(r.id)
                else s.delete(r.id)
                return s
              })
            }
          />
        ))}

        {seleccion.size === 0 && (
          <p className="mt-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-body-sm text-warning-softFg">
            Sin ningún rol, los expedientes llegarán a esta etapa y no podrá firmarlos nadie.
          </p>
        )}
      </div>

      <footer className="flex justify-end gap-2 border-t border-line p-4">
        <Button onClick={onCerrar}>Cancelar</Button>
        <Button variante="primario" cargando={guardar.isPending} onClick={() => guardar.mutate()}>
          Guardar
        </Button>
      </footer>
    </Modal>
  )
}

// -----------------------------------------------------------------------------
function DialogoNuevaEtapa({ orden, onCerrar }: { orden: number; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [enviado, setEnviado] = useState(false)

  const errorNombre = nombre.trim().length < 3 ? 'Escribe el nombre de la etapa.' : null

  /** `Validación de Bienestar` → `bienestar`. */
  const slug = nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)

  const crear = useMutation({
    mutationFn: async () => {
      // El tipo lleva el prefijo literal para que TypeScript lo reconozca como
      // un CodigoPermiso válido; sin él, la plantilla se ensancha a `string`.
      const permiso: CodigoPermiso = `solicitudes.validar_${slug}`

      // La etapa necesita un permiso propio. El catálogo sólo admite altas con
      // este prefijo, por política RLS.
      const { error: errPermiso } = await supabase.from('permisos').insert({
        codigo: permiso,
        modulo: 'solicitudes',
        accion: `validar_${slug}`,
        descripcion: `Firmar la etapa «${nombre.trim()}»`,
      })
      if (errPermiso && errPermiso.code !== '23505') throw errPermiso

      const { error } = await supabase.from('etapas_flujo').insert({
        codigo: slug,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        orden,
        permiso_codigo: permiso,
        materializa: false,
        activa: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Etapa añadida', {
        description: 'Asigna ahora qué roles la firman, o nadie podrá avanzarla.',
      })
      void qc.invalidateQueries({ queryKey: ['flujo'] })
      onCerrar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setEnviado(true)
    if (!errorNombre) crear.mutate()
  }

  return (
    <Modal
      titulo="Añadir etapa de validación"
      descripcion="Se insertará antes de la creación en plataforma."
      onCerrar={onCerrar}
    >
      <form onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-4 p-4">
          <Campo
            etiqueta="Nombre de la etapa"
            requerido
            error={enviado ? errorNombre : null}
            pista={slug ? `Se identificará como «${slug}».` : undefined}
          >
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                autoFocus
                placeholder="Ej. Vicerrectoría de Investigación"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            )}
          </Campo>

          <Campo etiqueta="Qué valida" pista="Aparece en el expediente, junto a la firma.">
            {({ id }) => (
              <Input
                id={id}
                placeholder="Verifica la pertinencia investigativa de la actividad."
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            )}
          </Campo>
        </div>

        <footer className="flex justify-end gap-2 border-t border-line p-4">
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variante="primario" cargando={crear.isPending}>
            Añadir
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

// -----------------------------------------------------------------------------
function Modal({
  titulo,
  descripcion,
  onCerrar,
  children,
}: {
  titulo: string
  descripcion?: string
  onCerrar: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn(
          'relative my-auto w-full max-w-md overflow-hidden rounded-xl',
          'border border-line bg-surface-raised shadow-overlay',
          'motion-safe:animate-[fade-rise_200ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-title-sm text-fg">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-body-sm text-fg-muted">{descripcion}</p>}
          </div>
          <Button
            variante="fantasma"
            tamano="sm"
            soloIcono
            aria-label="Cerrar"
            onClick={onCerrar}
            iconoIzq={<X className="size-4" />}
          />
        </header>
        {children}
      </div>
    </div>
  )
}
