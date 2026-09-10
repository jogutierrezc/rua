import { useEffect } from 'react'
import { CheckCircle2, MailCheck, Minus, Pencil, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { fechaRelativa } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Badge, Card } from '@/components/ui/primitives'
import type { TonoBadge } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/AuthProvider'
import { useVerificacion } from './useVerificacion'
import { ESTADO_VERIFICACION, ORIGEN_CONTACTO } from './dominio'
import type { ContactoDetalleRow } from '@/types/database'

/**
 * El riesgo de la dirección, en castellano.
 *
 * Se guarda la palabra del proveedor —low, medium, high— y se traduce sólo al
 * pintarla: es un valor de un catálogo ajeno, y traducirlo al guardarlo sería
 * inventarse una equivalencia que nadie ha definido.
 */
const RIESGO: Record<string, { etiqueta: string; tono: TonoBadge }> = {
  low: { etiqueta: 'Riesgo bajo', tono: 'exito' },
  medium: { etiqueta: 'Riesgo medio', tono: 'aviso' },
  high: { etiqueta: 'Riesgo alto', tono: 'peligro' },
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-body-sm text-fg-subtle">{etiqueta}</dt>
      <dd className="truncate text-body text-fg">{valor || '—'}</dd>
    </div>
  )
}

/**
 * Una señal del proveedor, en lenguaje llano.
 *
 * `null` no es `false`: significa que el proveedor no contestó a esa pregunta.
 * Pintar un aspa en ese caso afirmaría algo que nadie ha dicho, así que lleva un
 * guion y no un aspa.
 */
function Senal({
  etiqueta,
  valor,
  bueno = true,
}: {
  etiqueta: string
  valor: boolean | null
  /** Si el valor «bueno» para este contacto es `true` o es `false`. */
  bueno?: boolean
}) {
  const positivo = valor === bueno
  const Icono = valor === null ? Minus : positivo ? CheckCircle2 : XCircle

  return (
    <li className="flex items-center gap-2 text-body-sm">
      <Icono
        aria-hidden
        className={cn(
          'size-3.5 shrink-0',
          valor === null ? 'text-fg-subtle' : positivo ? 'text-success' : 'text-warning',
        )}
      />
      <span className={valor === null ? 'text-fg-subtle' : 'text-fg-muted'}>{etiqueta}</span>
    </li>
  )
}

