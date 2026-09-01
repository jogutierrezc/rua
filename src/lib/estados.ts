import type { TonoBadge } from '@/components/ui/primitives'
import type {
  EstadoActividad,
  EstadoEjecucion,
  EstadoRegistro,
  EstadoSolicitud,
  EstadoEtapa,
  EstadoPeriodo,
  NivelAcceso,
  Prioridad,
  TipoActividad,
  TipoSolicitud,
} from '@/types/database'

/**
 * Un estado debe verse EXACTAMENTE igual en la bandeja, en el detalle y en el
 * reporte. Centralizarlo aquí es lo que garantiza esa consistencia; en cuanto
 * cada pantalla elige su propio color, el usuario deja de poder confiar en él.
 */
interface Presentacion {
  etiqueta: string
  tono: TonoBadge
}

export const ESTADO_SOLICITUD: Record<EstadoSolicitud, Presentacion> = {
  borrador: { etiqueta: 'Borrador', tono: 'neutro' },
  pendiente: { etiqueta: 'Pendiente', tono: 'aviso' },
  revision: { etiqueta: 'En revisión', tono: 'primario' },
  aprobada: { etiqueta: 'Aprobada', tono: 'exito' },
  denegada: { etiqueta: 'Denegada', tono: 'peligro' },
  cancelada: { etiqueta: 'Cancelada', tono: 'neutro' },
}

export const TIPO_SOLICITUD: Record<TipoSolicitud, Presentacion> = {
  crear: { etiqueta: 'Crear', tono: 'primario' },
  editar: { etiqueta: 'Editar', tono: 'acento' },
  eliminar: { etiqueta: 'Eliminar', tono: 'peligro' },
}

export const PRIORIDAD: Record<Prioridad, Presentacion> = {
  normal: { etiqueta: 'Normal', tono: 'neutro' },
  alta: { etiqueta: 'Alta', tono: 'aviso' },
  urgente: { etiqueta: 'Urgente', tono: 'peligro' },
}

export const ESTADO_ACTIVIDAD: Record<EstadoActividad, Presentacion> = {
  borrador: { etiqueta: 'Borrador', tono: 'neutro' },
  activa: { etiqueta: 'Activa', tono: 'exito' },
  revision: { etiqueta: 'En revisión', tono: 'aviso' },
  archivada: { etiqueta: 'Archivada', tono: 'neutro' },
}

export const ESTADO_EJECUCION: Record<EstadoEjecucion, Presentacion> = {
  planificada: { etiqueta: 'Planificada', tono: 'neutro' },
  en_curso: { etiqueta: 'En curso', tono: 'primario' },
  realizada: { etiqueta: 'Realizada', tono: 'acento' },
  aprobada: { etiqueta: 'Aprobada', tono: 'exito' },
  cancelada: { etiqueta: 'Cancelada', tono: 'peligro' },
}

export const ESTADO_ETAPA: Record<EstadoEtapa, Presentacion> = {
  bloqueada: { etiqueta: 'Bloqueada', tono: 'neutro' },
  pendiente: { etiqueta: 'En espera de firma', tono: 'aviso' },
  aprobada: { etiqueta: 'Aprobada', tono: 'exito' },
  denegada: { etiqueta: 'Denegada', tono: 'peligro' },
  omitida: { etiqueta: 'No aplicó', tono: 'neutro' },
}

export const ESTADO_PERIODO: Record<EstadoPeriodo, Presentacion> = {
  planificado: { etiqueta: 'Planificado', tono: 'neutro' },
  abierto: { etiqueta: 'Abierto', tono: 'exito' },
  cerrado: { etiqueta: 'Cerrado', tono: 'neutro' },
}

export const ESTADO_REGISTRO: Record<EstadoRegistro, Presentacion> = {
  activo: { etiqueta: 'Activo', tono: 'exito' },
  inactivo: { etiqueta: 'Inactivo', tono: 'neutro' },
}

export const TIPO_ACTIVIDAD: Record<TipoActividad, Presentacion> = {
  principal: { etiqueta: 'Principal', tono: 'primario' },
  directa: { etiqueta: 'Directa', tono: 'acento' },
  apoyo: { etiqueta: 'De apoyo', tono: 'neutro' },
}

export const NIVEL_ACCESO: Record<NivelAcceso, Presentacion> = {
  completo: { etiqueta: 'Completo', tono: 'primario' },
  limitado: { etiqueta: 'Limitado', tono: 'acento' },
  visor: { etiqueta: 'Solo visor', tono: 'neutro' },
}
