import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CalendarPlus,
  CircleDot,
  Lock,
  PlayCircle,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { ESTADO_PERIODO } from '@/lib/estados'
import { fechaLarga, fmtNumero } from '@/lib/format'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Campo, Checkbox, Input } from '@/components/ui/Field'
import {
  Badge,
  Card,
  EmptyState,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives'
import type { PeriodoDetalleRow } from '@/types/database'

export function PeriodosPage() {
  const qc = useQueryClient()
  const [editando, setEditando] = useState<PeriodoDetalleRow | 'nuevo' | null>(null)
  const [abriendo, setAbriendo] = useState<PeriodoDetalleRow | null>(null)

  const { data: periodos, isPending } = useQuery({
    queryKey: ['periodos', 'detalle'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_periodos_detalle')
        .select('*')
        .order('fecha_inicio', { ascending: false })
      if (error) throw error
      return (data ?? []) as PeriodoDetalleRow[]
    },
  })

  const abierto = periodos?.find((p) => p.estado === 'abierto') ?? null

  const cerrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('fn_cerrar_periodo', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Periodo cerrado', {
        description: 'Ya no se puede registrar actividad nueva en él.',
      })
      void qc.invalidateQueries({ queryKey: ['periodo'] })
      void qc.invalidateQueries({ queryKey: ['periodos'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const poblar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('fn_poblar_periodo', { p_id: id })
      if (error) throw error
      return data ?? 0
    },
    onSuccess: (n) => {
      toast.success(
        n === 0
          ? 'El periodo ya tenía todas las actividades activas'
          : `${n} ${n === 1 ? 'actividad añadida' : 'actividades añadidas'} al periodo`,
      )
      void qc.invalidateQueries({ queryKey: ['periodos'] })
      void qc.invalidateQueries({ queryKey: ['actividad-periodo'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  return (
    <>
      <PageHeader
        titulo="Periodos académicos"
        descripcion="El periodo abierto es el que la aplicación asume por defecto en todas las pantallas."
        acciones={
          <Button
            variante="primario"
            onClick={() => setEditando('nuevo')}
            iconoIzq={<CalendarPlus className="size-4" />}
          >
            Crear periodo
          </Button>
        }
      />

      {/* Estado actual. Es la respuesta a "¿en qué periodo estamos?", que es la
          pregunta con la que se entra a esta pantalla. */}
      <Card className={cn('mb-4 p-4', !abierto && 'border-warning/40 bg-warning-soft')}>
        {abierto ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2.5">
              <CircleDot aria-hidden className="size-4 shrink-0 text-success" />
              <div>
                <p className="text-title-sm text-fg">{abierto.nombre}</p>
                <p className="text-body-sm text-fg-muted">
                  {fechaLarga(abierto.fecha_inicio)} — {fechaLarga(abierto.fecha_fin)}
                </p>
              </div>
            </div>

            <dl className="ml-auto flex flex-wrap gap-x-6 gap-y-1">
              {[
                ['Días restantes', abierto.dias_restantes],
                ['Actividades', abierto.actividades],
                ['Solicitudes sin resolver', abierto.solicitudes_sin_resolver],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta as string}>
                  <dt className="text-overline uppercase text-fg-subtle">{etiqueta}</dt>
                  <dd className="tabular text-title-sm text-fg">
                    {fmtNumero.format(valor as number)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="flex items-start gap-2.5 text-body-sm text-warning-softFg">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-semibold">No hay ningún periodo abierto.</strong> Las
              solicitudes nuevas se crearán sin periodo asociado y el panel de Inteligencia de
              Negocios mostrará el total histórico. Abre uno de la lista para normalizar.
            </span>
          </p>
        )}
      </Card>

      <Card className="overflow-hidden">
        {isPending ? (
          <TableSkeleton filas={4} columnas={5} />
        ) : !periodos?.length ? (
          <EmptyState
            titulo="Aún no hay periodos"
            descripcion="Crea el primero para poder registrar actividades y solicitudes contra él."
            accion={
              <Button
                variante="primario"
                onClick={() => setEditando('nuevo')}
                iconoIzq={<CalendarPlus className="size-4" />}
              >
                Crear periodo
              </Button>
            }
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th className="w-28">Código</Th>
                <Th>Periodo</Th>
                <Th className="w-56">Vigencia</Th>
                <Th className="w-28" alineado="der">
                  Actividades
                </Th>
                <Th className="w-28" alineado="der">
                  Solicitudes
                </Th>
                <Th className="w-28">Estado</Th>
                <Th alineado="der" className="w-36">
                  Acciones
                </Th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-mono text-body-sm font-medium text-fg">{p.codigo}</Td>
                  <Td className="truncate">{p.nombre}</Td>
                  <Td className="text-fg-muted">
                    {fechaLarga(p.fecha_inicio)} — {fechaLarga(p.fecha_fin)}
                    {p.estado === 'abierto' && p.dias_restantes > 0 && (
                      <span className="block text-body-sm text-fg-subtle">
                        cierra en {p.dias_restantes} días
                      </span>
                    )}
                  </Td>
                  <Td alineado="der" className="tabular">
                    {fmtNumero.format(p.actividades)}
                    {p.actividades_pendientes > 0 && (
                      <span className="block text-body-sm text-fg-subtle">
                        {p.actividades_pendientes} sin cerrar
                      </span>
                    )}
                  </Td>
                  <Td alineado="der" className="tabular">
                    {fmtNumero.format(p.solicitudes)}
                    {p.solicitudes_sin_resolver > 0 && (
                      <span className="block text-body-sm text-warning">
                        {p.solicitudes_sin_resolver} sin resolver
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Badge tono={ESTADO_PERIODO[p.estado].tono} punto>
                      {ESTADO_PERIODO[p.estado].etiqueta}
                    </Badge>
                  </Td>
                  <Td alineado="der">
                    <div
                      className={cn(
                        'flex items-center justify-end gap-0.5',
                        'opacity-0 transition-opacity duration-fast ease-out',
                        'group-hover:opacity-100 group-focus-within:opacity-100',
                        '[@media(hover:none)]:opacity-100',
                      )}
                    >
                      {p.estado === 'abierto' ? (
                        <>
                          <Button
                            tamano="sm"
                            variante="fantasma"
                            soloIcono
                            aria-label={`Recargar actividades en ${p.codigo}`}
                            title="Añadir las actividades activas que falten"
                            disabled={poblar.isPending}
                            onClick={() => poblar.mutate(p.id)}
                            iconoIzq={<RefreshCw className="size-4" />}
                          />
                          <Button
                            tamano="sm"
                            variante="fantasma"
                            soloIcono
                            aria-label={`Cerrar ${p.codigo}`}
                            title="Cerrar el periodo"
                            disabled={cerrar.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `¿Cerrar el periodo ${p.codigo}?\n\n` +
                                    (p.solicitudes_sin_resolver > 0
                                      ? `Quedan ${p.solicitudes_sin_resolver} solicitudes sin resolver. Seguirán accesibles, pero el periodo dejará de ser el vigente.\n\n`
                                      : '') +
                                    'La aplicación quedará sin periodo abierto hasta que abras otro.',
                                )
                              ) {
                                cerrar.mutate(p.id)
                              }
                            }}
                            iconoIzq={<Lock className="size-4" />}
                          />
                        </>
                      ) : (
                        <Button
                          tamano="sm"
                          variante="fantasma"
                          soloIcono
                          aria-label={`Abrir ${p.codigo}`}
                          title="Abrir este periodo"
                          onClick={() => setAbriendo(p)}
                          className="hover:bg-success-soft hover:text-success-softFg"
                          iconoIzq={<PlayCircle className="size-4" />}
                        />
                      )}

                      <Button
                        tamano="sm"
                        variante="fantasma"
                        soloIcono
                        aria-label={`Editar ${p.codigo}`}
                        title="Editar"
                        onClick={() => setEditando(p)}
                        iconoIzq={<Pencil className="size-4" />}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      {editando && (
        <DialogoPeriodo
          periodo={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
        />
      )}

      {abriendo && (
        <DialogoAbrir periodo={abriendo} vigente={abierto} onCerrar={() => setAbriendo(null)} />
      )}
    </>
  )
}

// -----------------------------------------------------------------------------
// Alta y edición
// -----------------------------------------------------------------------------
function DialogoPeriodo({
  periodo,
  onCerrar,
}: {
  periodo: PeriodoDetalleRow | null
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const editando = periodo !== null

  const [codigo, setCodigo] = useState(periodo?.codigo ?? '')
  const [nombre, setNombre] = useState(periodo?.nombre ?? '')
  const [inicio, setInicio] = useState(periodo?.fecha_inicio ?? '')
  const [fin, setFin] = useState(periodo?.fecha_fin ?? '')
  const [enviado, setEnviado] = useState(false)

  const errorCodigo = !codigo.trim()
    ? 'El código es obligatorio.'
    : !/^[A-Za-z0-9-]{4,20}$/.test(codigo.trim())
      ? 'Formato tipo 2026-1 o 2026-B.'
      : null
  const errorNombre = nombre.trim().length < 3 ? 'Escribe el nombre del periodo.' : null
  const errorInicio = !inicio ? 'Indica la fecha de inicio.' : null
  const errorFin = !fin
    ? 'Indica la fecha de cierre.'
    : inicio && fin <= inicio
      ? 'El cierre debe ser posterior al inicio.'
      : null

  const valido = !errorCodigo && !errorNombre && !errorInicio && !errorFin

  const guardar = useMutation({
    mutationFn: async () => {
      const campos = {
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        fecha_inicio: inicio,
        fecha_fin: fin,
      }

      if (editando) {
        const { error } = await supabase.from('periodos').update(campos).eq('id', periodo.id)
        if (error) throw error
      } else {
        // Nace planificado: abrirlo es una decisión aparte, porque implica
        // cerrar el que esté vigente.
        const { error } = await supabase
          .from('periodos')
          .insert({ ...campos, estado: 'planificado' })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editando ? 'Periodo actualizado' : 'Periodo creado', {
        description: editando ? undefined : 'Ábrelo cuando quieras que sea el vigente.',
      })
      void qc.invalidateQueries({ queryKey: ['periodos'] })
      void qc.invalidateQueries({ queryKey: ['periodo'] })
      onCerrar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setEnviado(true)
    if (valido) guardar.mutate()
  }

  return (
    <Modal
      titulo={editando ? `Editar ${periodo.codigo}` : 'Crear periodo'}
      descripcion={
        editando
          ? 'Los cambios afectan a las actividades y solicitudes ya asociadas.'
          : 'Se crea como planificado. Abrirlo es un paso aparte.'
      }
      onCerrar={onCerrar}
    >
      <form onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Campo etiqueta="Código" requerido error={enviado ? errorCodigo : null}>
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                autoFocus
                placeholder="2026-1"
                className="font-mono"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              />
            )}
          </Campo>

          <Campo etiqueta="Nombre" requerido error={enviado ? errorNombre : null}>
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                placeholder="Periodo 2026-1"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            )}
          </Campo>

          <Campo etiqueta="Inicio" requerido error={enviado ? errorInicio : null}>
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                type="date"
                aria-describedby={describedBy}
                aria-invalid={invalido}
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            )}
          </Campo>

          <Campo etiqueta="Cierre" requerido error={enviado ? errorFin : null}>
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                type="date"
                aria-describedby={describedBy}
                aria-invalid={invalido}
                min={inicio || undefined}
                value={fin}
                onChange={(e) => setFin(e.target.value)}
              />
            )}
          </Campo>
        </div>

        <footer className="flex justify-end gap-2 border-t border-line p-4">
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variante="primario" cargando={guardar.isPending}>
            {editando ? 'Guardar cambios' : 'Crear periodo'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

// -----------------------------------------------------------------------------
// Apertura
//
// Es la operación con consecuencias: cierra el periodo vigente. El diálogo lo
// dice antes, no después.
// -----------------------------------------------------------------------------
function DialogoAbrir({
  periodo,
  vigente,
  onCerrar,
}: {
  periodo: PeriodoDetalleRow
  vigente: PeriodoDetalleRow | null
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const [copiar, setCopiar] = useState(true)

  const abrir = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('fn_abrir_periodo', {
        p_id: periodo.id,
        p_copiar_actividades: copiar,
      })
      if (error) throw error
      return data?.[0] ?? { cerrado_codigo: null, actividades_creadas: 0 }
    },
    onSuccess: (r) => {
      const partes = [
        r.cerrado_codigo ? `Se cerró ${r.cerrado_codigo}.` : null,
        r.actividades_creadas > 0
          ? `${r.actividades_creadas} actividades incorporadas.`
          : null,
      ].filter(Boolean)

      toast.success(`${periodo.codigo} es ahora el periodo vigente`, {
        description: partes.length > 0 ? partes.join(' ') : undefined,
      })
      void qc.invalidateQueries({ queryKey: ['periodos'] })
      void qc.invalidateQueries({ queryKey: ['periodo'] })
      void qc.invalidateQueries({ queryKey: ['metricas'] })
      void qc.invalidateQueries({ queryKey: ['actividad-periodo'] })
      onCerrar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  return (
    <Modal
      titulo={`Abrir ${periodo.codigo}`}
      descripcion="Pasará a ser el periodo que la aplicación asume por defecto."
      onCerrar={onCerrar}
    >
      <div className="flex flex-col gap-3 p-4">
        {vigente && (
          <p className="flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-body-sm text-warning-softFg">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Al abrir este periodo se <strong>cerrará {vigente.codigo}</strong>, porque sólo puede
              haber uno vigente a la vez.
              {vigente.solicitudes_sin_resolver > 0 && (
                <>
                  {' '}
                  Tiene {vigente.solicitudes_sin_resolver} solicitudes sin resolver; seguirán
                  accesibles desde la bandeja.
                </>
              )}
            </span>
          </p>
        )}

        {periodo.estado === 'cerrado' && (
          <p className="text-body-sm text-fg-muted">
            Este periodo estaba cerrado. Reabrirlo es válido para corregir un cierre prematuro; lo
            que ya contenía se conserva.
          </p>
        )}

        <Checkbox
          etiqueta="Incorporar las actividades activas"
          descripcion="Añade al periodo todas las actividades en estado «activa» que aún no estén en él. Sin esto, el periodo arranca vacío."
          checked={copiar}
          onChange={(e) => setCopiar(e.target.checked)}
        />
      </div>

      <footer className="flex justify-end gap-2 border-t border-line p-4">
        <Button onClick={onCerrar}>Cancelar</Button>
        <Button
          variante="primario"
          cargando={abrir.isPending}
          onClick={() => abrir.mutate()}
          iconoIzq={<PlayCircle className="size-4" />}
        >
          Abrir periodo
        </Button>
      </footer>
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
          'animate-[fade-rise_200ms_cubic-bezier(0.23,1,0.32,1)_both]',
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
