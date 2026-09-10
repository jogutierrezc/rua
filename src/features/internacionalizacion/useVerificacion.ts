import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { obtenerBearerTokenSesion, supabase } from '@/lib/supabase'
import { enLotes } from './dominio'
import type { EstadoVerificacion, RespuestaVerificacion, ResultadoVerificacion } from '@/types/database'

/**
 * Saca el mensaje real del error de una Edge Function.
 *
 * La función devuelve el detalle en el cuerpo aunque el estado sea 4xx; sin
 * leerlo, el usuario sólo vería «Edge Function returned a non-2xx status code»,
 * que no le dice si falta la clave, si se agotaron los créditos o si no tiene
 * permiso — que son tres problemas con tres soluciones distintas.
 */
async function detalleDelError(error: unknown, respaldo: string): Promise<string> {
  const ctx = error as { context?: { json?: () => Promise<unknown> } }
  try {
    const cuerpo = (await ctx.context?.json?.()) as { error?: string } | undefined
    if (cuerpo?.error) return cuerpo.error
  } catch {
    /* el cuerpo no era JSON: se usa el respaldo */
  }
  return respaldo
}

export interface ProgresoVerificacion {
  hechos: number
  total: number
}

/**
 * Verificación de correos contra el proveedor externo.
 *
 * La lista se trocea en lotes y se llama varias veces, en serie. Son dos
 * decisiones deliberadas:
 *
 *   · En lotes, porque la Edge Function tiene un tiempo máximo de ejecución y a
 *     un segundo por consulta —el ritmo que permite el plan— una lista larga se
 *     quedaría a medias sin decir por dónde iba.
 *   · En serie y no en paralelo, porque el límite del plan es por segundo:
 *     lanzar cinco lotes a la vez sólo conseguiría que el proveedor empezara a
 *     devolver «demasiadas consultas».
 *
 * A cambio se puede contar el avance, que es lo que convierte una espera de dos
 * minutos en algo tolerable.
 */
export function useVerificacion() {
  const qc = useQueryClient()
  const [progreso, setProgreso] = useState<ProgresoVerificacion | null>(null)

  /**
   * ¿Está configurada la clave del proveedor?
   *
   * Se pregunta con el cuerpo vacío: la función lo interpreta como una consulta
   * de diagnóstico y responde sin gastar un crédito. Nunca devuelve la clave,
   * sólo si existe.
   */
  const diagnostico = useQuery({
    queryKey: ['verificacion', 'diagnostico'],
    queryFn: async () => {
      const token = await obtenerBearerTokenSesion()
      if (!token) return { api_key: false }

      const { data, error } = await supabase.functions.invoke<RespuestaVerificacion>(
        'verificar-correo',
        { headers: { Authorization: `Bearer ${token}` }, body: {} },
      )
      if (error) return { api_key: false }
      return data?.diagnostico ?? { api_key: false }
    },
    // La configuración no cambia mientras se mira la pantalla; preguntarlo en
    // cada montaje sería una llamada de red por cada vuelta atrás.
    staleTime: 5 * 60_000,
    retry: false,
  })

  const verificar = useMutation({
    mutationFn: async ({ ids, forzar = false }: { ids: string[]; forzar?: boolean }) => {
      const token = await obtenerBearerTokenSesion()
      if (!token) {
        throw new Error('Tu sesión expiró o no se pudo renovar. Vuelve a iniciar sesión.')
      }

      const lotes = enLotes(ids)
      const resultados: ResultadoVerificacion[] = []
      setProgreso({ hechos: 0, total: ids.length })

      for (const lote of lotes) {
        const { data, error } = await supabase.functions.invoke<RespuestaVerificacion>(
          'verificar-correo',
          {
            headers: { Authorization: `Bearer ${token}` },
            body: { contacto_ids: lote, forzar },
          },
        )

        if (error) {
          // Se corta aquí, pero lo ya verificado NO se pierde: cada lote se
          // selló en la base al terminar. Se devuelve lo hecho junto al motivo,
          // para que el aviso pueda decir «se verificaron 40 de 120, y esto es
          // lo que falló».
          const mensaje = await detalleDelError(error, 'No se pudo verificar el lote.')
          throw Object.assign(new Error(mensaje), { parciales: resultados })
        }

        resultados.push(...(data?.resultados ?? []))
        setProgreso({ hechos: resultados.length, total: ids.length })
      }

      return resultados
    },
    onSettled: () => {
      setProgreso(null)
      void qc.invalidateQueries({ queryKey: ['contactos'] })
    },
  })

  /** Resume una tanda de resultados en un texto para el aviso. */
  const resumir = useCallback((resultados: ResultadoVerificacion[]) => {
    const cuenta = resultados.reduce<Record<string, number>>((acc, r) => {
      const clave = r.omitido ? 'omitidos' : r.estado
      acc[clave] = (acc[clave] ?? 0) + 1
      return acc
    }, {})

    const etiquetas: Record<string, string> = {
      valido: 'válidos',
      riesgoso: 'riesgosos',
      invalido: 'inválidos',
      error: 'sin respuesta',
      sin_verificar: 'sin verificar',
      omitidos: 'ya vigentes',
    }

    return (
      (Object.keys(etiquetas) as (EstadoVerificacion | 'omitidos')[])
        .filter((k) => cuenta[k])
        .map((k) => `${cuenta[k]} ${etiquetas[k]}`)
        .join(' · ') || 'Sin cambios'
    )
  }, [])

  return { verificar, progreso, diagnostico, resumir }
}
