import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Badge, Skeleton } from '@/components/ui/primitives'
import type { FilaEliminacion } from '@/types/database'

const CONFIRMACION = 'ELIMINAR'

/**
 * Confirmación de borrado.
 *
 * El FK es ON DELETE CASCADE: borrar una rama se lleva todo lo que cuelga de
 * ella. Preguntar «¿estás seguro?» sin decir QUÉ desaparece no es una
 * confirmación, es un trámite. Aquí se lista fila por fila, y se ofrece
 * archivar —que es reversible— como primera salida.
 */
export function DialogoEliminar({
  ids,
  onCerrar,
}: {
  ids: string[]
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const [confirmacion, setConfirmacion] = useState('')

  const { data: afectadas, isPending } = useQuery({
    queryKey: ['previsualizar-eliminacion', ids],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_previsualizar_eliminacion', { p_ids: ids })
      if (error) throw error
      return (data ?? []) as FilaEliminacion[]
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const eliminar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('actividades').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(
        afectadas && afectadas.length > ids.length
          ? `${afectadas.length} actividades eliminadas`
          : `${ids.length} ${ids.length === 1 ? 'actividad eliminada' : 'actividades eliminadas'}`,
      )
      void qc.invalidateQueries({ queryKey: ['actividades'] })
      onCerrar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const archivar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('fn_cambiar_estado_actividades', {
        p_ids: ids,
        p_estado: 'archivada',
        p_incluir_descendientes: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Actividades archivadas', {
        description: 'Siguen en el sistema y puedes reactivarlas cuando quieras.',
      })
      void qc.invalidateQueries({ queryKey: ['actividades'] })
      onCerrar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const enCascada = afectadas?.filter((a) => !a.seleccionada) ?? []
  const conSolicitudes = afectadas?.filter((a) => a.solicitudes > 0) ?? []
  const puedeEliminar = confirmacion.trim().toUpperCase() === CONFIRMACION

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} aria-hidden />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-eliminar"
        className={cn(
          'relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface-raised shadow-overlay',
          // Los modales sí escalan desde el centro: no están anclados a un
          // disparador concreto, aparecen en medio del viewport.
          'animate-[fade-rise_200ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger-soft text-danger-softFg">
            <TriangleAlert className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="titulo-eliminar" className="text-title-sm text-fg">
              Eliminar {ids.length === 1 ? 'esta actividad' : `${ids.length} actividades`}
            </h2>
            <p className="mt-0.5 text-body-sm text-fg-muted">
              Esta acción no se puede deshacer.
            </p>
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          ) : (
            <>
              {enCascada.length > 0 && (
                <p className="mb-3 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-body-sm text-warning-softFg">
                  Se eliminarán también <strong>{enCascada.length}</strong>{' '}
                  {enCascada.length === 1 ? 'actividad que cuelga' : 'actividades que cuelgan'} de
                  las seleccionadas.
                </p>
              )}

              {conSolicitudes.length > 0 && (
                <p className="mb-3 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-body-sm text-danger-softFg">
                  {conSolicitudes.length}{' '}
                  {conSolicitudes.length === 1
                    ? 'tiene solicitudes asociadas que quedarán'
                    : 'tienen solicitudes asociadas que quedarán'}{' '}
                  sin actividad de referencia. Considera archivar en su lugar.
                </p>
              )}

              <ul className="divide-y divide-line rounded-md border border-line">
                {afectadas?.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 px-3 py-2"
                    style={{ paddingLeft: `${0.75 + a.nivel * 1}rem` }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-fg">{a.nomenclatura}</span>
                      <span className="block font-mono text-body-sm text-fg-subtle">
                        {a.codigo}
                      </span>
                    </span>
                    {a.solicitudes > 0 && (
                      <Badge tono="peligro">
                        {a.solicitudes} {a.solicitudes === 1 ? 'solicitud' : 'solicitudes'}
                      </Badge>
                    )}
                    {!a.seleccionada && <Badge tono="aviso">En cascada</Badge>}
                  </li>
                ))}
              </ul>

              {/* Escribir la palabra obliga a leer la lista de arriba. Se
                  reserva para lo irreversible: pedirlo en todo entrena a la
                  gente a teclear sin mirar. */}
              <label className="mt-4 block">
                <span className="block text-body-sm text-fg-muted">
                  Escribe <strong className="font-mono text-fg">{CONFIRMACION}</strong> para
                  confirmar
                </span>
                <Input
                  className="mt-1.5"
                  autoComplete="off"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                />
              </label>
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line p-4">
          <Button
            className="mr-auto"
            cargando={archivar.isPending}
            onClick={() => archivar.mutate()}
            iconoIzq={<Archive className="size-4" />}
          >
            Archivar en su lugar
          </Button>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button
            variante="peligro"
            disabled={!puedeEliminar}
            cargando={eliminar.isPending}
            onClick={() => eliminar.mutate()}
          >
            Eliminar definitivamente
          </Button>
        </footer>
      </div>
    </div>
  )
}
