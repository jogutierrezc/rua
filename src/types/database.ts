/**
 * Tipos del esquema de Supabase.
 *
 * Escritos a mano para que el proyecto compile antes de tener una instancia
 * conectada. En cuanto tengas la CLI apuntando a tu proyecto, regenéralos:
 *
 *   npm run db:types
 *
 * a partir de ahí este archivo es generado y no debe editarse a mano.
 */

export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[]

// -----------------------------------------------------------------------------
// Enumeraciones
// -----------------------------------------------------------------------------
export type NivelAcceso = 'completo' | 'limitado' | 'visor'
export type EstadoRegistro = 'activo' | 'inactivo'
export type TipoActividad = 'principal' | 'directa' | 'apoyo'
export type EstadoActividad = 'borrador' | 'activa' | 'revision' | 'archivada'
export type EstadoEjecucion = 'planificada' | 'en_curso' | 'realizada' | 'aprobada' | 'cancelada'
export type TipoSolicitud = 'crear' | 'editar' | 'eliminar'
export type EstadoSolicitud =
  | 'borrador'
  | 'pendiente'
  | 'revision'
  | 'aprobada'
  | 'denegada'
  | 'cancelada'
export type Prioridad = 'normal' | 'alta' | 'urgente'
export type EstadoPeriodo = 'planificado' | 'abierto' | 'cerrado'
export type EstadoEtapa = 'bloqueada' | 'pendiente' | 'aprobada' | 'denegada' | 'omitida'
export type EstadoCorreo = 'pendiente' | 'enviado' | 'fallido' | 'cancelado'
export type AccionAuditoria = 'insert' | 'update' | 'delete' | 'login' | 'aprobar' | 'denegar'

/**
 * Códigos del catálogo `permisos`.
 *
 * Los literales son fijos: un typo en `usuarios.administrar` debe fallar al
 * compilar. La rama `solicitudes.validar_*` queda abierta porque el
 * administrador puede crear etapas de validación nuevas desde la interfaz, y
 * cada una estrena su propio permiso — la política RLS de `permisos` sólo
 * admite altas con ese prefijo, así que la apertura está acotada.
 */
export type CodigoPermiso =
  | `solicitudes.validar_${string}`
  | 'bi.consultar'
  | 'bi.exportar'
  | 'actividades.ver'
  | 'actividades.crear'
  | 'actividades.editar'
  | 'actividades.eliminar'
  | 'solicitudes.crear'
  | 'solicitudes.revisar'
  | 'usuarios.ver'
  | 'usuarios.administrar'
  | 'roles.administrar'
  | 'periodos.administrar'
  | 'solicitudes.validar_financiera'
  | 'solicitudes.validar_auditoria'
  | 'auditoria.consultar'

// -----------------------------------------------------------------------------
// Filas
// -----------------------------------------------------------------------------
type Timestamps = {
  creado_en: string
  actualizado_en: string
}

export type VicerrectoriaRow = Timestamps & {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  estado: EstadoRegistro
  orden: number
}

export type PermisoRow = {
  codigo: CodigoPermiso
  modulo: string
  accion: string
  descripcion: string
}

export type RolRow = Timestamps & {
  id: string
  nombre: string
  descripcion: string | null
  puede_leer: boolean
  puede_editar: boolean
  puede_eliminar: boolean
  nivel_acceso: NivelAcceso
  estado: EstadoRegistro
  es_sistema: boolean
  creado_por: string | null
}

export type RolPermisoRow = {
  rol_id: string
  permiso_codigo: CodigoPermiso
  concedido_en: string
}

export type PerfilRow = Timestamps & {
  id: string
  nombre_completo: string
  correo: string
  cargo: string | null
  /** Documento de identidad. Sólo lo edita quien administra usuarios. */
  numero_documento: string | null
  avatar_url: string | null
  rol_id: string | null
  vicerrectoria_id: string | null
  estado: EstadoRegistro
  ultimo_acceso_en: string | null
  /** Ajustes personales de interfaz: `{ paleta, modo }`. Autoeditables. */
  preferencias: Json
}

