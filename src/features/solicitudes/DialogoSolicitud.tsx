import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronRight,
  Folder,
  Gavel,
  Layers,
  Info,
  Loader2,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { dispararEnvioCorreos } from '@/lib/correo'
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

  /**
   * Resolución administrativa: firmar la cadena entera de una vez.
   *
   * Es un modo aparte y no el pie de siempre con más botones, a propósito.
   * Saltarse el flujo no es una variante de firmar una etapa; es otra cosa, y
   * la pantalla tiene que costar el gesto de entrar en ella.
   */
  const [modoAdmin, setModoAdmin] = useState(false)
  const [justificaciones, setJustificaciones] = useState<Record<string, string>>({})

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
      // Los triggers ya encolaron los avisos; esto los empuja ahora.
      dispararEnvioCorreos()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const resolverAdmin = useMutation({
    mutationFn: async (aprobar: boolean) => {
      const { data, error } = await supabase.rpc('fn_resolver_solicitud_admin', {
        p_solicitud_id: solicitudId,
        p_aprobar: aprobar,
        p_justificaciones: Object.fromEntries(
          Object.entries(justificaciones).map(([codigo, texto]) => [codigo, texto.trim()]),
        ),
      })
      if (error) throw error
      return data?.[0]
    },
    onSuccess: (r) => {
      const firmas = r?.etapas_firmadas ?? 0
      toast.success(
        r?.estado_solicitud === 'aprobada'
          ? `Expediente aprobado · ${firmas} ${firmas === 1 ? 'firma' : 'firmas'}`
          : 'Solicitud denegada',
        { description: 'Queda registrado en el expediente que la firma fue administrativa.' },
      )
      setJustificaciones({})
      setModoAdmin(false)
      setConfirmando(null)
      void qc.invalidateQueries({ queryKey: ['expediente'] })
      void qc.invalidateQueries({ queryKey: ['solicitudes'] })
      void qc.invalidateQueries({ queryKey: ['metricas'] })
      dispararEnvioCorreos()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const s = data?.solicitud
  const etapaVigente = data?.etapas.find((e) => e.estado === 'pendiente')
  // La última etapa no sólo aprueba: crea la actividad. Firmarla sin saberlo
  // sería la peor sorpresa posible, así que el aviso es explícito.
  const materializa = etapaVigente?.materializa ?? false

  // Puedo responder si: hay etapa esperando, tengo SU permiso concreto, y no
  // es mía. Es la misma condición que comprueba `fn_decidir_etapa` en la base;
  // aquí sólo decide qué se enseña.
  const puedoFirmar =
    Boolean(etapaVigente) &&
    puede(etapaVigente!.permiso_codigo) &&
    s?.solicitante_id !== perfil?.id

  /**
   * Las etapas que ya conceptué yo.
   *
   * Emitido el concepto, la acción se apaga hasta que la cadena llegue —si
   * llega— a otra etapa que también me toque. La base ya lo impide; lo que
   * faltaba era DECIRLO, en vez de dejar un botón que fallaría al pulsarlo.
   */
  const misEtapas = (data?.etapas ?? []).filter(
    (e) => e.revisor_id === perfil?.id && (e.estado === 'aprobada' || e.estado === 'denegada'),
  )

  const largo = justificacion.trim().length
  const suficiente = largo >= MIN_JUSTIFICACION

  // Lo que queda por firmar, en el orden de la cadena: la etapa vigente y las
  // que aún están bloqueadas detrás de ella.
  const restantes = useMemo(
    () =>
      (data?.etapas ?? [])
        .filter((e) => e.estado === 'pendiente' || e.estado === 'bloqueada')
        .sort((a, b) => a.orden - b.orden),
    [data],
  )

  // La guardia de autofirma tampoco se levanta aquí, igual que en la base: el
  // atajo es sobre el ORDEN del flujo, no sobre quién puede firmar qué.
  const puedeResolverAdmin =
    puede('roles.administrar') && restantes.length > 0 && s?.solicitante_id !== perfil?.id

  const largoDe = (codigo: string) => (justificaciones[codigo] ?? '').trim().length
  const todasEscritas =
    restantes.length > 0 && restantes.every((e) => largoDe(e.etapa_codigo) >= MIN_JUSTIFICACION)
  // Denegar detiene la cadena donde esté: sólo hace falta el motivo de la
  // etapa vigente, no el de las que ya nunca se van a firmar.
  const denegable = Boolean(etapaVigente) && largoDe(etapaVigente!.etapa_codigo) >= MIN_JUSTIFICACION
  const materializaAlguna = restantes.some((e) => e.materializa)

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

              {/* Qué actividades toca, y cómo quedan.

                  Es la tarjeta que decide si el revisor puede firmar con
                  criterio: sin el valor actual al lado del propuesto, «SUB-014
                  · Revisión de sílabos» no dice si eso es lo que hay o lo que
                  se pide. */}
              {data.lineas.length > 0 && (
                <Card className="p-4">
                  <h3 className="flex items-center gap-2 text-label text-fg">
                    <Layers aria-hidden className="size-4 text-fg-subtle" />
                    {data.lineas.length === 1
                      ? 'Actividad afectada'
                      : `${data.lineas.length} actividades afectadas`}
                  </h3>

                  <ul className="mt-3 flex flex-col divide-y divide-line">
                    {data.lineas.map((l, i) => {
                      const propuestoCodigo = l.propuesta_codigo ?? l.actual_codigo
                      const propuestaNomenclatura =
                        l.propuesta_nomenclatura ?? l.actual_nomenclatura
                      const cambiaCodigo =
                        Boolean(l.actual_codigo) && propuestoCodigo !== l.actual_codigo
                      const cambiaNombre =
                        Boolean(l.actual_nomenclatura) &&
                        propuestaNomenclatura !== l.actual_nomenclatura

                      return (
                        <li key={l.id} className="py-2.5 first:pt-0 last:pb-0">
                          <p className="text-body-sm text-fg-subtle">
                            {i + 1}.{' '}
                            {l.principal_codigo ? (
                              <>
                                <span className="font-mono">{l.principal_codigo}</span>{' '}
                                {l.principal_nomenclatura}
                              </>
                            ) : (
                              'Sin pilar declarado'
                            )}
                          </p>

                          {l.actual_codigo && (
                            <p
                              className={cn(
                                'mt-1 text-body-sm',
                                cambiaCodigo || cambiaNombre
                                  ? 'text-fg-subtle line-through'
                                  : 'text-fg-muted',
                              )}
                            >
                              <span className="font-mono">{l.actual_codigo}</span>{' '}
                              {l.actual_nomenclatura}
                            </p>
                          )}

                          {s.tipo !== 'eliminar' && (
                            <p className="mt-0.5 text-body text-fg">
                              <span className="font-mono text-fg-muted">
                                {propuestoCodigo ?? '—'}
                              </span>{' '}
                              {propuestaNomenclatura ?? 'Sin nomenclatura propuesta'}
                            </p>
                          )}

                          {l.aplicada_en && (
                            <p className="mt-0.5 text-body-sm text-success">
                              Aplicada {fechaRelativa(l.aplicada_en)}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              )}

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
            ) : modoAdmin ? (
              <div className="flex flex-col gap-3">
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-md border px-3 py-2.5 text-body-sm',
                    'border-warning/30 bg-warning-soft text-warning-softFg',
                  )}
                >
                  <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Vas a firmar en nombre de {restantes.length}{' '}
                    {restantes.length === 1 ? 'oficina' : 'oficinas'} sin esperar su turno. Cada
                    firma queda marcada como administrativa en el expediente, con tu nombre y el
                    motivo que escribas para cada una.
                  </span>
                </div>

                {/* Una justificación por rol, no una para todos. Un comentario
                    único para tres firmas sería la mitad de trabajo y el doble
                    de daño: nadie podría auditar después por qué se aprobó en
                    nombre de cada oficina. */}
                <ol className="flex flex-col gap-3">
                  {restantes.map((e, i) => {
                    const texto = justificaciones[e.etapa_codigo] ?? ''
                    const l = texto.trim().length
                    return (
                      <li key={e.id}>
                        <label
                          htmlFor={`justificacion-${e.etapa_codigo}`}
                          className="flex flex-wrap items-baseline justify-between gap-2 text-label text-fg"
                        >
                          <span>
                            {i + 1}. {e.etapa_nombre}
                            {e.materializa && (
                              <span className="ml-2 rounded border border-line px-1.5 py-px text-body-sm font-normal text-fg-muted">
                                crea la actividad
                              </span>
                            )}
                            <span aria-hidden className="ml-0.5 text-danger">
                              *
                            </span>
                          </span>
                          <span
                            className={cn(
                              'tabular text-body-sm',
                              l >= MIN_JUSTIFICACION ? 'text-success' : 'text-fg-subtle',
                            )}
                          >
                            {l} / {MIN_JUSTIFICACION} mín.
                          </span>
                        </label>
                        <Textarea
                          id={`justificacion-${e.etapa_codigo}`}
                          rows={2}
                          className="mt-1.5"
                          placeholder={`Por qué se aprueba en nombre de ${e.etapa_nombre}.`}
                          value={texto}
                          onChange={(ev) =>
                            setJustificaciones((j) => ({ ...j, [e.etapa_codigo]: ev.target.value }))
                          }
                        />
                      </li>
                    )
                  })}
                </ol>

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
                        ? `Se firmarán ${restantes.length} etapas en tu nombre y el expediente quedará aprobado` +
                          (materializaAlguna
                            ? s.tipo === 'crear'
                              ? ', creando la actividad en la estructura maestra.'
                              : s.tipo === 'eliminar'
                                ? ', archivando la actividad en la estructura.'
                                : ', aplicando los cambios sobre la actividad.'
                            : '.')
                        : `La solicitud quedará denegada en ${etapaVigente.etapa_nombre} y la cadena se detiene ahí.`}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <Button tamano="sm" onClick={() => setConfirmando(null)}>
                        Volver
                      </Button>
                      <Button
                        tamano="sm"
                        variante={confirmando === 'aprobar' ? 'primario' : 'peligro'}
                        cargando={resolverAdmin.isPending}
                        onClick={() => resolverAdmin.mutate(confirmando === 'aprobar')}
                        iconoIzq={
                          resolverAdmin.isPending ? (
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
                    <Button
                      className="mr-auto"
                      onClick={() => {
                        setModoAdmin(false)
                        setJustificaciones({})
                      }}
                    >
                      Volver al flujo normal
                    </Button>
                    <Button
                      variante="peligro"
                      disabled={!denegable}
                      title={
                        denegable
                          ? undefined
                          : `Escribe primero el motivo en ${etapaVigente.etapa_nombre}`
                      }
                      onClick={() => setConfirmando('denegar')}
                      iconoIzq={<X className="size-4" />}
                    >
                      Denegar
                    </Button>
                    <Button
                      variante="primario"
                      disabled={!todasEscritas}
                      title={todasEscritas ? undefined : 'Falta la justificación de alguna oficina'}
                      onClick={() => setConfirmando('aprobar')}
                      iconoIzq={<Gavel className="size-4" />}
                    >
                      Aprobar y cerrar ({restantes.length})
                    </Button>
                  </div>
                )}
              </div>
            ) : !puedoFirmar ? (
              <p className="flex items-start gap-2 text-body-sm text-fg-muted">
                <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                {s.solicitante_id === perfil?.id ? (
                  <span>
                    No puedes validar tu propia solicitud. Está en manos de{' '}
                    {etapaVigente.etapa_nombre}.
                  </span>
                ) : misEtapas.length > 0 ? (
                  <span>
                    Ya emitiste tu concepto en {misEtapas.map((e) => e.etapa_nombre).join(', ')}.
                    El expediente está ahora en manos de {etapaVigente.etapa_nombre}; tu acción
                    vuelve a activarse sólo si la cadena llega a otra etapa que te corresponda.
                  </span>
                ) : (
                  <span>
                    Este expediente espera el concepto de {etapaVigente.etapa_nombre}, y tu rol no
                    tiene ese permiso.
                  </span>
                )}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="justificacion-decision"
                    className="flex flex-wrap items-baseline justify-between gap-2 text-label text-fg"
                  >
                    <span>
                      Concepto de {etapaVigente.etapa_nombre}
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
                    placeholder="Fundamenta el concepto aprobatorio o de rechazo. Queda en el expediente y lo verá el solicitante."
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
                    {puedeResolverAdmin && restantes.length > 1 && (
                      <Button
                        className="mr-auto"
                        onClick={() => setModoAdmin(true)}
                        iconoIzq={<Gavel className="size-4" />}
                      >
                        Resolver como administración
                      </Button>
                    )}
                    <Button onClick={onCerrar}>Cerrar</Button>
                    <Button
                      variante="peligro"
                      disabled={!suficiente}
                      title={suficiente ? undefined : 'Escribe el concepto primero'}
                      onClick={() => setConfirmando('denegar')}
                      iconoIzq={<X className="size-4" />}
                    >
                      Rechazar
                    </Button>
                    <Button
                      variante="primario"
                      disabled={!suficiente}
                      title={suficiente ? undefined : 'Escribe el concepto primero'}
                      onClick={() => setConfirmando('aprobar')}
                      iconoIzq={<Check className="size-4" />}
                    >
                      {materializa ? 'Aprobar y crear' : 'Aprobar'}
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
