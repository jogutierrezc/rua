import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Info, KeyRound, Save, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { fechaRelativa } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Campo, Input, Select } from '@/components/ui/Field'
import { Avatar } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/AuthProvider'
import { CampoContrasena } from './CampoContrasena'
import type { EstadoRegistro, PerfilRow, RolRow, VicerrectoriaRow } from '@/types/database'

const RE_DOCUMENTO = /^[A-Za-z0-9-]{5,20}$/

export type UsuarioEditable = PerfilRow & {
  rol?: Pick<RolRow, 'id' | 'nombre'> | null
}

export function DialogoEditarUsuario({
  usuario,
  onCerrar,
}: {
  usuario: UsuarioEditable
  onCerrar: () => void
}) {
  const { perfil, recargarPerfil } = useAuth()
  const qc = useQueryClient()
  const esYo = usuario.id === perfil?.id

  const [nombre, setNombre] = useState(usuario.nombre_completo)
  const [documento, setDocumento] = useState(usuario.numero_documento ?? '')
  const [cargo, setCargo] = useState(usuario.cargo ?? '')
  const [rolId, setRolId] = useState(usuario.rol_id ?? '')
  const [vicerrectoriaId, setVicerrectoriaId] = useState(usuario.vicerrectoria_id ?? '')
  const [estado, setEstado] = useState<EstadoRegistro>(usuario.estado)
  const [enviado, setEnviado] = useState(false)

  const [nuevaClave, setNuevaClave] = useState('')
  const [claveTocada, setClaveTocada] = useState(false)
  const [seccionClave, setSeccionClave] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

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

  // ---------------------------------------------------------------------------
  const errorNombre = nombre.trim().length < 3 ? 'Escribe el nombre y los apellidos.' : null
  const errorDocumento =
    documento.trim() && !RE_DOCUMENTO.test(documento.trim())
      ? 'Entre 5 y 20 caracteres, sin espacios ni puntos.'
      : null
  const validoPerfil = !errorNombre && !errorDocumento

  const errorClave =
    claveTocada && nuevaClave.length > 0 && nuevaClave.length < 10 ? 'Mínimo 10 caracteres.' : null

  const rolElegido = roles?.find((r) => r.id === rolId)

  // ---------------------------------------------------------------------------
  // Guardado del perfil. Va por PostgREST: las políticas RLS de
  // `usuarios.administrar` ya lo cubren, y el trigger `fn_guardia_perfiles`
  // revierte en silencio el rol y el estado si alguien se edita a sí mismo.
  // ---------------------------------------------------------------------------
  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('perfiles')
        .update({
          nombre_completo: nombre.trim(),
          numero_documento: documento.trim().toUpperCase() || null,
          cargo: cargo.trim() || null,
          rol_id: rolId || null,
          vicerrectoria_id: vicerrectoriaId || null,
          estado,
        })
        .eq('id', usuario.id)
      if (error) throw error
    },
    onSuccess: async () => {
      toast.success('Usuario actualizado')
      void qc.invalidateQueries({ queryKey: ['usuarios'] })
      // Si se editó a sí mismo, la cabecera y los permisos en memoria quedaron
      // desfasados: se refrescan antes de cerrar.
      if (esYo) await recargarPerfil()
      onCerrar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  // ---------------------------------------------------------------------------
  // Restablecimiento de contraseña. Acción aparte, y no parte de «Guardar»,
  // porque va por otro camino (Edge Function con la clave de servicio) y falla
  // de otra manera. Mezclarlas dejaría la duda de si el nombre llegó a guardarse.
  // ---------------------------------------------------------------------------
  const restablecer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('restablecer-contrasena', {
        body: { usuario_id: usuario.id, contrasena: nuevaClave },
      })

      if (error) {
        const ctx = error as { context?: { json?: () => Promise<unknown> } }
        try {
          const detalle = (await ctx.context?.json?.()) as { error?: string } | undefined
          if (detalle?.error) throw new Error(detalle.error)
        } catch (e) {
          if (e instanceof Error) throw e
        }
        throw new Error('No se pudo restablecer la contraseña.')
      }
    },
    onSuccess: () => {
      toast.success('Contraseña restablecida', {
        description: `Entrégasela a ${usuario.nombre_completo} por un canal seguro.`,
      })
      setNuevaClave('')
      setClaveTocada(false)
      setSeccionClave(false)
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setEnviado(true)
    if (validoPerfil) guardar.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-editar-usuario"
        className={cn(
          'relative my-auto flex w-full max-w-lg flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface-raised shadow-overlay',
          'animate-[fade-rise_200ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <Avatar nombre={usuario.nombre_completo} url={usuario.avatar_url} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 id="titulo-editar-usuario" className="truncate text-title-sm text-fg">
              {usuario.nombre_completo}
            </h2>
            <p className="truncate text-body-sm text-fg-muted">{usuario.correo}</p>
            <p className="text-body-sm text-fg-subtle">
              Último acceso: {fechaRelativa(usuario.ultimo_acceso_en)}
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
            {esYo && (
              <p className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-body-sm text-warning-softFg">
                <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Estás editando tu propia cuenta. El rol y el estado quedan bloqueados: nadie se
                  degrada ni se desactiva a sí mismo, ni siquiera siendo administrador. Pídeselo a
                  otro administrador.
                </span>
              </p>
            )}

            <Campo etiqueta="Nombre completo" requerido error={enviado ? errorNombre : null}>
              {({ id, describedBy, invalido }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalido}
                  autoComplete="off"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              )}
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etiqueta="No. de documento"
                error={enviado ? errorDocumento : null}
                pista="Cédula, cédula de extranjería o pasaporte."
              >
                {({ id, describedBy, invalido }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalido}
                    className="font-mono"
                    value={documento}
                    onChange={(e) =>
                      setDocumento(e.target.value.replace(/[.\s]/g, '').toUpperCase())
                    }
                  />
                )}
              </Campo>

              <Campo
                etiqueta="Rol"
                pista={
                  esYo
                    ? 'No puedes cambiar tu propio rol.'
                    : (rolElegido?.descripcion ?? 'Define qué puede hacer en el sistema.')
                }
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    disabled={esYo}
                    value={rolId}
                    onChange={(e) => setRolId(e.target.value)}
                  >
                    <option value="">Sin rol asignado</option>
                    {roles?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </Select>
                )}
              </Campo>

              <Campo etiqueta="Cargo">
                {({ id }) => (
                  <Input
                    id={id}
                    placeholder="Ej. Coordinador de Currículo"
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                  />
                )}
              </Campo>

              <Campo etiqueta="Vicerrectoría">
                {({ id }) => (
                  <Select
                    id={id}
                    value={vicerrectoriaId}
                    onChange={(e) => setVicerrectoriaId(e.target.value)}
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

              <Campo
                etiqueta="Estado de la cuenta"
                className="sm:col-span-2"
                pista={
                  esYo
                    ? 'No puedes desactivarte a ti mismo.'
                    : 'Una cuenta inactiva no puede iniciar sesión ni ver nada.'
                }
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    disabled={esYo}
                    value={estado}
                    onChange={(e) => setEstado(e.target.value as EstadoRegistro)}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </Select>
                )}
              </Campo>
            </div>

            <p className="flex items-start gap-2 text-body-sm text-fg-subtle">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              El correo institucional es la identidad de acceso y no se cambia desde aquí. Para
              modificarlo hay que crear una cuenta nueva y desactivar esta.
            </p>
          </div>

          {/* ------------------------------------------------------------
              Contraseña: sección plegada y con su propio botón. Es una
              acción destructiva —invalida la que el titular tenga— y no
              debe ejecutarse de rebote al pulsar «Guardar cambios».
          ------------------------------------------------------------ */}
          <div className="border-t border-line">
            {!seccionClave ? (
              <button
                type="button"
                onClick={() => setSeccionClave(true)}
                className={cn(
                  'flex w-full items-center gap-2 px-4 py-3 text-left text-label text-fg-muted',
                  'transition-colors duration-fast ease-out hover:bg-surface-muted hover:text-fg',
                )}
              >
                <KeyRound aria-hidden className="size-4" />
                Restablecer contraseña
              </button>
            ) : (
              <div className="flex flex-col gap-3 bg-surface-muted/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-label text-fg">
                    <KeyRound aria-hidden className="size-4" />
                    Restablecer contraseña
                  </h3>
                  <Button
                    tamano="sm"
                    variante="fantasma"
                    soloIcono
                    aria-label="Cancelar el restablecimiento"
                    onClick={() => {
                      setSeccionClave(false)
                      setNuevaClave('')
                      setClaveTocada(false)
                    }}
                    iconoIzq={<X className="size-4" />}
                  />
                </div>

                <p className="flex items-start gap-2 text-body-sm text-fg-muted">
                  <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  La contraseña actual de {usuario.nombre_completo.split(' ')[0]} dejará de
                  funcionar de inmediato.
                </p>

                <CampoContrasena
                  etiqueta="Nueva contraseña"
                  valor={nuevaClave}
                  onCambio={setNuevaClave}
                  error={errorClave}
                  onTocar={() => setClaveTocada(true)}
                />

                <div className="flex justify-end">
                  <Button
                    variante="peligro"
                    cargando={restablecer.isPending}
                    disabled={nuevaClave.length < 10}
                    onClick={() => restablecer.mutate()}
                    iconoIzq={<KeyRound className="size-4" />}
                  >
                    Restablecer
                  </Button>
                </div>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 justify-end gap-2 border-t border-line p-4">
            <Button onClick={onCerrar}>Cancelar</Button>
            <Button
              type="submit"
              variante="primario"
              cargando={guardar.isPending}
              iconoIzq={<Save className="size-4" />}
            >
              Guardar cambios
            </Button>
          </footer>
        </form>
      </div>
    </div>
  )
}
