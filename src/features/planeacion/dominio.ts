import type { TonoBadge } from '@/components/ui/primitives'
import type {
  EstadoVigencia,
  ModalidadPrograma,
  NivelPrograma,
  TipoCupos,
} from '@/types/database'

/**
 * Cómo se dice cada valor del dominio académico.
 *
 * Los enumerados van en la base en minúscula y sin tildes —son claves, no
 * texto— y aquí se traducen. Un solo sitio: la tabla, el formulario y el
 * correo tienen que llamar «Especialización médico-quirúrgica» a lo mismo.
 */
export const NIVEL_PROGRAMA: Record<NivelPrograma, string> = {
  tecnico_profesional: 'Técnico Profesional',
  tecnologico: 'Tecnológico',
  profesional: 'Profesional',
  especializacion: 'Especialización',
  especializacion_medico_quirurgica: 'Especialización médico-quirúrgica',
  maestria: 'Maestría',
  doctorado: 'Doctorado',
}

export const MODALIDAD_PROGRAMA: Record<ModalidadPrograma, string> = {
  presencial: 'Presencial',
  distancia: 'A distancia',
  virtual: 'Virtual',
  dual: 'Dual',
}

export const TIPO_CUPOS: Record<TipoCupos, string> = {
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
  cohorte: 'Por cohorte',
  variacion_por_cohortes: 'Variación por cohortes',
}

/**
 * La vigencia del registro calificado, con el tono que le corresponde.
 *
 * `por_vencer` es aviso y no peligro a propósito: son los tres meses en los
 * que TODAVÍA se puede tramitar la renovación. El rojo se reserva para cuando
 * ya no hay margen, que es información distinta.
 */
export const ESTADO_VIGENCIA: Record<EstadoVigencia, { etiqueta: string; tono: TonoBadge }> = {
  sin_registro: { etiqueta: 'Sin registro', tono: 'neutro' },
  vencido: { etiqueta: 'Vencido', tono: 'peligro' },
  por_vencer: { etiqueta: 'Por vencer', tono: 'aviso' },
  proximo: { etiqueta: 'Próximo', tono: 'primario' },
  vigente: { etiqueta: 'Vigente', tono: 'exito' },
}

/** El bucket privado donde viven las resoluciones. */
export const BUCKET_REGISTROS = 'registros-calificados'
