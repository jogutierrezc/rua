import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { CodigoPermiso, PerfilRow, RolRow } from '@/types/database'

export interface Sesion {
  session: Session | null
  perfil: PerfilRow | null
  rol: RolRow | null
  permisos: Set<CodigoPermiso>
  vicerrectoria: string | null
}

interface AuthContextValue extends Sesion {
  cargando: boolean
  /** ¿El usuario tiene esta capacidad? Es sólo cortesía visual: quien manda es RLS. */
  puede: (permiso: CodigoPermiso) => boolean
  entrar: (correo: string, contrasena: string) => Promise<void>
  salir: () => Promise<void>
  recargarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESION_VACIA: Sesion = {
  session: null,
  perfil: null,
  rol: null,
  permisos: new Set(),
  vicerrectoria: null,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Sesion>(SESION_VACIA)
  const [cargando, setCargando] = useState(true)

  /**
   * Trae perfil, rol y permisos en UNA consulta anidada. Tres viajes separados
   * harían parpadear la interfaz mientras llegan por orden.
   */
  const cargarPerfil = useCallback(async (session: Session | null): Promise<Sesion> => {
    if (!session) return SESION_VACIA

    const { data, error } = await supabase
      .from('perfiles')
      .select(
        `*,
         rol:roles ( *, rol_permisos ( permiso_codigo ) ),
         vicerrectoria:vicerrectorias ( nombre )`,
      )
      .eq('id', session.user.id)
      .single()

    if (error || !data) {
      // Sesión válida pero sin perfil: el trigger de alta aún no corrió, o el
      // usuario fue eliminado. Mejor sesión anónima que una app a medio cargar.
      console.error('No se pudo cargar el perfil:', error)
      return { ...SESION_VACIA, session }
    }

    const fila = data as unknown as PerfilRow & {
      rol: (RolRow & { rol_permisos: { permiso_codigo: CodigoPermiso }[] }) | null
      vicerrectoria: { nombre: string } | null
    }

    const { rol, vicerrectoria, ...perfil } = fila

    return {
      session,
      perfil: perfil as PerfilRow,
      rol: rol ? ({ ...rol, rol_permisos: undefined } as unknown as RolRow) : null,
      permisos: new Set(rol?.rol_permisos?.map((p) => p.permiso_codigo) ?? []),
      vicerrectoria: vicerrectoria?.nombre ?? null,
    }
  }, [])

  useEffect(() => {
    let vivo = true

    supabase.auth.getSession().then(async ({ data }) => {
      const s = await cargarPerfil(data.session)
      if (!vivo) return
      setEstado(s)
      setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((evento, session) => {
      // onAuthStateChange no admite un callback async: hacerlo bloquea el
      // cliente de Supabase. Se dispara la carga y se resuelve aparte.
      if (evento === 'SIGNED_OUT') {
        setEstado(SESION_VACIA)
        return
      }
      void cargarPerfil(session).then((s) => {
        if (vivo) setEstado(s)
      })
    })

    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [cargarPerfil])

  const entrar = useCallback(async (correo: string, contrasena: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: contrasena,
    })
    if (error) throw error

    // Sello de último acceso. Si falla no bloquea la entrada: es telemetría.
    if (data.user) {
      void supabase
        .from('perfiles')
        .update({ ultimo_acceso_en: new Date().toISOString() })
        .eq('id', data.user.id)
    }
  }, [])

  const salir = useCallback(async () => {
    await supabase.auth.signOut()
    setEstado(SESION_VACIA)
  }, [])

  const recargarPerfil = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setEstado(await cargarPerfil(data.session))
  }, [cargarPerfil])

  const valor = useMemo<AuthContextValue>(
    () => ({
      ...estado,
      cargando,
      puede: (permiso) => estado.permisos.has(permiso),
      entrar,
      salir,
      recargarPerfil,
    }),
    [estado, cargando, entrar, salir, recargarPerfil],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
