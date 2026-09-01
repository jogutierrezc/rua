import { useMemo, useState } from 'react'
import { Check, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { generarContrasena, medirFuerza } from '@/lib/contrasena'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Campo, Input } from '@/components/ui/Field'

/**
 * Campo de contraseña con generador, medidor y copia al portapapeles.
 *
 * Vive aparte porque lo usan el alta y el restablecimiento. Duplicarlo
 * garantizaría que uno de los dos se quedara sin la corrección siguiente.
 */
export function CampoContrasena({
  valor,
  onCambio,
  etiqueta = 'Contraseña',
  error,
  onTocar,
}: {
  valor: string
  onCambio: (v: string) => void
  etiqueta?: string
  error?: string | null
  onTocar?: () => void
}) {
  const [visible, setVisible] = useState(false)
  const [copiada, setCopiada] = useState(false)
  const fuerza = useMemo(() => medirFuerza(valor), [valor])

  function generar() {
    onCambio(generarContrasena(16))
    // Generar algo que no se puede leer no sirve de nada: hay que dictarlo.
    setVisible(true)
    onTocar?.()
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiada(true)
      setTimeout(() => setCopiada(false), 2000)
    } catch {
      toast.error('El navegador no permitió copiar. Selecciónala y cópiala a mano.')
    }
  }

  return (
    <Campo etiqueta={etiqueta} requerido error={error}>
      {({ id, describedBy, invalido }) => (
        <>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                id={id}
                type={visible ? 'text' : 'password'}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                autoComplete="new-password"
                placeholder="Mínimo 10 caracteres"
                className={cn('pr-16', visible && 'font-mono')}
                value={valor}
                onBlur={onTocar}
                onChange={(e) => onCambio(e.target.value)}
              />
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5">
                {valor && (
                  <button
                    type="button"
                    onClick={copiar}
                    aria-label="Copiar contraseña"
                    title={copiada ? 'Copiada' : 'Copiar'}
                    className="grid size-7 place-items-center rounded text-fg-subtle transition-colors duration-fast ease-out hover:text-fg"
                  >
                    {copiada ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="grid size-7 place-items-center rounded text-fg-subtle transition-colors duration-fast ease-out hover:text-fg"
                >
                  {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button
              onClick={generar}
              iconoIzq={<RefreshCw className="size-4" />}
              title="Generar una contraseña segura"
            >
              Generar
            </Button>
          </div>

          {/* Cuatro segmentos en vez de una barra continua: se lee de un
              vistazo en qué nivel está. */}
          {valor && (
            <div className="mt-2">
              <div className="flex gap-1" role="img" aria-label={`Fuerza: ${fuerza.etiqueta}`}>
                {[1, 2, 3, 4].map((n) => (
                  <span
                    key={n}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors duration-fast ease-out',
                      n > fuerza.puntos
                        ? 'bg-surface-muted'
                        : fuerza.puntos <= 1
                          ? 'bg-danger'
                          : fuerza.puntos === 2
                            ? 'bg-warning'
                            : 'bg-success',
                    )}
                  />
                ))}
              </div>
              <p className="mt-1 text-body-sm text-fg-subtle">
                {fuerza.etiqueta}
                {fuerza.sugerencia && ` · ${fuerza.sugerencia}`}
              </p>
            </div>
          )}
        </>
      )}
    </Campo>
  )
}
