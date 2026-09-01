import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { EmptyState } from '@/components/ui/primitives'
import type { CodigoPermiso } from '@/types/database'

/** Pantalla de espera mientras se resuelve la sesión. Sin spinner: un flash de
 *  medio segundo molesta más que un lienzo tranquilo. */
function Resolviendo() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <p className="sr-only">Cargando sesión…</p>
    </div>
  )
}

export function RutaProtegida() {
  const { session, cargando } = useAuth()
  const location = useLocation()

  if (cargando) return <Resolviendo />

  // Guardamos de dónde venía para devolverlo ahí tras iniciar sesión,
  // en vez de dejarlo siempre en el panel.
  if (!session) return <Navigate to="/entrar" replace state={{ desde: location.pathname }} />

  return <Outlet />
}

export function RutaPublica() {
  const { session, cargando } = useAuth()
  if (cargando) return <Resolviendo />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}

/**
 * Oculta contenido para el que falta permiso. No es seguridad — RLS lo es —
 * sino honestidad: no mostrar un botón que va a fallar.
 */
export function Si({ puede: permiso, children }: { puede: CodigoPermiso; children: ReactNode }) {
  const { puede } = useAuth()
  return puede(permiso) ? <>{children}</> : null
}

export function RequierePermiso({
  permiso,
  children,
}: {
  permiso: CodigoPermiso
  children: ReactNode
}) {
  const { puede, cargando } = useAuth()

  if (cargando) return <Resolviendo />

  if (!puede(permiso)) {
    return (
      <EmptyState
        icono={<ShieldOff className="size-5" />}
        titulo="No tienes acceso a esta sección"
        descripcion="Tu rol actual no incluye este permiso. Si crees que es un error, contacta al administrador del sistema."
      />
    )
  }

  return <>{children}</>
}
