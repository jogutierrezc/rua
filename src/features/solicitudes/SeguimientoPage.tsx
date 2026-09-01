import { useParams } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { LinkButton } from '@/components/ui/LinkButton'
import { RuaTracker } from './RuaTracker'
import { useExpediente } from './useExpediente'

/**
 * Rua Tracker a pantalla completa.
 *
 * Es la vista del SOLICITANTE: no ofrece firmar nada, sólo responde «¿en qué va
 * lo mío?». Comparte componente con el diálogo del revisor para que ambos vean
 * exactamente el mismo expediente; dos vistas distintas del mismo trámite es
 * como se generan las discusiones sobre quién tiene razón.
 */
export function SeguimientoPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isPending, isError } = useExpediente(id ?? null)

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <EmptyState
        icono={<Activity className="size-5" />}
        titulo="No se encontró la solicitud"
        descripcion="Puede que se haya eliminado, o que no tengas acceso a ella."
        accion={
          <LinkButton to="/solicitudes" variante="primario">
            Volver a solicitudes
          </LinkButton>
        }
      />
    )
  }

  const { solicitud, etapas } = data

  return (
    <>
      <PageHeader
        titulo="Rua Tracker"
        descripcion={`Seguimiento del expediente ${solicitud.folio}: ${solicitud.objetivo_nomenclatura ?? 'sin actividad asociada'}.`}
        volver={{ a: '/solicitudes', etiqueta: 'Volver a solicitudes' }}
      />

      <RuaTracker solicitud={solicitud} etapas={etapas} />

      {/* Lo que pidió el solicitante, tal cual lo escribió. Verlo aquí evita
          tener que abrir otra pantalla para recordar qué se pidió. */}
      <Card className="mt-4 p-4">
        <h3 className="text-label text-fg">Concepto justificativo presentado</h3>
        <p className="mt-2 whitespace-pre-line text-body leading-relaxed text-fg-muted">
          {solicitud.concepto_justificativo}
        </p>
      </Card>
    </>
  )
}
