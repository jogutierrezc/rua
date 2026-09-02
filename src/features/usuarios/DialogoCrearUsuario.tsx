import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { dispararEnvioCorreos } from '@/lib/correo'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Campo, Input, Select } from '@/components/ui/Field'
import { CampoContrasena } from './CampoContrasena'
import type { RolRow, VicerrectoriaRow } from '@/types/database'

const RE_CORREO = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i
const RE_DOCUMENTO = /^[A-Za-z0-9-]{5,20}$/

interface Formulario {
  nombre_completo: string
  numero_documento: string
  rol_id: string
  correo: string
  contrasena: string
  cargo: string
  vicerrectoria_id: string
}

const INICIAL: Formulario = {
  nombre_completo: '',
  numero_documento: '',
  rol_id: '',
  correo: '',
  contrasena: '',
  cargo: '',
  vicerrectoria_id: '',
}

export function DialogoCrearUsuario({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient()
  const primerCampo = useRef<HTMLInputElement>(null)

  const [f, setF] = useState<Formulario>(INICIAL)
  const [tocado, setTocado] = useState<Set<keyof Formulario>>(new Set())
  const [errorServidor, setErrorServidor] = useState<{ mensaje: string; campo?: string } | null>(
    null,
  )

  const { data: roles } = useQuery({
    queryKey: ['roles', 'lista'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('estado', 'activo')
        .order('nombre')
      if (error) throw error
      return (data ?? []) as RolRow[]
    },
    staleTime: 5 * 60_000,
  })

  const { data: vicerrectorias } = useQuery({
    queryKey: ['vicerrectorias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vicerrectorias')
        .select('*')
        .eq('estado', 'activo')
        .order('orden')
      if (error) throw error
      return (data ?? []) as VicerrectoriaRow[]
    },
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    primerCampo.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  // ---------------------------------------------------------------------------
  // Validación
  // ---------------------------------------------------------------------------
  const errores: Partial<Record<keyof Formulario, string>> = {}

  if (f.nombre_completo.trim().length < 3) {
    errores.nombre_completo = 'Escribe el nombre y los apellidos.'
  }
  if (!f.numero_documento.trim()) {
    errores.numero_documento = 'El número de documento es obligatorio.'
  } else if (!RE_DOCUMENTO.test(f.numero_documento.trim())) {
    errores.numero_documento = 'Entre 5 y 20 caracteres, sin espacios ni puntos.'
  }
  if (!f.rol_id) {
    errores.rol_id = 'Selecciona el rol con el que entrará al sistema.'
  }
  if (!RE_CORREO.test(f.correo.trim())) {
    errores.correo = 'Escribe un correo institucional válido.'
  }
  if (f.contrasena.length < 10) {
    errores.contrasena = 'Mínimo 10 caracteres.'
  }

  const valido = Object.keys(errores).length === 0

  function ver(campo: keyof Formulario) {
    if (errorServidor?.campo === campo) return errorServidor.mensaje
    return tocado.has(campo) ? (errores[campo] ?? null) : null
  }

  function set<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setF((prev) => ({ ...prev, [campo]: valor }))
    // Un error del servidor deja de ser cierto en cuanto se toca el campo.
    if (errorServidor?.campo === campo) setErrorServidor(null)
  }

  // ---------------------------------------------------------------------------
  // Alta
  //
  // Va contra una Edge Function, no contra la tabla: crear una cuenta con
  // contraseña necesita la service_role key, que no puede estar en el
  // navegador. `signUp` tampoco vale: cambiaría la sesión del administrador
  // por la del usuario recién creado.
  // ---------------------------------------------------------------------------
  const crear = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('crear-usuario', {
        body: {
          nombre_completo: f.nombre_completo.trim(),
          numero_documento: f.numero_documento.trim(),
          correo: f.correo.trim(),
          contrasena: f.contrasena,
          rol_id: f.rol_id,
          cargo: f.cargo.trim() || undefined,
          vicerrectoria_id: f.vicerrectoria_id || undefined,
        },
      })

      if (error) {
        // La función devuelve el detalle en el cuerpo aunque el estado sea 4xx;
        // sin leerlo, el usuario sólo vería "Edge Function returned a non-2xx".
        const ctx = error as { context?: { json?: () => Promise<unknown> } }
        try {
          const detalle = (await ctx.context?.json?.()) as
            | { error?: string; campo?: string }
            | undefined
          if (detalle?.error) throw { mensaje: detalle.error, campo: detalle.campo }
        } catch (e) {
          if (e && typeof e === 'object' && 'mensaje' in e) throw e
        }
        throw { mensaje: 'No se pudo crear el usuario. Inténtalo de nuevo.' }
      }

      return data as {
        id: string
        nombre_completo: string
        correo: string
        invitacion_enviada?: boolean
      }
    },
    onSuccess: (u) => {
      toast.success(`${u.nombre_completo} ya puede entrar`, {
        description: u.invitacion_enviada
          ? `Se le envió la invitación a ${u.correo} con sus datos de acceso.`
          : `Cuenta creada para ${u.correo}. Entrégale la contraseña por un canal seguro.`,
      })
      void qc.invalidateQueries({ queryKey: ['usuarios'] })
      onCerrar()
      // El trigger ya encoló la bienvenida; esto la empuja ahora en vez de
      // esperar al cron. Es la primera impresión de alguien con el sistema.
      dispararEnvioCorreos()
    },
    onError: (e) => {
      const err = e as { mensaje?: string; campo?: string }
      setErrorServidor({ mensaje: err.mensaje ?? 'Error inesperado.', campo: err.campo })
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTocado(new Set(Object.keys(f) as (keyof Formulario)[]))
    if (valido) crear.mutate()
  }

  const rolElegido = roles?.find((r) => r.id === f.rol_id)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-crear-usuario"
        className={cn(
          'relative my-auto flex w-full max-w-lg flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface-raised shadow-overlay',
          'animate-[fade-rise_200ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-softFg">
            <UserPlus className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="titulo-crear-usuario" className="text-title-sm text-fg">
              Crear usuario
            </h2>
            <p className="mt-0.5 text-body-sm text-fg-muted">
              La cuenta queda activa de inmediato, sin correo de confirmación.
            </p>
          </div>
          <Button
            variante="fantasma"
            tamano="sm"
            soloIcono
            aria-label="Cerrar"
            onClick={onCerrar}
            iconoIzq={<X className="size-4" />}
          />
        </header>

        <form onSubmit={onSubmit} noValidate className="flex flex-col">
          <div className="flex flex-col gap-4 p-4">
            {errorServidor && !errorServidor.campo && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-body-sm text-danger-softFg"
              >
                <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                {errorServidor.mensaje}
              </p>
            )}

            <Campo etiqueta="Nombre completo" requerido error={ver('nombre_completo')}>
              {({ id, describedBy, invalido }) => (
                <Input
                  ref={primerCampo}
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalido}
                  autoComplete="off"
                  placeholder="Ej. Rosalinda Reyes Gómez"
                  value={f.nombre_completo}
                  onBlur={() => setTocado((t) => new Set(t).add('nombre_completo'))}
                  onChange={(e) => set('nombre_completo', e.target.value)}
                />
              )}
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etiqueta="No. de documento"
                requerido
                error={ver('numero_documento')}
                pista="Cédula, cédula de extranjería o pasaporte."
              >
                {({ id, describedBy, invalido }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalido}
                    inputMode="text"
                    autoComplete="off"
                    placeholder="1098765432"
                    className="font-mono"
                    value={f.numero_documento}
                    onBlur={() => setTocado((t) => new Set(t).add('numero_documento'))}
                    // Los puntos y espacios con que se escribe una cédula se
                    // limpian aquí: es un formato de lectura, no de dato.
                    onChange={(e) =>
                      set('numero_documento', e.target.value.replace(/[.\s]/g, '').toUpperCase())
                    }
                  />
                )}
              </Campo>

              <Campo
                etiqueta="Rol"
                requerido
                error={ver('rol_id')}
                pista={rolElegido?.descripcion ?? 'Define qué puede hacer en el sistema.'}
              >
                {({ id, describedBy, invalido }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalido}
                    value={f.rol_id}
                    onBlur={() => setTocado((t) => new Set(t).add('rol_id'))}
                    onChange={(e) => set('rol_id', e.target.value)}
                  >
                    <option value="">Selecciona…</option>
                    {roles?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </Select>
                )}
              </Campo>
            </div>

            <Campo etiqueta="Correo institucional" requerido error={ver('correo')}>
              {({ id, describedBy, invalido }) => (
                <Input
                  id={id}
                  type="email"
                  aria-describedby={describedBy}
                  aria-invalid={invalido}
                  autoComplete="off"
                  placeholder="r.reyes@institucion.edu"
                  value={f.correo}
                  onBlur={() => setTocado((t) => new Set(t).add('correo'))}
                  onChange={(e) => set('correo', e.target.value.trim())}
                />
              )}
            </Campo>

            <CampoContrasena
              valor={f.contrasena}
              onCambio={(v) => set('contrasena', v)}
              error={ver('contrasena')}
              onTocar={() => setTocado((t) => new Set(t).add('contrasena'))}
            />

            {/* Opcionales, agrupados aparte para que los cinco campos que
                importan no compitan con ellos. */}
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer select-none px-3 py-2 text-label text-fg-muted">
                Datos opcionales
              </summary>
              <div className="grid gap-4 border-t border-line p-3 sm:grid-cols-2">
                <Campo etiqueta="Cargo">
                  {({ id }) => (
                    <Input
                      id={id}
                      placeholder="Ej. Coordinador de Currículo"
                      value={f.cargo}
                      onChange={(e) => set('cargo', e.target.value)}
                    />
                  )}
                </Campo>
                <Campo etiqueta="Vicerrectoría">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={f.vicerrectoria_id}
                      onChange={(e) => set('vicerrectoria_id', e.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {vicerrectorias?.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nombre}
                        </option>
                      ))}
                    </Select>
                  )}
                </Campo>
              </div>
            </details>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line p-4">
            <p className="mr-auto text-body-sm text-fg-subtle">
              Entrega la contraseña por un canal seguro.
            </p>
            <Button onClick={onCerrar}>Cancelar</Button>
            <Button
              type="submit"
              variante="primario"
              cargando={crear.isPending}
              iconoIzq={<UserPlus className="size-4" />}
            >
              Crear usuario
            </Button>
          </footer>
        </form>
      </div>
    </div>
  )
}
