import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ContactoCatalogoRow, PaisRow, TipoCatalogoContacto } from '@/types/database'

/**
 * Los catálogos del módulo.
 *
 * Se guardan con `staleTime` largo porque son justamente lo que no cambia: la
 * lista de países del mundo no se mueve, y los roles y sectores se tocan una vez
 * cada varios meses. Volver a pedirlos en cada montaje sería una consulta de red
 * por cada vuelta atrás del navegador para recibir siempre lo mismo.
 */
const UNA_HORA = 60 * 60_000

export function usePaises() {
  return useQuery({
    queryKey: ['paises'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paises')
        .select('*')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      return (data ?? []) as PaisRow[]
    },
    staleTime: UNA_HORA,
  })
}

/**
 * Los países agrupados por región.
 *
 * Un desplegable de doscientas entradas en orden alfabético es una lista donde
 * no se encuentra nada; con `optgroup` por continente, la mitad del trabajo de
 * buscar ya está hecho.
 */
export function paisesPorRegion(paises: PaisRow[]) {
  const mapa = new Map<string, PaisRow[]>()
  for (const p of paises) {
    const lista = mapa.get(p.region) ?? []
    lista.push(p)
    mapa.set(p.region, lista)
  }
  return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
}

export function useCatalogo(tipo: TipoCatalogoContacto, incluirInactivos = false) {
  return useQuery({
    queryKey: ['contacto-catalogo', tipo, incluirInactivos],
    queryFn: async () => {
      let q = supabase.from('contacto_catalogo').select('*').eq('tipo', tipo)
      // Los inactivos sólo se piden desde la pantalla que los mantiene: en un
      // formulario, ofrecer un sector retirado sería volver a sembrarlo.
      if (!incluirInactivos) q = q.eq('activo', true)

      const { data, error } = await q.order('orden').order('etiqueta')
      if (error) throw error
      return (data ?? []) as ContactoCatalogoRow[]
    },
    staleTime: UNA_HORA,
  })
}
