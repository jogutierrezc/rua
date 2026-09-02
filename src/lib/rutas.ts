import type { NombreIcono } from './iconos'
import type { CodigoPermiso } from '@/types/database'

/**
 * Catálogo de destinos que el menú puede ofrecer.
 *
 * Ésta es la frontera del diseño: la BASE manda cómo se presenta el menú
 * —título, grupo, orden, icono, visibilidad—, pero qué rutas EXISTEN y qué
 * permiso protege cada una lo sabe únicamente el código, porque son el
 * enrutador y sus guardas quienes lo imponen.
 *
 * De aquí salen dos cosas:
 *
 *   · Lo que la pantalla de configuración deja añadir. Escribir la ruta a mano
 *     permitiría guardar un enlace a ninguna parte, y el fallo aparecería en
 *     el menú de todos, no en el de quien se equivocó.
 *
 *   · El menú de emergencia. Si la consulta a la base falla o las tablas aún
 *     no existen, la barra lateral se pinta desde aquí. Un portal sin menú es
 *     un portal inutilizable, y eso no puede depender de una consulta.
 */
export interface RutaMenu {
  ruta: string
  etiqueta: string
  /** El mismo que exige la guarda de la ruta. Nulo: la ve cualquier sesión. */
  permiso: CodigoPermiso | null
  icono: NombreIcono
  grupo: string
  /** `end` del NavLink: sólo lo necesita la raíz. */
  exacta?: boolean
  /**
   * Forma parte del menú de fábrica.
   *
   * Distingue lo que la migración sembró de lo que sólo se OFRECE para añadir.
   * El menú de emergencia usa esta marca para reproducir exactamente lo que
   * hay en la base: si al caerse la consulta apareciera un menú distinto del
   * habitual, el fallo se leería como un rediseño.
   */
  inicial?: boolean
}

export const GRUPOS_POR_DEFECTO: { codigo: string; titulo: string }[] = [
  { codigo: 'analisis', titulo: 'Análisis' },
  { codigo: 'planeacion', titulo: 'Planeación Estratégica' },
  { codigo: 'operacion', titulo: 'Operación' },
  { codigo: 'administracion', titulo: 'Administración' },
]

export const RUTAS_MENU: RutaMenu[] = [
  {
    ruta: '/',
    inicial: true,
    etiqueta: 'Inteligencia de Negocios',
    permiso: 'bi.consultar',
    icono: 'ChartNoAxesCombined',
    grupo: 'analisis',
    exacta: true,
  },
  {
    ruta: '/solicitudes',
    inicial: true,
    etiqueta: 'Solicitudes',
    permiso: 'solicitudes.crear',
    icono: 'Inbox',
    grupo: 'operacion',
  },
  {
    ruta: '/solicitudes/nueva',
    etiqueta: 'Nueva solicitud',
    permiso: 'solicitudes.crear',
    icono: 'FileText',
    grupo: 'operacion',
  },
  {
    ruta: '/actividades',
    inicial: true,
    etiqueta: 'Estructura de Actividades',
    permiso: 'actividades.ver',
    icono: 'Network',
    grupo: 'operacion',
  },
  {
    ruta: '/actividades/importar',
    etiqueta: 'Importación masiva',
    permiso: 'actividades.crear',
    icono: 'Database',
    grupo: 'operacion',
  },
  {
    ruta: '/periodo',
    inicial: true,
    etiqueta: 'Actividades del Periodo',
    permiso: 'actividades.ver',
    icono: 'CalendarClock',
    grupo: 'operacion',
  },
  {
    ruta: '/planeacion/snies',
    inicial: true,
    etiqueta: 'Programas SNIES',
    permiso: 'planeacion.ver',
    icono: 'Database',
    grupo: 'planeacion',
  },
  {
    ruta: '/planeacion/programas',
    inicial: true,
    etiqueta: 'Programas UDES',
    permiso: 'planeacion.ver',
    icono: 'BookOpen',
    grupo: 'planeacion',
  },
  {
    ruta: '/planeacion/importar',
    inicial: true,
    etiqueta: 'Importar Programas',
    permiso: 'planeacion.administrar',
    icono: 'Database',
    grupo: 'planeacion',
  },
  {
    ruta: '/planeacion/otra',
    inicial: true,
    etiqueta: 'Otra Información de Programas',
    permiso: 'planeacion.ver',
    icono: 'ClipboardList',
    grupo: 'planeacion',
  },
  {
    ruta: '/planeacion/cupos',
    inicial: true,
    etiqueta: 'Proyección de Cupos',
    permiso: 'planeacion.ver',
    icono: 'Target',
    grupo: 'planeacion',
  },
  {
    ruta: '/usuarios',
    inicial: true,
    etiqueta: 'Usuarios',
    permiso: 'usuarios.ver',
    icono: 'Users',
    grupo: 'administracion',
  },
  {
    ruta: '/roles',
    inicial: true,
    etiqueta: 'Roles y Permisos',
    permiso: 'roles.administrar',
    icono: 'ShieldCheck',
    grupo: 'administracion',
  },
  {
    ruta: '/periodos',
    inicial: true,
    etiqueta: 'Periodos Académicos',
    permiso: 'periodos.administrar',
    icono: 'CalendarCog',
    grupo: 'administracion',
  },
  {
    ruta: '/flujo',
    inicial: true,
    etiqueta: 'Flujo de Validación',
    permiso: 'roles.administrar',
    icono: 'GitBranch',
    grupo: 'administracion',
  },
  {
    ruta: '/correo',
    inicial: true,
    etiqueta: 'Notificaciones',
    permiso: 'roles.administrar',
    icono: 'Mail',
    grupo: 'administracion',
  },
  {
    ruta: '/menu',
    inicial: true,
    etiqueta: 'Menú y Navegación',
    permiso: 'roles.administrar',
    icono: 'PanelLeft',
    grupo: 'administracion',
  },
  {
    ruta: '/apariencia',
    etiqueta: 'Apariencia',
    permiso: null,
    icono: 'Sparkles',
    grupo: 'administracion',
  },
  {
    ruta: '/auditoria',
    inicial: true,
    etiqueta: 'Bitácora',
    permiso: 'auditoria.consultar',
    icono: 'FileClock',
    grupo: 'administracion',
  },
]

export const rutaDelCatalogo = (ruta: string) => RUTAS_MENU.find((r) => r.ruta === ruta)
