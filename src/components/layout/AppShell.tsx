import { useEffect, useState } from 'react'

import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell,
  CalendarClock,
  CalendarCog,
  ChartNoAxesCombined,
  ChevronDown,
  FileClock,
  GitBranch,
  Mail,
  Inbox,
  LogOut,
  Menu,
  Palette,
  Monitor,
  Moon,
  Network,
  Search,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/features/auth/AuthProvider'
import { Marca } from './Marca'
import { useTema } from '@/features/apariencia/TemaProvider'
import type { PreferenciaModo } from '@/features/apariencia/TemaProvider'
import { Avatar, Badge } from '@/components/ui/primitives'
import { Button } from '@/components/ui/Button'
import type { CodigoPermiso } from '@/types/database'

// -----------------------------------------------------------------------------
// Navegación
//
// Los nombres describen su CONTENIDO, no una categoría vaga. "Solicitudes"
// dice qué hay dentro; "Gestión" no diría nada.
// -----------------------------------------------------------------------------
interface Entrada {
  a: string
  etiqueta: string
  icono: typeof Inbox
  permiso?: CodigoPermiso
  /** `end` evita que la ruta raíz quede activa en todas las demás */
  end?: boolean
}

interface Grupo {
  titulo: string
  entradas: Entrada[]
}

const NAVEGACION: Grupo[] = [
  {
    titulo: 'Análisis',
    entradas: [
      { a: '/', etiqueta: 'Inteligencia de Negocios', icono: ChartNoAxesCombined, end: true, permiso: 'bi.consultar' },
    ],
  },
  {
    titulo: 'Operación',
    entradas: [
      { a: '/solicitudes', etiqueta: 'Solicitudes', icono: Inbox, permiso: 'solicitudes.crear' },
      { a: '/actividades', etiqueta: 'Estructura de Actividades', icono: Network, permiso: 'actividades.ver' },
      { a: '/periodo', etiqueta: 'Actividades del Periodo', icono: CalendarClock, permiso: 'actividades.ver' },
    ],
  },
  {
    titulo: 'Administración',
    entradas: [
      { a: '/usuarios', etiqueta: 'Usuarios', icono: Users, permiso: 'usuarios.ver' },
      { a: '/roles', etiqueta: 'Roles y Permisos', icono: ShieldCheck, permiso: 'roles.administrar' },
      { a: '/periodos', etiqueta: 'Periodos Académicos', icono: CalendarCog, permiso: 'periodos.administrar' },
      { a: '/flujo', etiqueta: 'Flujo de Validación', icono: GitBranch, permiso: 'roles.administrar' },
      { a: '/correo', etiqueta: 'Notificaciones', icono: Mail, permiso: 'roles.administrar' },
      { a: '/auditoria', etiqueta: 'Bitácora', icono: FileClock, permiso: 'auditoria.consultar' },
    ],
  },
]

// -----------------------------------------------------------------------------
// Alternador rápido de modo
//
// Vive en la barra superior porque cambiar de claro a oscuro es algo que se
// hace a diario —al caer la tarde, al proyectar— y no merece un viaje a la
// pantalla de ajustes. La elección de paleta sí vive allí: se hace una vez.
// -----------------------------------------------------------------------------
function AlternadorModo() {
  const { modo, modoEfectivo, setModo } = useTema()

  // Ciclo de tres estados: claro → oscuro → sistema. El icono muestra lo que
  // está activo ahora, y el título anuncia adónde lleva el siguiente clic.
  const siguiente: PreferenciaModo =
    modo === 'sistema' ? 'claro' : modo === 'claro' ? 'oscuro' : 'sistema'

  const Icono = modo === 'sistema' ? Monitor : modoEfectivo === 'oscuro' ? Moon : Sun
  const nombre = { claro: 'claro', oscuro: 'oscuro', sistema: 'automático' } as const

  return (
    <Button
      variante="fantasma"
      tamano="sm"
      soloIcono
      aria-label={`Tema ${nombre[modo]}. Cambiar a ${nombre[siguiente]}`}
      title={`Tema ${nombre[modo]} — cambiar a ${nombre[siguiente]}`}
      onClick={() => setModo(siguiente)}
      iconoIzq={<Icono className="size-4" />}
    />
  )
}