export type PeriodoRow = Timestamps & {
  id: string
  codigo: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  estado: EstadoPeriodo
}

export type ActividadRow = Timestamps & {
  id: string
  codigo: string
  nomenclatura: string
  descripcion: string | null
  tipo: TipoActividad
  padre_id: string | null
  nivel: number
  ruta: string
  estado: EstadoActividad
  orden: number
  creado_por: string | null
}

export type ActividadArbolRow = ActividadRow & {
  padre_codigo: string | null
  padre_nomenclatura: string | null
  raiz_id: string | null
  raiz_nomenclatura: string | null
  total_hijos: number
  vicerrectorias: string[]
}

export type ActividadPeriodoRow = Timestamps & {
  id: string
  actividad_id: string
  periodo_id: string
  estado: EstadoEjecucion
  responsable_id: string | null
  observaciones: string | null
  aprobado_por: string | null
  aprobado_en: string | null
}

export type SolicitudRow = Timestamps & {
  id: string
  folio: string
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  prioridad: Prioridad
  solicitante_id: string
  periodo_id: string | null
  actividad_id: string | null
  actividad_principal_id: string | null
  propuesta_codigo: string | null
  propuesta_nomenclatura: string | null
  propuesta_tipo: TipoActividad | null
  propuesta_apoyo: string | null
  concepto_justificativo: string
  resuelto_por: string | null
  resuelto_en: string | null
  comentario_resolucion: string | null
}

export type SolicitudDetalleRow = {
  id: string
  folio: string
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  prioridad: Prioridad
  concepto_justificativo: string
  creado_en: string
  resuelto_en: string | null
  comentario_resolucion: string | null
  solicitante_id: string
  solicitante_nombre: string
  solicitante_cargo: string | null
  solicitante_avatar: string | null
  solicitante_vicerrectoria: string | null
  actividad_id: string | null
  actividad_codigo: string | null
  actividad_nomenclatura: string | null
  objetivo_nomenclatura: string | null
  objetivo_codigo: string | null
  periodo_id: string | null
  periodo_codigo: string | null
  resuelto_por: string | null
  resuelto_por_nombre: string | null
}

export type EtapaFlujoRow = {
  codigo: string
  nombre: string
  descripcion: string | null
  orden: number
  permiso_codigo: CodigoPermiso
  obligatoria: boolean
  activa: boolean
  /** Al aprobarla, el cambio se aplica sobre `actividades`. */
  materializa: boolean
}

/** Fila de `v_etapas_configuracion`: la etapa con los roles que la firman. */
export type EtapaConfiguracionRow = EtapaFlujoRow & {
  roles: string[]
  rol_ids: string[]
  expedientes_esperando: number
}

/** Fila de `v_solicitud_etapas`: la etapa con su revisor ya resuelto. */
export type SolicitudEtapaRow = {
  id: string
  solicitud_id: string
  etapa_codigo: string
  orden: number
  estado: EstadoEtapa
  justificacion: string | null
  decidida_en: string | null
  revisor_id: string | null
  etapa_nombre: string
  etapa_descripcion: string | null
  permiso_codigo: CodigoPermiso
  revisor_nombre: string | null
  revisor_avatar: string | null
  revisor_rol: string | null
  /** Al aprobar esta etapa, el cambio se aplica sobre la estructura. */
  materializa: boolean
}

/** Lo que devuelve `fn_decidir_etapa`. */
export type ResultadoDecision = {
  etapa_decidida: string
  siguiente_etapa: string | null
  estado_solicitud: EstadoSolicitud
  /** Id de la actividad creada o afectada, si la etapa materializaba. */
  actividad_id: string | null
}

export type SolicitudRevisionRow = {
  id: string
  solicitud_id: string
  revisor_id: string | null
  estado_anterior: EstadoSolicitud | null
  estado_nuevo: EstadoSolicitud
  comentario: string | null
  creado_en: string
}