export function DialogoDetalleContacto({
  contacto,
  onCerrar,
  onEditar,
}: {
  contacto: ContactoDetalleRow
  onCerrar: () => void
  onEditar?: () => void
}) {
  const { puede } = useAuth()
  const { verificar } = useVerificacion()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const ver = ESTADO_VERIFICACION[contacto.verificacion_estado]
  const puedeVerificar = puede('internacionalizacion.verificar')
  const seVerifico = contacto.verificacion_en !== null

  const verificarAhora = () =>
    verificar.mutate(
      // `forzar` porque el gesto es explícito: quien pulsa este botón sobre esta
      // ficha quiere preguntar AHORA, aunque el veredicto siguiera vigente.
      { ids: [contacto.id], forzar: true },
      {
        onSuccess: (r) => {
          const uno = r[0]
          if (!uno) return
          toast.success(ESTADO_VERIFICACION[uno.estado].etiqueta, { description: uno.mensaje ?? undefined })
        },
        onError: (e) => toast.error(mensajeDeError(e)),
      },
    )

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
        aria-label={contacto.nombre_completo}
        className={cn(
          'relative my-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface shadow-overlay',
          'motion-safe:animate-[fade-rise_220ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-title-sm text-fg">{contacto.nombre_completo}</h2>
            <p className="mt-0.5 truncate text-body-sm text-fg-muted">{contacto.cargo}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {contacto.pais_nombre && <Badge tono="neutro">{contacto.pais_nombre}</Badge>}
              {contacto.rol_etiqueta && <Badge tono="primario">{contacto.rol_etiqueta}</Badge>}
              {contacto.sector_etiqueta && <Badge tono="acento">{contacto.sector_etiqueta}</Badge>}
              {contacto.tipo_contacto !== 'general' && (
                <Badge tono="neutro">{ORIGEN_CONTACTO[contacto.tipo_contacto]}</Badge>
              )}
            </div>
          </div>
          <Button
            variante="fantasma"
            soloIcono
            aria-label="Cerrar"
            onClick={onCerrar}
            iconoIzq={<X className="size-4" />}
          />
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Dato etiqueta="Correo" valor={contacto.correo} />
            <Dato etiqueta="Teléfono" valor={contacto.telefono} />
            <Dato etiqueta="Organización" valor={contacto.organizacion} />
            <Dato etiqueta="Departamento o unidad" valor={contacto.departamento} />
            <Dato etiqueta="Área de conocimiento" valor={contacto.area_conocimiento} />
            <Dato etiqueta="Región" valor={contacto.pais_region} />
            {/* Cómo sale el nombre al exportar. Se enseña porque las plantillas
                lo piden partido en dos columnas, y si quedó mal partido —pasa
                con los nombres que llegaron enteros— aquí es donde se ve. */}
            <Dato etiqueta="Nombres (First Name)" valor={contacto.nombres} />
            <Dato etiqueta="Apellidos (Last Name)" valor={contacto.apellidos} />
            {contacto.fuente && (
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-body-sm text-fg-subtle">Origen de la nominación</dt>
                <dd className="text-body text-fg">{contacto.fuente}</dd>
              </div>
            )}
          </dl>

          {contacto.notas && (
            <div>
              <p className="text-body-sm text-fg-subtle">Notas</p>
              <p className="mt-0.5 whitespace-pre-wrap text-body text-fg">{contacto.notas}</p>
            </div>
          )}

          {/* Verificación ---------------------------------------------- */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-label text-fg">Verificación del correo</h3>
                  <Badge tono={ver.tono} punto>
                    {ver.etiqueta}
                  </Badge>
                </div>
                <p className="mt-1 text-body-sm text-fg-muted">
                  {contacto.verificacion_mensaje ?? ver.explicacion}
                </p>
              </div>

              {puedeVerificar && (
                <Button
                  tamano="sm"
                  variante={seVerifico ? 'secundario' : 'primario'}
                  cargando={verificar.isPending}
                  onClick={verificarAhora}
                  iconoIzq={<MailCheck className="size-4" />}
                >
                  {seVerifico ? 'Volver a verificar' : 'Verificar ahora'}
                </Button>
              )}
            </div>

            {seVerifico ? (
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <ul className="flex flex-col gap-1.5">
                  <Senal etiqueta="Estructura de correo válida" valor={contacto.formato_valido} />
                  <Senal etiqueta="El dominio tiene servidor de correo" valor={contacto.dominio_mx} />
                  <Senal etiqueta="El servidor acepta el buzón" valor={contacto.buzon_smtp} />
                  <Senal
                    etiqueta="No es un buzón temporal"
                    valor={contacto.es_desechable}
                    bueno={false}
                  />
                </ul>
                <ul className="flex flex-col gap-1.5">
                  <Senal
                    etiqueta="Es una persona, no un buzón genérico"
                    valor={contacto.es_generico}
                    bueno={false}
                  />
                  <Senal
                    etiqueta="El dominio no acepta cualquier dirección"
                    valor={contacto.acepta_todo}
                    bueno={false}
                  />
                  <Senal
                    etiqueta="Es un dominio institucional, no gratuito"
                    valor={contacto.es_gratuito}
                    bueno={false}
                  />
                  <Senal
                    etiqueta="El usuario no parece generado automáticamente"
                    valor={contacto.es_sospechoso}
                    bueno={false}
                  />
                  {contacto.calidad !== null && (
                    <li className="flex items-center gap-2 text-body-sm text-fg-muted">
                      <span className="tabular text-fg">
                        {Math.round(contacto.calidad * 100)}%
                      </span>
                      de calidad según el proveedor
                    </li>
                  )}
                  {/* El riesgo lo da Email Reputation y no Email Validation, así
                      que en los contactos verificados con la otra API viene
                      vacío. Se omite en vez de pintar un «desconocido»: una fila
                      que no dice nada es ruido. */}
                  {contacto.riesgo && (
                    <li className="flex items-center gap-2 text-body-sm text-fg-muted">
                      <Badge tono={RIESGO[contacto.riesgo]?.tono ?? 'neutro'}>
                        {RIESGO[contacto.riesgo]?.etiqueta ?? contacto.riesgo}
                      </Badge>
                      según el proveedor
                    </li>
                  )}
                </ul>

                <p className="text-body-sm text-fg-subtle sm:col-span-2">
                  Verificado {fechaRelativa(contacto.verificacion_en).toLowerCase()}
                  {contacto.verificado_por_nombre && ` por ${contacto.verificado_por_nombre}`}. Es un
                  hecho fechado, no una garantía permanente: los buzones se cierran.
                </p>
              </div>
            ) : (
              <p className="px-4 py-3 text-body-sm text-fg-subtle">
                Al importar sólo se comprobó que la dirección tuviera estructura de correo. Saber si
                el buzón existe y acepta mensajes exige preguntárselo al proveedor, y eso consume
                créditos del plan: por eso es un paso aparte.
              </p>
            )}
          </Card>

          <p className="text-body-sm text-fg-subtle">
            Añadido {fechaRelativa(contacto.creado_en).toLowerCase()}
            {contacto.creado_por_nombre && ` por ${contacto.creado_por_nombre}`}.
          </p>
        </div>

        {onEditar && (
          <footer className="flex shrink-0 justify-end gap-2 border-t border-line p-4">
            <Button onClick={onEditar} iconoIzq={<Pencil className="size-4" />}>
              Editar contacto
            </Button>
          </footer>
        )}
      </div>
    </div>
  )
}
