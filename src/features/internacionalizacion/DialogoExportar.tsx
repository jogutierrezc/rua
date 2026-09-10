import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Briefcase, Download, GraduationCap, Table2, X } from 'lucide-react'
import { toast } from 'sonner'
import { mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { fmtNumero } from '@/lib/format'
import { descargarTexto, objetosACsv } from '@/lib/csv'
import { exportarContactosExcel, exportarPlantillaExcel } from '@/lib/excel'
import { filaDesdeContacto, PLANTILLAS } from '@/lib/plantillasContactos'
import type { CodigoPlantilla } from '@/lib/plantillasContactos'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Field'
import { ESTADO_VERIFICACION } from './dominio'
import type { ContactoDetalleRow } from '@/types/database'

type Formato = 'csv' | 'xlsx'
type Salida = CodigoPlantilla | 'libreta'

const OPCIONES: {
  codigo: Salida
  nombre: string
  detalle: string
  icono: typeof GraduationCap
}[] = [
  {
    codigo: 'academica',
    nombre: 'Plantilla académica',
    detalle: 'Las once columnas de la plantilla de nominación académica, en su orden original.',
    icono: GraduationCap,
  },
  {
    codigo: 'empleadores',
    nombre: 'Plantilla de empleadores',
    detalle: 'Las diez columnas de la plantilla de nominación de empleadores.',
    icono: Briefcase,
  },
  {
    codigo: 'libreta',
    nombre: 'Libreta completa',
    detalle:
      'Todo lo que guarda Rua, incluido el veredicto de cada correo. Se vuelve a poder importar.',
    icono: Table2,
  },
]

export function DialogoExportar({
  onCerrar,
  cargarContactos,
}: {
  onCerrar: () => void
  /**
   * Trae los contactos a exportar.
   *
   * Lo resuelve la pantalla y no este diálogo porque los filtros son suyos: lo
   * que se exporta es exactamente lo que se está viendo, y esa promesa se rompe
   * en cuanto el diálogo se pone a construir su propia consulta.
   */
  cargarContactos: (tipo: 'academico' | 'empleador' | null) => Promise<ContactoDetalleRow[]>
}) {
  const [salida, setSalida] = useState<Salida>('academica')
  const [formato, setFormato] = useState<Formato>('csv')
  const [soloDeLaPlantilla, setSoloDeLaPlantilla] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const esPlantilla = salida !== 'libreta'
  const plantilla = esPlantilla ? PLANTILLAS[salida] : null

  const exportar = useMutation({
    mutationFn: async () => {
      const filtroTipo =
        plantilla && soloDeLaPlantilla ? plantilla.tipoContacto : null
      const contactos = await cargarContactos(filtroTipo)

      if (contactos.length === 0) {
        throw new Error('No hay contactos que exportar con esos criterios.')
      }

      const fecha = new Date().toISOString().slice(0, 10)

      if (!plantilla) {
        await exportarContactosExcel(
          contactos.map((c) => ({
            nombre_completo: c.nombre_completo,
            cargo: c.cargo,
            pais: c.pais_nombre ?? '',
            correo: c.correo,
            rol: c.rol_etiqueta ?? '',
            sector: c.sector_etiqueta ?? '',
            organizacion: c.organizacion ?? '',
            telefono: c.telefono ?? '',
            notas: c.notas ?? '',
            verificacion: ESTADO_VERIFICACION[c.verificacion_estado].etiqueta,
            verificado_en: c.verificacion_en ? c.verificacion_en.slice(0, 10) : '',
            diagnostico: c.verificacion_mensaje ?? '',
          })),
          `contactos-internacionales-${fecha}.xlsx`,
        )
        return contactos.length
      }

      const filas = contactos.map((c) => filaDesdeContacto(c, plantilla))

      if (formato === 'xlsx') {
        await exportarPlantillaExcel(plantilla, filas, `${plantilla.archivo}-${fecha}.xlsx`)
      } else {
        descargarTexto(
          `${plantilla.archivo}-${fecha}.csv`,
          // Sin marca de orden de bytes: este archivo vuelve al sistema del que
          // salió la plantilla, y hay lectores que se comen el BOM dentro del
          // primer nombre de columna — «Source» dejaría de reconocerse.
          objetosACsv(filas, [...plantilla.columnas], ',', false),
        )
      }

      return contactos.length
    },
    onSuccess: (n) => {
      toast.success(`${fmtNumero.format(n)} contactos exportados.`)
      onCerrar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

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
        aria-label="Exportar contactos"
        className={cn(
          'relative my-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface shadow-overlay',
          'motion-safe:animate-[fade-rise_220ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-title-sm text-fg">Exportar contactos</h2>
            <p className="mt-0.5 text-body-sm text-fg-subtle">
              Se exporta lo que estás viendo: los filtros de la tabla se respetan.
            </p>
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
          <div className="flex flex-col gap-2">
            {OPCIONES.map((o) => {
              const Icono = o.icono
              const activo = o.codigo === salida
              return (
                <button
                  key={o.codigo}
                  onClick={() => setSalida(o.codigo)}
                  aria-pressed={activo}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 text-left',
                    'transition-[border-color,background-color] duration-fast ease-out',
                    activo
                      ? 'border-primary bg-primary-soft'
                      : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <Icono
                    aria-hidden
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      activo ? 'text-primary-softFg' : 'text-fg-subtle',
                    )}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn('block text-label', activo ? 'text-primary-softFg' : 'text-fg')}
                    >
                      {o.nombre}
                    </span>
                    <span className="block text-body-sm text-fg-subtle">{o.detalle}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {plantilla && (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-label text-fg">Formato</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variante={formato === 'csv' ? 'primario' : 'secundario'}
                    onClick={() => setFormato('csv')}
                  >
                    CSV, como el original
                  </Button>
                  <Button
                    variante={formato === 'xlsx' ? 'primario' : 'secundario'}
                    onClick={() => setFormato('xlsx')}
                  >
                    Excel
                  </Button>
                </div>
                <p className="text-body-sm text-fg-subtle">
                  {formato === 'csv'
                    ? 'Mismas columnas, mismo orden y misma grafía que el archivo original: es el que se devuelve a quien pidió la nominación. Ábrelo importándolo como UTF-8 si lo vas a revisar en Excel.'
                    : 'Las mismas columnas, pero en libro. Es el que se manda a alguien para que lo LEA: Excel no se pelea con las tildes.'}
                </p>
              </div>

              <Checkbox
                etiqueta={`Sólo los contactos cargados como «${plantilla.nombre.toLowerCase()}»`}
                descripcion="Si lo quitas, se exporta todo lo que coincide con los filtros, aunque viniera de otra plantilla o se diera de alta a mano."
                checked={soloDeLaPlantilla}
                onChange={(e) => setSoloDeLaPlantilla(e.target.checked)}
              />

              <p className="rounded-md bg-surface-muted px-3 py-2 text-body-sm text-fg-muted">
                Las columnas <strong>First Name</strong> y <strong>Last Name</strong> salen tal como
                entraron. Para los contactos que se dieron de alta con el nombre entero, la base los
                separó al guardarlos siguiendo la convención hispana —los dos últimos apellidos, el
                resto nombre de pila—; si alguno quedó mal partido, se corrige desde su ficha.
              </p>
            </>
          )}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-line p-4">
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button
            variante="primario"
            cargando={exportar.isPending}
            onClick={() => exportar.mutate()}
            iconoIzq={<Download className="size-4" />}
          >
            Exportar
          </Button>
        </footer>
      </div>
    </div>
  )
}
