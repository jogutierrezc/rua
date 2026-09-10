import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Download, GraduationCap, Send, X } from 'lucide-react'
import { descargarPlantillaNominacion } from '@/lib/excel'
import { LISTA_PLANTILLAS } from '@/lib/plantillasContactos'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/AuthProvider'
import type { CodigoPlantilla } from '@/lib/plantillasContactos'

const ICONO: Record<CodigoPlantilla, typeof GraduationCap> = {
  academica: GraduationCap,
  empleadores: Briefcase,
}

/**
 * Las plantillas en blanco, al alcance de cualquiera que vea la libreta.
 *
 * Existe por una razón concreta: quien aporta contactos casi nunca es quien los
 * carga. Un decano que vuelve de un congreso trae veinte nombres, pero no tiene
 * —ni debe tener— permiso para escribir en la libreta. Si la plantilla sólo
 * estuviera detrás de la pantalla de importación, tendría que pedirla por
 * correo y esperar, que es justo la fricción que hace que esos veinte nombres
 * se queden en una libreta de papel.
 *
 * Descargar un archivo en blanco no es escribir en la libreta, así que basta con
 * poder verla.
 */
export function DialogoPlantillas({ onCerrar }: { onCerrar: () => void }) {
  const { puede } = useAuth()
  const puedeCargar = puede('internacionalizacion.administrar')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

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
        aria-label="Plantillas para reportar contactos"
        className={cn(
          'relative my-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface shadow-overlay',
          'motion-safe:animate-[fade-rise_220ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-title-sm text-fg">Plantillas para reportar contactos</h2>
            <p className="mt-0.5 text-body-sm text-fg-subtle">
              Descarga la que corresponda, rellénala y entrégala. No hace falta ser de
              Internacionalización para aportar contactos.
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

        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          {LISTA_PLANTILLAS.map((p) => {
            const Icono = ICONO[p.codigo]
            return (
              <div
                key={p.codigo}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <Icono aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                    <span className="text-label text-fg">{p.nombre}</span>
                  </p>
                  <p className="mt-1 text-body-sm text-fg-muted">{p.descripcion}</p>
                  <p className="mt-1.5 font-mono text-[11px] text-fg-subtle">
                    {p.columnas.length} columnas · {p.archivo}.xlsx
                  </p>
                </div>
                <Button
                  onClick={() => void descargarPlantillaNominacion(p)}
                  iconoIzq={<Download className="size-4" />}
                >
                  Descargar
                </Button>
              </div>
            )
          })}

          <div className="rounded-md bg-surface-muted px-3 py-2.5 text-body-sm text-fg-muted">
            <p>
              La <strong>primera hoja</strong> es la plantilla tal cual: rellénala debajo de la
              fila de cabecera, sin cambiar los nombres de las columnas ni su orden. La{' '}
              <strong>segunda</strong> son las instrucciones, con un ejemplo por columna.
            </p>
            <p className="mt-2 flex items-start gap-2">
              <Send aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {puedeCargar ? (
                <span>
                  Cuando la tengas lista, súbela desde{' '}
                  <Link
                    to="/internacionalizacion/importar"
                    className="text-primary underline underline-offset-2 hover:text-primary-hover"
                  >
                    Importar Contactos
                  </Link>
                  . Verás una previsualización antes de que se escriba nada.
                </span>
              ) : (
                <span>
                  Cuando la tengas lista, envíasela a la oficina de Internacionalización: son
                  quienes la cargan. Puedes mandar tantas como quieras, y una lista corta también
                  sirve.
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
