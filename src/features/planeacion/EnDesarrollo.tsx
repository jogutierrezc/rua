import { HardHat } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, EmptyState } from '@/components/ui/primitives'

/**
 * Submódulo declarado pero todavía sin construir.
 *
 * Existe en el menú a propósito. Un módulo que aparece a medias —dos entradas
 * hoy, dos más dentro de un mes— obliga a la gente a redescubrir dónde está
 * cada cosa; declarando la forma final desde el principio, lo único que cambia
 * es que las casillas se van llenando.
 *
 * Y dice qué falta, no sólo que falta: «en desarrollo» a secas hace que la
 * gente vuelva a probar cada semana por si acaso.
 */
export function EnDesarrollo({
  titulo,
  descripcion,
  queFalta,
}: {
  titulo: string
  descripcion: string
  queFalta: string
}) {
  return (
    <>
      <PageHeader titulo={titulo} descripcion={descripcion} />
      <Card>
        <EmptyState
          icono={<HardHat className="size-5" />}
          titulo="Este submódulo todavía no está construido"
          descripcion={queFalta}
        />
      </Card>
    </>
  )
}

export const ProgramasSniesPage = () => (
  <EnDesarrollo
    titulo="Programas SNIES"
    descripcion="La oferta tal como la registra el Ministerio de Educación Nacional."
    queFalta="Falta definir qué campos del SNIES se traen y si se sincronizan contra el sistema del Ministerio o se cargan a mano. Mientras tanto, la información de los programas propios está en Programas UDES."
  />
)

export const OtraInformacionPage = () => (
  <EnDesarrollo
    titulo="Otra Información de Programas"
    descripcion="Datos complementarios de la oferta académica."
    queFalta="Falta definir qué información complementaria se guarda aquí y cómo se relaciona con cada programa."
  />
)

export const ProyeccionCuposPage = () => (
  <EnDesarrollo
    titulo="Proyección de Cupos"
    descripcion="Cuántos estudiantes se espera admitir, por programa y periodo."
    queFalta="Falta definir el horizonte de la proyección y de dónde salen las cifras base. Los cupos APROBADOS de cada programa ya se registran en Programas UDES."
  />
)
