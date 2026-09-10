import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, MailCheck, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { fechaRelativa, fmtNumero } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Pagination,
  Skeleton,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives'
import { useVerificacion } from './useVerificacion'
import { ESTADO_VERIFICACION, ESTADOS_VERIFICACION } from './dominio'
import type { ContactoDetalleRow, EstadoVerificacion } from '@/types/database'

const POR_PAGINA = 25

/**
 * Tope de una tanda.
 *
 * No es un límite técnico: es un freno. Cada consulta gasta un crédito del plan,
 * y lanzar cinco mil de una vez es la clase de gesto que se lamenta a mitad. Con
 * el tope, verificar un directorio grande son varias tandas conscientes en vez
 * de un clic irreversible.
 */
const MAX_TANDA = 200

export function VerificacionPage() {
  const [foco, setFoco] = useState<EstadoVerificacion>('sin_verificar')
  const [pagina, setPagina] = useState(0)

  const { verificar, progreso, diagnostico, resumir } = useVerificacion()

  /** Cuántos contactos hay en cada estado. Es el panel de control de la pantalla. */
  const { data: conteos, isPending: contando } = useQuery({
    queryKey: ['contactos', 'conteos'],
    queryFn: async () => {
      const entradas = await Promise.all(
        ESTADOS_VERIFICACION.map(async (estado) => {
          const { count, error } = await supabase
            .from('contactos_internacionales')
            .select('id', { count: 'exact', head: true })
            .eq('estado', 'activo')
            .eq('verificacion_estado', estado)
          if (error) throw error
          return [estado, count ?? 0] as const
        }),
      )
      return Object.fromEntries(entradas) as Record<EstadoVerificacion, number>
    },
  })

  const { data, isPending } = useQuery({
    queryKey: ['contactos', 'verificacion', foco, pagina],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('v_contactos_internacionales')
        .select('*', { count: 'exact' })
        .eq('estado', 'activo')
        .eq('verificacion_estado', foco)
        .order('nombre_completo')
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)

      if (error) throw error
      return { filas: (data ?? []) as ContactoDetalleRow[], total: count ?? 0 }
    },
    placeholderData: (prev) => prev,
  })

  /**
   * Verifica una tanda del estado enfocado.
   *
   * Se piden los identificadores en el momento —no se reutilizan los de la
   * página— porque la tanda va sobre TODO el grupo, no sobre lo que se está
   * viendo. Verificar sólo los veinticinco de la pantalla obligaría a pasar
   * página a página, que es justo lo que esta pantalla evita.
   */
  const lanzarTanda = async () => {
    try {
      const { data, error } = await supabase
        .from('contactos_internacionales')
        .select('id')
        .eq('estado', 'activo')
        .eq('verificacion_estado', foco)
        .order('nombre_completo')
        .limit(MAX_TANDA)

      if (error) throw error
      const ids = (data ?? []).map((c) => c.id)
      if (ids.length === 0) {
        toast.info('No queda ninguno en este grupo.')
        return
      }

      verificar.mutate(
        // Se fuerza cuando el grupo no es «sin verificar»: si alguien pide
        // reintentar los inválidos, es porque quiere volver a preguntar, no que
        // se le devuelva el veredicto guardado.
        { ids, forzar: foco !== 'sin_verificar' },
        {
          onSuccess: (r) => toast.success(`Verificación terminada · ${resumir(r)}`),
          onError: (e) => toast.error(mensajeDeError(e)),
        },
      )
    } catch (e) {
      toast.error(mensajeDeError(e))
    }
  }

  const enFoco = conteos?.[foco] ?? 0
  const config = diagnostico.data
  const sinClave = config?.api_key === false && !diagnostico.isPending

  return (
    <>
      <PageHeader
        titulo="Verificación de correos"
        descripcion="Comprueba con el proveedor externo qué buzones existen de verdad. Cada consulta gasta un crédito del plan."
        volver={{ a: '/internacionalizacion/contactos', etiqueta: 'Volver a Contactos' }}
      />

      <div className="flex flex-col gap-4">
        {/* Configuración ------------------------------------------------ */}
        {sinClave && (
          <Card className="flex items-start gap-3 border-warning/40 bg-warning-soft p-4">
            <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-softFg" />
            <div className="min-w-0 text-body-sm text-warning-softFg">
              <p className="font-medium">Falta la clave de AbstractAPI.</p>
              <p className="mt-1">
                Sin ella no se puede verificar nada. Se configura una sola vez, en el servidor:{' '}
                <code className="rounded bg-surface px-1 py-0.5 font-mono text-fg">
                  supabase secrets set ABSTRACT_API_KEY=…
                </code>
              </p>
            </div>
          </Card>
        )}

        {/* Qué clave está cargada.

            No la clave: su longitud y sus extremos. Cuando el proveedor la
            rechaza, la pregunta deja de ser si hay una clave y pasa a ser CUÁL
            hay —si es la del servicio equivocado, si se pegó a medias—, y eso se
            comprueba de un vistazo contra el panel de Abstract. La de Email
            Validation son 32 caracteres; si aquí sale otra cosa, ya está la
            respuesta. */}
        {config?.api_key && config.huella && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-body-sm text-fg-subtle">
            <KeyRound aria-hidden className="size-3.5 shrink-0" />
            <span>
              Clave cargada:{' '}
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-fg-muted">
                {config.huella}
              </code>{' '}
              · <span className="tabular">{config.longitud}</span> caracteres
            </span>
            <span>
              Se pregunta a <strong>{config.api ?? 'Email Reputation'}</strong>. Cada API de
              Abstract tiene su propia clave: compruébala contra ese producto y no contra otro.
            </span>
          </p>
        )}

        {/* Estado de la libreta ----------------------------------------- */}
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ESTADOS_VERIFICACION.map((estado) => {
            const meta = ESTADO_VERIFICACION[estado]
            const activo = estado === foco
            return (
              <button
                key={estado}
                onClick={() => {
                  setFoco(estado)
                  setPagina(0)
                }}
                aria-pressed={activo}
                className={cn(
                  'rounded-lg border p-3 text-left shadow-xs',
                  'transition-[border-color,background-color] duration-fast ease-out',
                  activo
                    ? 'border-primary bg-primary-soft'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                <p
                  className={cn(
                    'text-overline uppercase',
                    activo ? 'text-primary-softFg' : 'text-fg-subtle',
                  )}
                >
                  {meta.etiqueta}
                </p>
                {contando ? (
                  <Skeleton className="mt-1 h-6 w-12" />
                ) : (
                  <p className="mt-0.5 text-title-lg tabular text-fg">
                    {fmtNumero.format(conteos?.[estado] ?? 0)}
                  </p>
                )}
              </button>
            )
          })}
        </div>

        {/* La tanda ------------------------------------------------------ */}
        <Card>
          <CardHeader
            titulo={ESTADO_VERIFICACION[foco].etiqueta}
            descripcion={ESTADO_VERIFICACION[foco].explicacion}
            icono={<MailCheck className="size-4" />}
            acciones={
              <Button
                variante="primario"
                disabled={enFoco === 0 || sinClave}
                cargando={verificar.isPending}
                onClick={() => void lanzarTanda()}
                iconoIzq={
                  foco === 'sin_verificar' ? (
                    <MailCheck className="size-4" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )
                }
              >
                {foco === 'sin_verificar' ? 'Verificar' : 'Volver a verificar'}{' '}
                {fmtNumero.format(Math.min(enFoco, MAX_TANDA))}
              </Button>
            }
          />

          {progreso && (
            <div className="border-b border-line px-4 py-3">
              <div className="flex items-center justify-between text-body-sm text-fg-muted">
                <span>Consultando al proveedor…</span>
                <span className="tabular">
                  {fmtNumero.format(progreso.hechos)} de {fmtNumero.format(progreso.total)}
                </span>
              </div>
              {/* Sólo se anima el ancho de una barra ya presente: no hay salto de
                  layout, y el avance se lee de un vistazo sin contar números. */}
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.round((progreso.hechos / Math.max(progreso.total, 1)) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-body-sm text-fg-subtle">
                Va a un correo por segundo: es el ritmo que permite el plan. Puedes seguir
                trabajando en otra pestaña, pero no cierres ésta.
              </p>
            </div>
          )}

          {enFoco > MAX_TANDA && !progreso && (
            <p className="border-b border-line px-4 py-2.5 text-body-sm text-fg-subtle">
              Hay {fmtNumero.format(enFoco)} en este grupo y cada tanda cubre {MAX_TANDA}. Repite la
              operación hasta vaciarlo: el tope existe para que verificar un directorio entero sea
              una decisión consciente y no un clic.
            </p>
          )}

          {isPending ? (
            <TableSkeleton filas={6} columnas={4} />
          ) : !data?.filas.length ? (
            <EmptyState
              titulo={`Ningún contacto ${ESTADO_VERIFICACION[foco].etiqueta.toLowerCase()}`}
              descripcion="Elige otro grupo arriba para ver los que sí necesitan atención."
            />
          ) : (
            <>
              <TableShell>
                <thead>
                  <tr>
                    <Th>Contacto</Th>
                    <Th className="w-60">Correo</Th>
                    <Th className="w-36">Última consulta</Th>
                    <Th>Diagnóstico</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map((c) => (
                    <Tr key={c.id}>
                      <Td className="max-w-0">
                        <span className="block truncate font-medium text-fg">
                          {c.nombre_completo}
                        </span>
                        <span className="block truncate text-body-sm text-fg-subtle">
                          {c.organizacion ?? c.cargo}
                        </span>
                      </Td>
                      <Td className="max-w-0">
                        <span className="block truncate font-mono text-body-sm text-fg-muted">
                          {c.correo}
                        </span>
                        {c.correccion && (
                          <Badge tono="aviso" className="mt-0.5">
                            ¿{c.correccion}?
                          </Badge>
                        )}
                      </Td>
                      <Td className="text-body-sm text-fg-subtle">
                        {c.verificacion_en ? fechaRelativa(c.verificacion_en) : 'Nunca'}
                      </Td>
                      <Td className="max-w-0 text-body-sm text-fg-muted">
                        <span className="block truncate">
                          {c.verificacion_mensaje ?? ESTADO_VERIFICACION[foco].explicacion}
                        </span>
                      </Td>
                    </Tr>
                  ))}
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
    </>
  )
}
