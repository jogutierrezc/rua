import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, MessageSquarePlus, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { fechaLarga, fechaRelativa, tiempoRestante } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { Avatar, Badge, Card, Skeleton } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  BUCKET_REGISTROS,
  ESTADO_VIGENCIA,
  MODALIDAD_PROGRAMA,
  NIVEL_PROGRAMA,
  TIPO_CUPOS,
} from './dominio'
import type { ProgramaObservacionRow, ProgramaUdesDetalleRow } from '@/types/database'

const MIN_OBSERVACION = 3

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-body-sm text-fg-subtle">{etiqueta}</dt>
      <dd className="truncate text-body text-fg">{valor || '—'}</dd>
    </div>
  )
}

export function DialogoDetallePrograma({
  programa,
  onCerrar,
  onEditar,
}: {
  programa: ProgramaUdesDetalleRow
  onCerrar: () => void
  onEditar?: () => void
}) {
  const { puede } = useAuth()
  const qc = useQueryClient()
  const [comentario, setComentario] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const { data: observaciones, isPending } = useQuery({
    queryKey: ['programas', programa.id, 'observaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programa_observaciones')
        .select('*')
        .eq('programa_id', programa.id)
        .order('creado_en', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProgramaObservacionRow[]
    },
  })

  const observar = useMutation({
    mutationFn: async () => {
      // Sólo viaja el comentario. Quién firma y con qué rol lo decide un
      // trigger en la base: una firma que pone el cliente no vale nada.
      const { error } = await supabase.from('programa_observaciones').insert({
        programa_id: programa.id,
        comentario: comentario.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      setComentario('')
      void qc.invalidateQueries({ queryKey: ['programas', programa.id, 'observaciones'] })
      void qc.invalidateQueries({ queryKey: ['programas'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const descargar = useMutation({
    mutationFn: async () => {
      if (!programa.rc_archivo_ruta) return
      // Enlace firmado y caducado: una resolución del Ministerio no es
      // documentación pública del portal.
      const { data, error } = await supabase.storage
        .from(BUCKET_REGISTROS)
        .createSignedUrl(programa.rc_archivo_ruta, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const vigencia = ESTADO_VIGENCIA[programa.estado_vigencia]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onCerrar}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={programa.nombre}
        className={cn(
          'relative my-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface shadow-overlay',
          'motion-safe:animate-[fade-rise_220ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-body-sm text-fg-muted">
                SNIES {programa.snies}
              </span>
              <span className="text-body-sm text-fg-subtle">
                Registro único: {programa.registro_unico ?? 'N/A'}
              </span>
              <Badge tono={vigencia.tono} punto>
                {vigencia.etiqueta}
              </Badge>
              {programa.cumple_ci_para_ac && <Badge tono="acento">Cumple CI para AC</Badge>}
            </div>
            <h2 className="mt-1.5 text-balance text-title text-fg">{programa.nombre}</h2>
            <p className="mt-0.5 text-body-sm text-fg-muted">
              {programa.facultad} · {NIVEL_PROGRAMA[programa.nivel]} · {programa.campus} ·{' '}
              {MODALIDAD_PROGRAMA[programa.modalidad]}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {onEditar && puede('planeacion.administrar') && (
              <Button
                tamano="sm"
                onClick={onEditar}
                iconoIzq={<Pencil className="size-3.5" />}
              >
                Editar
              </Button>
            )}
            <Button
              variante="fantasma"
              tamano="sm"
              soloIcono
              aria-label="Cerrar"
              onClick={onCerrar}
              iconoIzq={<X className="size-4" />}
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="flex flex-col gap-4">
              {/* Registro calificado ---------------------------------- */}
              <Card className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-label text-fg">Registro calificado</h3>
                  <span
                    className={cn(
                      'text-body-sm',
                      programa.estado_vigencia === 'vencido'
                        ? 'text-danger'
                        : programa.estado_vigencia === 'por_vencer'
                          ? 'text-warning'
                          : 'text-fg-muted',
                    )}
                  >
                    {tiempoRestante(programa.dias_para_vencimiento)}
                  </span>
                </div>

                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Dato etiqueta="N.º de resolución" valor={programa.rc_resolucion} />
                  <Dato
                    etiqueta="Fecha de registro"
                    valor={fechaLarga(programa.rc_fecha_registro)}
                  />
                  <Dato
                    etiqueta="Fecha de vencimiento"
                    valor={fechaLarga(programa.rc_fecha_vencimiento)}
                  />
                </dl>

                {programa.rc_archivo_ruta && (
                  <div className="mt-3 border-t border-line pt-3">
                    <Button
                      tamano="sm"
                      cargando={descargar.isPending}
                      onClick={() => descargar.mutate()}
                      iconoIzq={<Download className="size-3.5" />}
                    >
                      {programa.rc_archivo_nombre ?? 'Descargar resolución'}
                    </Button>
                  </div>
                )}
              </Card>

              {/* Acreditación y cupos --------------------------------- */}
              <Card className="p-4">
                <h3 className="text-label text-fg">Acreditación y cupos</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Dato etiqueta="Resolución de acreditación" valor={programa.ac_resolucion} />
                  <Dato
                    etiqueta="Fecha de la resolución"
                    valor={fechaLarga(programa.ac_fecha_resolucion)}
                  />
                  <Dato etiqueta="Registro único" valor={programa.registro_unico ?? 'N/A'} />
                  <Dato
                    etiqueta="Cupos aprobados"
                    valor={programa.cupos_aprobados?.toString()}
                  />
                  <Dato
                    etiqueta="Tipo de cupos"
                    valor={programa.tipo_cupos ? TIPO_CUPOS[programa.tipo_cupos] : null}
                  />
                  <Dato etiqueta="Año de creación" valor={programa.ano_creacion?.toString()} />
                </dl>
              </Card>
            </div>

            {/* Observaciones -------------------------------------------- */}
            <Card className="flex flex-col">
              <div className="border-b border-line p-4">
                <h3 className="text-label text-fg">Observaciones</h3>
                <p className="mt-0.5 text-body-sm text-fg-subtle">
                  Quedan firmadas con tu nombre y tu rol. No se editan ni se borran: si algo
                  cambia, se responde con otra.
                </p>
              </div>

              <div className="border-b border-line p-4">
                <Textarea
                  rows={3}
                  aria-label="Nueva observación"
                  placeholder="Ej. La renovación está radicada ante el Ministerio desde el 12 de marzo."
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    tamano="sm"
                    variante="primario"
                    disabled={comentario.trim().length < MIN_OBSERVACION}
                    cargando={observar.isPending}
                    onClick={() => observar.mutate()}
                    iconoIzq={<MessageSquarePlus className="size-3.5" />}
                  >
                    Añadir observación
                  </Button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {isPending ? (
                  <div className="flex flex-col gap-2 p-4">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                ) : !observaciones?.length ? (
                  <p className="px-4 py-6 text-center text-body-sm text-fg-subtle">
                    Todavía no hay observaciones sobre este programa.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {observaciones.map((o) => (
                      <li key={o.id} className="p-4">
                        <div className="flex items-center gap-2">
                          <Avatar nombre={o.autor_nombre} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-body-sm font-medium text-fg">
                              {o.autor_nombre}
                            </span>
                            <span className="block truncate text-body-sm text-fg-subtle">
                              {o.autor_rol ?? 'Sin rol'} · {fechaRelativa(o.creado_en)}
                            </span>
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-body-sm leading-relaxed text-fg-muted">
                          {o.comentario}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