export type NotificacionRow = {
  id: string
  destinatario_id: string
  titulo: string
  cuerpo: string | null
  enlace: string | null
  icono: string | null
  leida_en: string | null
  creado_en: string
}

export type AuditoriaRow = {
  id: number
  tabla: string
  registro_id: string
  accion: AccionAuditoria
  actor_id: string | null
  datos_antes: Json | null
  datos_despues: Json | null
  creado_en: string
}

/**
 * Modo de importación.
 * - `mezclar`: crea lo que falta y actualiza lo que existe (por defecto)
 * - `solo_crear`: nunca toca una actividad existente
 * - `solo_actualizar`: nunca crea nada nuevo
 */
export type ModoImportacion = 'mezclar' | 'solo_crear' | 'solo_actualizar'

/** Fila cruda tal como sale del CSV, antes de que la valide el servidor. */
export type FilaImportacion = {
  codigo?: string
  nomenclatura?: string
  tipo?: string
  padre_codigo?: string
  estado?: string
  descripcion?: string
}

/** Diagnóstico por fila que devuelve `fn_validar_importacion`. */
export type DiagnosticoImportacion = {
  linea: number
  codigo: string | null
  nomenclatura: string | null
  tipo: string | null
  padre_codigo: string | null
  estado: string | null
  descripcion: string | null
  accion: 'crear' | 'actualizar' | 'error'
  severidad: 'ok' | 'aviso' | 'error'
  mensaje: string | null
}

export type ResultadoImportacion = {
  creadas: number
  actualizadas: number
  omitidas: number
}

/** Una fila que desaparecería al borrar; `seleccionada: false` = cae en cascada. */
export type FilaEliminacion = {
  id: string
  codigo: string
  nomenclatura: string
  tipo: TipoActividad
  nivel: number
  seleccionada: boolean
  solicitudes: number
}

/** Fila de `v_periodos_detalle`: el periodo con lo que contiene. */
export type PeriodoDetalleRow = PeriodoRow & {
  dias_totales: number
  dias_restantes: number
  en_curso: boolean
  actividades: number
  actividades_pendientes: number
  solicitudes: number
  solicitudes_sin_resolver: number
}

/** Lo que devuelve `fn_abrir_periodo`. */
export type ResultadoApertura = {
  cerrado_codigo: string | null
  actividades_creadas: number
}

/** Ajustes del remitente. La API key de Resend NO vive aquí: es un secreto de Supabase. */
export type ConfigCorreo = {
  activo?: boolean
  remitente?: string
  nombre_remitente?: string
  responder_a?: string | null
  copia_oculta?: string | null
}

export type PlantillaCorreoRow = {
  codigo: string
  nombre: string
  descripcion: string | null
  asunto: string
  cuerpo: string
  activa: boolean
  variables: string[]
  es_sistema: boolean
  actualizado_en: string
  actualizado_por: string | null
}

/** Fila de la bandeja de salida. El cuerpo está YA renderizado. */
export type CorreoRow = {
  id: string
  destinatario: string
  destinatario_nombre: string | null
  asunto: string
  cuerpo: string
  plantilla_codigo: string | null
  solicitud_id: string | null
  estado: EstadoCorreo
  intentos: number
  error: string | null
  proveedor_id: string | null
  enviado_en: string | null
  creado_en: string
}

export type ConfiguracionRow = {
  id: boolean
  apariencia: Json
  /** Ajustes del remitente, con la forma de `ConfigCorreo`. */
  correo: Json
  nombre_institucion: string
  actualizado_en: string
  actualizado_por: string | null
}

export type MetricasSolicitudes = {
  total: number
  aprobadas: number
  pendientes: number
  denegadas: number
  urgentes: number
  tasa_aprobacion: number | null
}

