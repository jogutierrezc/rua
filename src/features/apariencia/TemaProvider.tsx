import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import {
  PALETA_POR_DEFECTO,
  buscarPaleta,
  derivarTokens,
  type ModoTema,
  type Paleta,
  type Tokens,
} from '@/styles/paletas'

export type PreferenciaModo = 'claro' | 'oscuro' | 'sistema'

const CLAVE_PALETA = 'rua.tema.paleta'
const CLAVE_MODO = 'rua.tema.modo'
/** CSS ya derivado, para que el script de index.html lo aplique antes del pintado. */
const CLAVE_CACHE = 'rua.tema.css'

interface TemaContextValue {
  paleta: Paleta
  modo: PreferenciaModo
  /** El modo realmente aplicado: 'sistema' ya resuelto a claro u oscuro. */
  modoEfectivo: ModoTema
  setPaleta: (id: string) => void
  setModo: (modo: PreferenciaModo) => void
}

const TemaContext = createContext<TemaContextValue | null>(null)

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    // Ventana privada o almacenamiento bloqueado: se sigue con los valores
    // por defecto en lugar de tumbar la aplicación.
    return null
  }
}

function escribir(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    /* sin persistencia, pero la sesión funciona */
  }
}

function tokensACss(tokens: Tokens): string {
  return Object.entries(tokens)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}

/**
 * Aplica los tokens como custom properties en el elemento raíz.
 *
 * Se escriben en línea y no en una hoja de estilo porque así ganan a cualquier
 * regla de tokens.css sin depender del orden de la cascada, y porque cambiar
 * una propiedad personalizada sólo dispara recálculo de estilo: no hay layout
 * ni repintado de la estructura, así que cambiar de paleta es instantáneo.
 */
function aplicar(tokens: Tokens, modoEfectivo: ModoTema) {
  const raiz = document.documentElement
  Object.entries(tokens).forEach(([k, v]) => raiz.style.setProperty(k, v))
  raiz.dataset.theme = modoEfectivo === 'oscuro' ? 'dark' : 'light'
  raiz.style.colorScheme = modoEfectivo === 'oscuro' ? 'dark' : 'light'
  escribir(CLAVE_CACHE, `${modoEfectivo}|${tokensACss(tokens)}`)
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [paletaId, setPaletaId] = useState(() => leer(CLAVE_PALETA) ?? PALETA_POR_DEFECTO)
  const [modo, setModoEstado] = useState<PreferenciaModo>(() => {
    const v = leer(CLAVE_MODO)
    return v === 'claro' || v === 'oscuro' || v === 'sistema' ? v : 'sistema'
  })

  // Preferencia del sistema, en vivo: si el usuario elige "sistema" y su
  // portátil cambia a oscuro al anochecer, la aplicación le sigue.
  const [prefiereOscuro, setPrefiereOscuro] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onCambio = (e: MediaQueryListEvent) => setPrefiereOscuro(e.matches)
    mq.addEventListener('change', onCambio)
    return () => mq.removeEventListener('change', onCambio)
  }, [])

  const paleta = useMemo(() => buscarPaleta(paletaId), [paletaId])
  const modoEfectivo: ModoTema = modo === 'sistema' ? (prefiereOscuro ? 'oscuro' : 'claro') : modo

  useEffect(() => {
    aplicar(derivarTokens(paleta, modoEfectivo), modoEfectivo)
  }, [paleta, modoEfectivo])

  // -------------------------------------------------------------------------
  // Sincronización con el perfil.
  //
  // La preferencia viaja con la persona, no con el navegador: quien entra desde
  // otro equipo encuentra su paleta. localStorage sigue siendo la fuente para
  // el primer pintado, porque llega antes que cualquier consulta.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let vivo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('preferencias')
        .eq('id', data.session.user.id)
        .maybeSingle()

      if (!vivo || !perfil?.preferencias) return
      const p = perfil.preferencias as { paleta?: string; modo?: PreferenciaModo }

      if (p.paleta && p.paleta !== leer(CLAVE_PALETA)) {
        setPaletaId(p.paleta)
        escribir(CLAVE_PALETA, p.paleta)
      }
      if (p.modo && p.modo !== leer(CLAVE_MODO)) {
        setModoEstado(p.modo)
        escribir(CLAVE_MODO, p.modo)
      }
    })

    return () => {
      vivo = false
    }
  }, [])

  const persistir = useCallback(async (cambios: { paleta?: string; modo?: PreferenciaModo }) => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return

    const { data: actual } = await supabase
      .from('perfiles')
      .select('preferencias')
      .eq('id', data.session.user.id)
      .maybeSingle()

    await supabase
      .from('perfiles')
      .update({
        preferencias: { ...((actual?.preferencias as object) ?? {}), ...cambios },
      })
      .eq('id', data.session.user.id)
  }, [])

  const setPaleta = useCallback(
    (id: string) => {
      setPaletaId(id)
      escribir(CLAVE_PALETA, id)
      void persistir({ paleta: id })
    },
    [persistir],
  )

  const setModo = useCallback(
    (m: PreferenciaModo) => {
      setModoEstado(m)
      escribir(CLAVE_MODO, m)
      void persistir({ modo: m })
    },
    [persistir],
  )

  const valor = useMemo<TemaContextValue>(
    () => ({ paleta, modo, modoEfectivo, setPaleta, setModo }),
    [paleta, modo, modoEfectivo, setPaleta, setModo],
  )

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTema() {
  const ctx = useContext(TemaContext)
  if (!ctx) throw new Error('useTema debe usarse dentro de <TemaProvider>')
  return ctx
}
