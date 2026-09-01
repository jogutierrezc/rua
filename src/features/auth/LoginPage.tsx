import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { Button } from '@/components/ui/Button'
import { Campo, Input } from '@/components/ui/Field'
import { Marca } from '@/components/layout/Marca'

export function LoginPage() {
  const { entrar } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verContrasena, setVerContrasena] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await entrar(correo, contrasena)
      const desde = (location.state as { desde?: string } | null)?.desde
      navigate(desde ?? '/', { replace: true })
    } catch (err) {
      // Mensaje deliberadamente ambiguo: distinguir "correo inexistente" de
      // "contraseña incorrecta" permite enumerar cuentas válidas.
      const mensaje = (err as { message?: string }).message ?? ''
      setError(
        mensaje.toLowerCase().includes('invalid')
          ? 'Correo o contraseña incorrectos.'
          : 'No se pudo iniciar sesión. Inténtalo de nuevo en unos momentos.',
      )
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* ---------------------------------------------------------------
          Panel de marca. Sin fotografía de archivo: una malla de color
          construida en CSS pesa cero, no falla al cargar y no envejece.
      --------------------------------------------------------------- */}
      <aside className="relative hidden overflow-hidden bg-[#001730] lg:block">
        <div
          aria-hidden
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'radial-gradient(60rem 40rem at 15% 10%, #1b3f78 0%, transparent 60%),' +
              'radial-gradient(45rem 35rem at 85% 85%, #7a3410 0%, transparent 55%),' +
              'radial-gradient(35rem 30rem at 70% 20%, #123a6b 0%, transparent 60%)',
          }}
        />
        {/* Retícula sutil: da textura y refuerza la idea de estructura */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px),' +
              'linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Marca tono="claro" />

          <div className="max-w-lg">
            <h1 className="text-balance text-[2.5rem] font-bold leading-[1.1] tracking-[-0.025em] text-white">
              La estructura académica, bajo control.
            </h1>
            <p className="mt-4 text-pretty text-body-lg leading-relaxed text-white/70">
              Rua concentra la definición de actividades, el flujo de aprobación
              y la inteligencia de negocios de la institución en un solo lugar.
            </p>

            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-8">
              {[
                ['Trazabilidad', 'Cada cambio queda registrado'],
                ['Gobernanza', 'Permisos por rol y unidad'],
                ['Periodo', 'Cierre y apertura controlados'],
              ].map(([titulo, pie]) => (
                <div key={titulo}>
                  <dt className="text-label text-white">{titulo}</dt>
                  <dd className="mt-1 text-body-sm leading-snug text-white/55">{pie}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="text-body-sm text-white/40">
            © {new Date().getFullYear()} · Portal de Gestión Académica
          </p>
        </div>
      </aside>

      {/* --------------------------------------------------------------- */}
      <main className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-[26rem]">
          <div className="lg:hidden">
            <Marca />
          </div>

          <div className="mt-8 lg:mt-0">
            <h2 className="text-title-lg text-fg">Bienvenido de vuelta</h2>
            <p className="mt-1.5 text-body text-fg-muted">
              Inicia sesión con tu correo institucional.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-danger/25 bg-danger-soft px-3 py-2.5 text-body-sm text-danger-softFg"
              >
                <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Campo etiqueta="Correo institucional" requerido>
              {({ id, invalido }) => (
                <div className="relative">
                  <Mail
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                  />
                  <Input
                    id={id}
                    type="email"
                    name="email"
                    autoComplete="username"
                    required
                    autoFocus
                    placeholder="usuario@institucion.edu"
                    className="pl-9"
                    aria-invalid={invalido}
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                  />
                </div>
              )}
            </Campo>

            <Campo etiqueta="Contraseña" requerido>
              {({ id }) => (
                <div className="relative">
                  <Lock
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                  />
                  <Input
                    id={id}
                    type={verContrasena ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="px-9"
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setVerContrasena((v) => !v)}
                    aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-fg-subtle transition-colors duration-fast ease-out hover:text-fg"
                  >
                    {verContrasena ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              )}
            </Campo>

            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-body-sm text-fg-muted">
                <input
                  type="checkbox"
                  name="remember"
                  defaultChecked
                  className="size-4 rounded-sm border-line-strong accent-primary"
                />
                Mantener sesión iniciada
              </label>
              <a
                href="#recuperar"
                className="text-body-sm text-primary underline-offset-4 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            <Button
              type="submit"
              variante="primario"
              tamano="lg"
              cargando={enviando}
              className="mt-2 w-full"
              iconoDer={!enviando ? <ArrowRight className="size-4" /> : undefined}
            >
              {enviando ? 'Verificando…' : 'Iniciar sesión'}
            </Button>
          </form>

          <p className="mt-8 border-t border-line pt-5 text-center text-body-sm text-fg-subtle">
            ¿Problemas para entrar?{' '}
            <a href="#soporte" className="text-primary underline-offset-4 hover:underline">
              Contacta a Soporte TI
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
