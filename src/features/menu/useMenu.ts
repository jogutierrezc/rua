import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { GRUPOS_POR_DEFECTO, RUTAS_MENU } from '@/lib/rutas'
import { useAuth } from '@/features/auth/AuthProvider'
import type { CodigoPermiso, MenuEntradaRow, MenuGrupoRow } from '@/types/database'

export interface EntradaMenu {
  codigo: string
  etiqueta: string
  ruta: string
  icono: string
  exacta: boolean
}

export interface GrupoMenu {
  codigo: string
  titulo: string
  entradas: EntradaMenu[]
}

type GrupoConEntradas = MenuGrupoRow & { menu_entradas: MenuEntradaRow[] }

/**
 * El menú del usuario, ya filtrado por sus permisos.
 *
 * Devuelve además de dónde salió. No es un detalle: si la barra lateral se está
 * pintando desde el catálogo del código en vez de desde la base, el
 * administrador tiene que enterarse — sus cambios no se estarían aplicando y
 * desde fuera se ve idéntico.
 */
export function useMenu() {
  const { puede } = useAuth()

  const { data, isPending, isError } = useQuery({
    queryKey: ['menu'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_grupos')
        .select('*, menu_entradas(*)')
        .eq('activo', true)
        .order('orden')
      if (error) throw error
      return (data ?? []) as unknown as GrupoConEntradas[]
    },
    // El menú cambia una vez cada varios meses; no hay razón para volver a
    // pedirlo en cada navegación.
    staleTime: 5 * 60_000,
    // Sin reintentos: si la tabla no existe todavía, insistir sólo retrasa el
    // menú de emergencia.
    retry: false,
  })

  const visible = (permiso: string | null | undefined) =>
    !permiso || puede(permiso as CodigoPermiso)

  const deLaBase: GrupoMenu[] = (data ?? [])
        .map((g) => ({
          codigo: g.codigo,
          titulo: g.titulo,
          entradas: (g.menu_entradas ?? [])
            .filter((e) => e.visible && visible(e.permiso_codigo))
            // Empates de `orden` resueltos por etiqueta: estable, no aleatorio.
            .sort((a, b) => a.orden - b.orden || a.etiqueta.localeCompare(b.etiqueta))
            .map((e) => ({
              codigo: e.codigo,
              etiqueta: e.etiqueta,
              ruta: e.ruta,
              icono: e.icono,
              exacta: e.coincidencia_exacta,
            })),
        }))
        .filter((g) => g.entradas.length > 0)

  /**
   * Se usa la base sólo si de ella sale ALGO.
   *
   * No basta con que la consulta funcione: un administrador puede esconder
   * todas las entradas, o borrar todos los grupos, y dejar a la institución
   * entera sin barra lateral — incluida la pantalla desde la que deshacerlo.
   * Con esta condición, quedarse sin menú es imposible: lo peor que pasa es
   * que reaparezca el de fábrica.
   */
  const desdeLaBase = deLaBase.length > 0

  const grupos: GrupoMenu[] = desdeLaBase
    ? deLaBase
    : // Menú de emergencia: la consulta falló, las tablas aún no están, o la
      // configuración dejó la barra vacía. Se pinta desde el catálogo del
      // código, porque un portal navegable importa más que reflejar la
      // configuración al pie de la letra.
      GRUPOS_POR_DEFECTO.map((g) => ({
        codigo: g.codigo,
        titulo: g.titulo,
        entradas: RUTAS_MENU.filter(
          (r) => r.inicial && r.grupo === g.codigo && visible(r.permiso),
        ).map((r) => ({
          codigo: r.ruta,
          etiqueta: r.etiqueta,
          ruta: r.ruta,
          icono: r.icono,
          exacta: Boolean(r.exacta),
        })),
      })).filter((g) => g.entradas.length > 0)

  return { grupos, desdeLaBase, cargando: isPending, fallo: isError }
}