// -----------------------------------------------------------------------------
// Barra lateral
// -----------------------------------------------------------------------------
function Lateral({ onNavegar }: { onNavegar?: () => void }) {
  const { puede, perfil, rol, vicerrectoria, salir } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-topbar shrink-0 items-center border-b border-line px-4">
        <Marca />
      </div>

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-2.5 py-4">
        {NAVEGACION.map((grupo) => {
          const visibles = grupo.entradas.filter((e) => !e.permiso || puede(e.permiso))
          if (visibles.length === 0) return null

          return (
            <div key={grupo.titulo} className="mb-5 last:mb-0">
              <h2 className="px-2.5 pb-1.5 text-overline uppercase text-fg-subtle">
                {grupo.titulo}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {visibles.map(({ a, etiqueta, icono: Icono, end }) => (
                  <li key={a}>
                    <NavLink
                      to={a}
                      end={end}
                      onClick={onNavegar}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body',
                          // La navegación se usa decenas de veces al día:
                          // sólo el color transiciona, nada se mueve.
                          'transition-colors duration-fast ease-out',
                          isActive
                            ? 'bg-primary-soft font-medium text-primary-softFg'
                            : 'text-fg-muted [@media(hover:hover)]:hover:bg-surface-muted [@media(hover:hover)]:hover:text-fg',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icono
                            aria-hidden
                            className={cn('size-[1.05rem] shrink-0', !isActive && 'text-fg-subtle')}
                          />
                          <span className="truncate">{etiqueta}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* Identidad del usuario, anclada abajo: siempre visible sin ocupar
          espacio del contenido. */}
      <div className="shrink-0 border-t border-line p-2.5">
        <button
          onClick={() => setMenuAbierto((v) => !v)}
          aria-expanded={menuAbierto}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md p-1.5 text-left',
            'transition-colors duration-fast ease-out hover:bg-surface-muted',
          )}
        >
          <Avatar nombre={perfil?.nombre_completo ?? '?'} url={perfil?.avatar_url} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium text-fg">
              {perfil?.nombre_completo ?? 'Sesión'}
            </span>
            <span className="block truncate text-body-sm text-fg-subtle">
              {rol?.nombre ?? 'Sin rol asignado'}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            data-motion="transform"
            className={cn(
              'size-4 shrink-0 text-fg-subtle transition-transform duration-fast ease-out',
              menuAbierto && 'rotate-180',
            )}
          />
        </button>

        {menuAbierto && (
          <div className="mt-1.5 animate-fade-rise rounded-md border border-line bg-surface-raised p-2 shadow-md">
            {vicerrectoria && (
              <p className="px-1.5 pb-2 text-body-sm text-fg-subtle">{vicerrectoria}</p>
            )}
            <Link
              to="/apariencia"
              onClick={() => setMenuAbierto(false)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-body-sm text-fg-muted',
                'transition-colors duration-fast ease-out hover:bg-surface-muted hover:text-fg',
              )}
            >
              <Palette aria-hidden className="size-4" />
              Apariencia
            </Link>
            <Button
              variante="fantasma"
              tamano="sm"
              onClick={salir}
              iconoIzq={<LogOut className="size-4" />}
              className="w-full justify-start"
            >
              Cerrar sesión
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Armazón
// -----------------------------------------------------------------------------
export function AppShell() {
  const [cajonAbierto, setCajonAbierto] = useState(false)
  const location = useLocation()

  // Al navegar en móvil, el cajón se cierra solo. Dejarlo abierto sobre la
  // pantalla nueva obliga a un gesto extra que nadie quiere hacer.
  useEffect(() => setCajonAbierto(false), [location.pathname])

  // Escape cierra el cajón: nunca atrapamos al usuario dentro de una capa.
  useEffect(() => {
    if (!cajonAbierto) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCajonAbierto(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cajonAbierto])

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Salto de navegación para teclado y lectores de pantalla */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
      >
        Saltar al contenido
      </a>

      {/* Lateral fija en escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar border-r border-line lg:block">
        <Lateral />
      </aside>

      {/* Cajón en móvil. Entra y sale por el MISMO lado: si algo desaparece
          hacia la izquierda, se espera que vuelva desde la izquierda. */}
      {cajonAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setCajonAbierto(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navegación"
            data-motion="transform"
            className="absolute inset-y-0 left-0 w-sidebar animate-[fade-rise_260ms_cubic-bezier(0.32,0.72,0,1)_both] border-r border-line shadow-overlay"
          >
            <Lateral onNavegar={() => setCajonAbierto(false)} />
            <button
              onClick={() => setCajonAbierto(false)}
              aria-label="Cerrar navegación"
              className="absolute right-2 top-3 grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <div className="lg:pl-sidebar">
        <TopBar onAbrirCajon={() => setCajonAbierto(true)} />

        <main id="contenido" className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Barra superior
//
// Capa translúcida: el contenido pasa POR DEBAJO en vez de que la barra se
// coma una franja opaca. La separación aparece sólo cuando hay algo que separar.
// -----------------------------------------------------------------------------
function TopBar({ onAbrirCajon }: { onAbrirCajon: () => void }) {
  const { vicerrectoria } = useAuth()
  const [desplazado, setDesplazado] = useState(false)

  useEffect(() => {
    const onScroll = () => setDesplazado(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'material-chrome sticky top-0 z-20 flex h-topbar items-center gap-3 px-4 sm:px-6 lg:px-8',
        'transition-[border-color] duration-200 ease-out',
        desplazado ? 'border-b border-line' : 'border-b border-transparent',
      )}
    >
      <Button
        variante="fantasma"
        tamano="sm"
        soloIcono
        aria-label="Abrir navegación"
        onClick={onAbrirCajon}
        className="lg:hidden"
        iconoIzq={<Menu className="size-4" />}
      />

      {/* Búsqueda global */}
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          type="search"
          placeholder="Buscar actividades, solicitudes o personas…"
          aria-label="Búsqueda global"
          className={cn(
            'h-8 w-full rounded-md border border-line bg-surface/70 pl-9 pr-3 text-body text-fg',
            'placeholder:text-fg-subtle',
            'transition-[border-color,background-color] duration-fast ease-out',
            'hover:border-line-strong focus:border-primary focus:bg-surface focus:outline-none',
          )}
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {vicerrectoria && (
          <Badge tono="neutro" className="hidden md:inline-flex">
            {vicerrectoria}
          </Badge>
        )}
        <AlternadorModo />
        <Button
          variante="fantasma"
          tamano="sm"
          soloIcono
          aria-label="Notificaciones"
          iconoIzq={<Bell className="size-4" />}
        />
      </div>
    </header>
  )
}
