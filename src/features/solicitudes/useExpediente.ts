import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  ActividadArbolRow,
  SolicitudDetalleRow,
  SolicitudEtapaRow,
} from '@/types/database'

/**
 * Carga el expediente completo de una solicitud.
 *
 * Lo comparten la vista ampliada del revisor y el Rua Tracker del solicitante,
 * a propósito: dos consultas distintas para el mismo trámite acabarían
 * mostrando cosas distintas, y ahí nacen las discusiones sobre quién tiene
 * razón.
 */
export function useExpediente(solicitudId: string | null) {
  return useQuery({
    queryKey: ['expediente', solicitudId],
    enabled: Boolean(solicitudId),
    queryFn: async () => {
      const [solicitud, etapas] = await Promise.all([
        supabase.from('v_solicitudes_detalle').select('*').eq('id', solicitudId!).single(),
        supabase
          .from('v_solicitud_etapas')
          .select('*')
          .eq('solicitud_id', solicitudId!)
          .order('orden'),
      ])

      if (solicitud.error) throw solicitud.error
      if (etapas.error) throw etapas.error

      const s = solicitud.data as SolicitudDetalleRow

      // La actividad afectada y lo que cuelga de ella. Sin esto el revisor no
      // sabe SOBRE QUÉ está firmando, que es justo lo que faltaba.
      let contexto: ActividadArbolRow[] = []
      if (s.actividad_id) {
        const { data } = await supabase
          .from('v_actividades_arbol')
          .select('*')
          .or(`id.eq.${s.actividad_id},padre_id.eq.${s.actividad_id}`)
          .order('nivel')
          .order('orden')
        contexto = (data ?? []) as ActividadArbolRow[]
      }

      return {
        solicitud: s,
        etapas: (etapas.data ?? []) as SolicitudEtapaRow[],
        contexto,
      }
    },
  })
}
