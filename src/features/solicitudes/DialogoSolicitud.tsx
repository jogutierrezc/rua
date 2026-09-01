import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronRight,
  Folder,
  Info,
  Loader2,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { fechaRelativa } from '@/lib/format'
import { ESTADO_SOLICITUD, PRIORIDAD, TIPO_SOLICITUD } from '@/lib/estados'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { Avatar, Badge, Card, Skeleton } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/AuthProvider'
import { RuaTracker } from './RuaTracker'
import { useExpediente } from './useExpediente'

const MIN_JUSTIFICACION = 20

export function DialogoSolicitud({
  solicitudId,
  onCerrar,
}: {
  solicitudId: string
  onCerrar: () => void
}) {
  const { perfil, puede } = useAuth()
  const qc = useQueryClient()
  const { data, isPending } = useExpediente(solicitudId)

  const [justificacion, setJustificacion] = useState('')
  const [confirmando, setConfirmando] = useState<'aprobar' | 'denegar' | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const decidir = useMutation({
    mutationFn: async (aprobar: boolean) => {
      const { data, error } = await supabase.rpc('fn_decidir_etapa', {
        p_solicitud_id: solicitudId,
        p_aprobar: aprobar,
        p_justificacion: justificacion.trim(),
      })
      if (error) throw error
      return data?.[0]
    },
    onSuccess: (r) => {
      toast.success(
        r?.estado_solicitud === 'aprobada'
          ? 'Solicitud aprobada — el expediente queda cerrado'
          : r?.estado_solicitud === 'denegada'
            ? 'Solicitud denegada'
            : 'Etapa firmada',
        {
          description: r?.siguiente_etapa
            ? 'Pasa a la siguiente validación de la cadena.'
            : undefined,
        },
      )
      setJustificacion('')
      setConfirmando(null)
      void qc.invalidateQueries({ queryKey: ['expediente'] })
      void qc.invalidateQueries({ queryKey: ['solicitudes'] })
      void qc.invalidateQueries({ queryKey: ['metricas'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const s = data?.solicitud
  const etapaVigente = data?.etapas.find((e) => e.estado === 'pendiente')
  // La última etapa no sólo aprueba: crea la actividad. Firmarla sin saberlo
  // sería la peor sorpresa posible, así que el aviso es explícito.
  const materializa = etapaVigente?.materializa ?? false

  // Puedo firmar si: hay etapa vigente, tengo SU permiso concreto, y no es mía.
  const puedoFirmar =
    Boolean(etapaVigente) &&
    puede(etapaVigente!.permiso_codigo) &&
    s?.solicitante_id !== perfil?.id

  const largo = justificacion.trim().length
  const suficiente = largo >= MIN_JUSTIFICACION

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onCerrar} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Expediente ${s?.folio ?? ''}`}
        className={cn(
          'relative my-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface shadow-overlay',
          'motion-safe:animate-[fade-rise_220ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        {/* Cabecera --------------------------------------------------- */}
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            {isPending || !s ? (
              <>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-2 h-4 w-64" />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-body-sm text-fg-muted">{s.folio}</span>
                  <Badge tono={TIPO_SOLICITUD[s.tipo].tono}>{TIPO_SOLICITUD[s.tipo].etiqueta}</Badge>
                  <Badge tono={ESTADO_SOLICITUD[s.estado].tono} punto>
                    {ESTADO_SOLICITUD[s.estado].etiqueta}
                  </Badge>
                  {s.prioridad !== 'normal' && (
                    <Badge tono={PRIORIDAD[s.prioridad].tono}>{PRIORIDAD[s.prioridad].etiqueta}</Badge>
                  )}
                </div>
                <h2 className="mt-1.5 text-balance text-title text-fg">
                  {s.objetivo_nomenclatura ?? 'Sin actividad asociada'}
                </h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-body-sm text-fg-muted">
                  <Avatar nombre={s.solicitante_nombre} url={s.solicitante_avatar} size="sm" />
                  {s.solicitante_nombre}
                  {s.solicitante_vicerrectoria && <span>· {s.solicitante_vicerrectoria}</span>}
                  <span className="text-fg-subtle">· {fechaRelativa(s.creado_en)}</span>
                </p>
              </>
            )}
          </div>

          <Button
            variante="fantasma"
            tamano="sm"
            soloIcono
            aria-label="Cerrar expediente"
            onClick={onCerrar}
            iconoIzq={<X className="size-4" />}
          />
        </header>

        {/* Cuerpo ----------------------------------------------------- */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas p-4">
          {isPending || !s ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Qué se está pidiendo, exactamente */}
              <Card className="p-4">
                <h3 className="text-label text-fg">Qué se solicita</h3>
                <p className="mt-2 whitespace-pre-line text-body leading-relaxed text-fg">
                  {s.concepto_justificativo}
                </p>
              </Card>

              {/* Actividad y subactividades afectadas */}
              {data.contexto.length > 0 && (
                <Card className="p-4">
                  <h3 className="flex items-center gap-2 text-label text-fg">
                    <Folder aria-hidden className="size-4 text-fg-subtle" />
                    Actividad y subactividades afectadas
                  </h3>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {data.contexto.map((a) => (
                      <li
                        key={a.id}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-body-sm',
                          a.id === s.actividad_id
                            ? 'bg-primary-soft text-primary-softFg'
                            : 'text-fg-muted',
                        )}
                        style={{ marginLeft: `${(a.nivel - data.contexto[0].nivel) * 1.25}rem` }}
                      >
                        {a.id !== s.actividad_id && (
                          <ChevronRight aria-hidden className="size-3 shrink-0 opacity-50" />
                        )}
                        <span className="font-mono">{a.codigo}</span>
                        <span className="truncate">{a.nomenclatura}</span>
                        {a.id === s.actividad_id && (
                          <span className="ml-auto shrink-0 text-overline uppercase">Afectada</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 flex items-start gap-1.5 text-body-sm text-fg-subtle">
                    <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {s.tipo === 'eliminar'
                      ? 'Al aprobar, la actividad y todo lo que cuelga de ella dejarán de estar disponibles.'
                      : 'El cambio se aplicará sobre esta rama de la estructura.'}
                  </p>
                </Card>
              )}

              {/* Propuesta, cuando se trata de crear algo nuevo */}
              {s.tipo === 'crear' && s.objetivo_codigo && (
                <Card className="p-4">
                  <h3 className="text-label text-fg">Actividad propuesta</h3>
                  <p className="mt-2 flex items-center gap-2 text-body text-fg">
                    <span className="font-mono text-fg-muted">{s.objetivo_codigo}</span>
                    {s.objetivo_nomenclatura}
                  </p>
                </Card>
              )}

              <RuaTracker solicitud={s} etapas={data.etapas} compacto />
            </div>
          )}
        </div>

        {/* Pie de decisión -------------------------------------------- */}
        {s && (
          <footer className="shrink-0 border-t border-line bg-surface p-4">
            {!etapaVigente ? (
              <p className="text-body-sm text-fg-muted">
                {s.estado === 'borrador'
                  ? 'Es un borrador: aún no ha entrado en el flujo de validación.'
                  : `Expediente cerrado ${s.resuelto_por_nombre ? `por ${s.resuelto_por_nombre}` : ''} · ${fechaRelativa(s.resuelto_en)}`}
              </p>
            ) : !puedoFirmar ? (
              <p className="flex items-start gap-2 text-body-sm text-fg-muted">
                <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                {s.solicitante_id === perfil?.id
                  ? 'No puedes validar tu propia solicitud. Está en manos de ' +
                    `${etapaVigente.etapa_nombre}.`
                  : `Esta solicitud espera la firma de ${etapaVigente.etapa_nombre}, y tu rol no tiene ese permiso.`}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="justificacion-decision"
                    className="flex flex-wrap items-baseline justify-between gap-2 text-label text-fg"
                  >
                    <span>
                      Justificación de {etapaVigente.etapa_nombre}
                      <span aria-hidden className="ml-0.5 text-danger">
                        *
                      </span>
                    </span>
                    <span
                      className={cn(
                        'tabular text-body-sm',
                        suficiente ? 'text-success' : 'text-fg-subtle',
                      )}
                    >
                      {largo} / {MIN_JUSTIFICACION} mín.
                    </span>
                  </label>

                  {/* Se pide también al APROBAR. Un expediente aprobado sin
                      motivo escrito no se puede auditar después. */}
                  <Textarea
                    id="justificacion-decision"
                    rows={3}
                    className="mt-1.5"
                    placeholder="Explica por qué apruebas o deniegas. Queda en el expediente y lo verá el solicitante."
                    value={justificacion}
                    onChange={(e) => setJustificacion(e.target.value)}
                  />
                </div>

                {confirmando ? (
                  <div
                    className={cn(
                      'flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5',
                      'motion-safe:animate-fade-rise',
                      confirmando === 'aprobar'
                        ? 'border-success/30 bg-success-soft text-success-softFg'
                        : 'border-danger/30 bg-danger-soft text-danger-softFg',
                    )}
                  >
                    <span className="text-body-sm">
                      {confirmando === 'aprobar'
                        ? materializa
                          ? s.tipo === 'crear'
                            ? 'Al firmar, la actividad se CREARÁ en la estructura maestra.'
                            : s.tipo === 'eliminar'
                              ? 'Al firmar, la actividad quedará ARCHIVADA en la estructura.'
                              : 'Al firmar, los cambios se APLICARÁN sobre la actividad.'
                          : data.etapas.filter((e) => e.estado === 'bloqueada').length > 0
                            ? 'Se firmará esta etapa y pasará a la siguiente validación.'
                            : 'Es la última firma: la solicitud quedará aprobada.'
                        : 'La solicitud quedará denegada y la cadena se detiene aquí.'}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <Button tamano="sm" onClick={() => setConfirmando(null)}>
                        Volver
                      </Button>
                      <Button
                        tamano="sm"
                        variante={confirmando === 'aprobar' ? 'primario' : 'peligro'}
                        cargando={decidir.isPending}
                        onClick={() => decidir.mutate(confirmando === 'aprobar')}
                        iconoIzq={
                          decidir.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : confirmando === 'aprobar' ? (
                            <Check className="size-4" />
                          ) : (
                            <Trash2 className="size-4" />
                          )
                        }
                      >
                        Confirmar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={onCerrar}>Cerrar</Button>
                    <Button
                      variante="peligro"
                      disabled={!suficiente}
                      title={suficiente ? undefined : 'Escribe la justificación primero'}
                      onClick={() => setConfirmando('denegar')}
                      iconoIzq={<X className="size-4" />}
                    >
                      Denegar
                    </Button>
                    <Button
                      variante="primario"
                      disabled={!suficiente}
                      title={suficiente ? undefined : 'Escribe la justificación primero'}
                      onClick={() => setConfirmando('aprobar')}
                      iconoIzq={<Check className="size-4" />}
                    >
                      {materializa ? 'Aprobar y crear' : 'Aprobar etapa'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