// -----------------------------------------------------------------------------
// Forma que espera @supabase/supabase-js
// -----------------------------------------------------------------------------
type Tabla<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      vicerrectorias: Tabla<VicerrectoriaRow>
      permisos: Tabla<PermisoRow>
      roles: Tabla<RolRow>
      rol_permisos: Tabla<RolPermisoRow, Pick<RolPermisoRow, 'rol_id' | 'permiso_codigo'>>
      perfiles: Tabla<PerfilRow>
      periodos: Tabla<PeriodoRow>
      actividades: Tabla<ActividadRow>
      actividad_vicerrectorias: Tabla<{
        actividad_id: string
        vicerrectoria_id: string
        asignado_en: string
      }>
      rol_actividades: Tabla<{ rol_id: string; actividad_id: string; asignado_en: string }>
      actividad_periodo: Tabla<ActividadPeriodoRow>
      solicitudes: Tabla<SolicitudRow>
      solicitud_revisiones: Tabla<SolicitudRevisionRow>
      etapas_flujo: Tabla<EtapaFlujoRow>
      solicitud_etapas: Tabla<SolicitudEtapaRow>
      notificaciones: Tabla<NotificacionRow>
      auditoria: Tabla<AuditoriaRow>
      configuracion: Tabla<ConfiguracionRow>
      plantillas_correo: Tabla<PlantillaCorreoRow>
      correos: Tabla<CorreoRow>
    }
    Views: {
      v_actividades_arbol: { Row: ActividadArbolRow; Relationships: [] }
      v_solicitudes_detalle: { Row: SolicitudDetalleRow; Relationships: [] }
      v_periodos_detalle: { Row: PeriodoDetalleRow; Relationships: [] }
      v_solicitud_etapas: { Row: SolicitudEtapaRow; Relationships: [] }
      v_etapas_configuracion: { Row: EtapaConfiguracionRow; Relationships: [] }
    }
    Functions: {
      fn_metricas_solicitudes: {
        Args: { p_periodo_id?: string | null }
        Returns: MetricasSolicitudes[]
      }
      fn_tengo_permiso: { Args: { p_codigo: string }; Returns: boolean }
      fn_validar_importacion: {
        Args: { p_filas: FilaImportacion[] }
        Returns: DiagnosticoImportacion[]
      }
      fn_importar_actividades: {
        Args: { p_filas: FilaImportacion[]; p_modo?: ModoImportacion }
        Returns: ResultadoImportacion[]
      }
      fn_previsualizar_eliminacion: {
        Args: { p_ids: string[] }
        Returns: FilaEliminacion[]
      }
      fn_decidir_etapa: {
        Args: { p_solicitud_id: string; p_aprobar: boolean; p_justificacion: string }
        Returns: ResultadoDecision[]
      }
      fn_reordenar_etapas: { Args: { p_codigos: string[] }; Returns: undefined }
      fn_abrir_periodo: {
        Args: { p_id: string; p_copiar_actividades?: boolean }
        Returns: ResultadoApertura[]
      }
      fn_cerrar_periodo: { Args: { p_id: string }; Returns: undefined }
      fn_poblar_periodo: { Args: { p_id: string }; Returns: number }
      fn_cambiar_estado_actividades: {
        Args: {
          p_ids: string[]
          p_estado: EstadoActividad
          p_incluir_descendientes?: boolean
        }
        Returns: number
      }
    }
    Enums: {
      nivel_acceso: NivelAcceso
      estado_registro: EstadoRegistro
      tipo_actividad: TipoActividad
      estado_actividad: EstadoActividad
      estado_ejecucion: EstadoEjecucion
      tipo_solicitud: TipoSolicitud
      estado_solicitud: EstadoSolicitud
      prioridad: Prioridad
      estado_periodo: EstadoPeriodo
      accion_auditoria: AccionAuditoria
      estado_etapa: EstadoEtapa
      estado_correo: EstadoCorreo
    }
    CompositeTypes: { [_ in never]: never }
  }
}
