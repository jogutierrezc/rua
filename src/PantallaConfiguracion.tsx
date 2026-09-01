import { AlertTriangle } from 'lucide-react'
import { configuracionIncompleta } from '@/lib/entorno'

/**
 * Lo que se ve cuando el despliegue no tiene las variables de entorno.
 *
 * Existe para que ese fallo sea LEGIBLE. Una página en blanco con un error en
 * la consola obliga a abrir las herramientas de desarrollo para descubrir algo
 * que se arregla en dos minutos; esta pantalla dice qué falta y dónde ponerlo.
 *
 * No importa nada de la aplicación —ni Supabase, ni el enrutador— porque el
 * motivo de que estemos aquí es justamente que esos módulos no pueden
 * inicializarse.
 */
export function PantallaConfiguracion() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-md">
        <span className="grid size-10 place-items-center rounded-full bg-warning-soft text-warning-softFg">
          <AlertTriangle aria-hidden className="size-5" />
        </span>

        <h1 className="mt-4 text-title text-fg">Falta configurar el entorno</h1>
        <p className="mt-2 text-body text-fg-muted">
          Rua no puede conectarse a Supabase porque{' '}
          {configuracionIncompleta.length === 1
            ? 'una variable no está definida'
            : `${configuracionIncompleta.length} variables no están definidas`}{' '}
          en la compilación.
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {configuracionIncompleta.map((v) => (
            <li key={v.clave} className="rounded-md border border-line bg-surface-muted px-3 py-2">
              <code className="text-body-sm font-semibold text-fg">{v.clave}</code>
              <p className="mt-0.5 text-body-sm text-fg-subtle">{v.descripcion}</p>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-line pt-4 text-body-sm text-fg-muted">
          <p className="font-medium text-fg">En local</p>
          <p className="mt-1">
            Copia <code className="text-fg">.env.example</code> a{' '}
            <code className="text-fg">.env.local</code>, rellena los valores y reinicia el servidor.
          </p>

          <p className="mt-3 font-medium text-fg">En Vercel</p>
          <p className="mt-1">
            Settings → Environment Variables, y después{' '}
            <strong className="text-fg">vuelve a desplegar</strong>. Vite incrusta estos valores al
            compilar: añadirlos sin recompilar no cambia nada.
          </p>
        </div>
      </div>
    </main>
  )
}
