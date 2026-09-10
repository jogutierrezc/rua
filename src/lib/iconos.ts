import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarCog,
  ChartNoAxesCombined,
  CircleDot,
  ClipboardList,
  Contact,
  Database,
  FileClock,
  FileText,
  Folder,
  GitBranch,
  Globe,
  Inbox,
  LayoutDashboard,
  Mail,
  MailCheck,
  Network,
  PanelLeft,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Target,
  Users,
  Wrench,
} from 'lucide-react'

/**
 * Iconos que el menú puede usar.
 *
 * Es una lista cerrada y no un nombre libre. El menú se configura desde la
 * base, y un nombre de icono guardado ahí que el paquete no conozca sería un
 * fallo en tiempo de render: la barra lateral entera dejaría de pintarse por
 * una errata. Con un catálogo, lo peor que puede pasar es un icono genérico.
 *
 * Añadir uno nuevo es importarlo aquí. Es a propósito: así la pantalla de
 * configuración puede ofrecerlos todos sin adivinar.
 */
export const ICONOS = {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarCog,
  ChartNoAxesCombined,
  CircleDot,
  ClipboardList,
  Contact,
  Database,
  FileClock,
  FileText,
  Folder,
  GitBranch,
  Globe,
  Inbox,
  LayoutDashboard,
  Mail,
  MailCheck,
  Network,
  PanelLeft,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Target,
  Users,
  Wrench,
} as const

export type NombreIcono = keyof typeof ICONOS

export const NOMBRES_ICONO = Object.keys(ICONOS) as NombreIcono[]

/** El icono guardado, o uno neutro si el nombre no existe. Nunca revienta. */
export function iconoDe(nombre: string | null | undefined) {
  return ICONOS[nombre as NombreIcono] ?? CircleDot
}
