import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Lightbulb, Send } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { dispararEnvioCorreos } from '@/lib/correo'
import { cn } from '@/lib/cn'
import { AYUDA_CODIGO, normalizarCodigo, validarCodigo } from '@/lib/codigos'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Campo, Input, Select, Textarea } from '@/components/ui/Field'
import { Card, CardHeader } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/AuthProvider'
import type { ActividadArbolRow, Prioridad, TipoSolicitud } from '@/types/database'

const MIN_JUSTIFICACION = 150
const MAX_JUSTIFICACION = 2000

interface Formulario {
  tipo: TipoSolicitud
  prioridad: Prioridad
  actividadPrincipalId: string
  actividadId: string
  propuestaCodigo: string
  propuestaNomenclatura: string
  propuestaApoyo: string
  justificacion: string
}

const INICIAL: Formulario = {
  tipo: 'crear',
  prioridad: 'normal',
  actividadPrincipalId: '',
  actividadId: '',
  propuestaCodigo: '',
  propuestaNomenclatura: '',
  propuestaApoyo: '',
  justificacion: '',
}

export function NuevaSolicitudPage() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [f, setF] = useState<Formulario>(INICIAL)
  const [tocado, setTocado] = useState<Set<keyof Formulario>>(new Set())

  const { data: actividades } = useQuery({
    queryKey: ['actividades', 'arbol'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_actividades_arbol')
        .select('*')
        .neq('estado', 'archivada')
        .order('ruta')
      if (error) throw error
      return (data ?? []) as ActividadArbolRow[]
    },
    staleTime: 60_000,
  })

  const principales = actividades?.filter((a) => a.tipo === 'principal') ?? []
  const hijasDeSeleccion = actividades?.filter(
    (a) => a.tipo !== 'principal' && a.raiz_id === f.actividadPrincipalId,
  ) ?? []

  // ---------------------------------------------------------------------------
  // Validación. Se calcula siempre, pero sólo se MUESTRA en los campos que el
  // usuario ya tocó: señalar en rojo un formulario recién abierto es hostil.
  // ---------------------------------------------------------------------------
  const errores: Partial<Record<keyof Formulario, string>> = {}

  if (!f.actividadPrincipalId) {
    errores.actividadPrincipalId = 'Elige la actividad principal a la que pertenece.'
  }
  if (f.tipo === 'crear' && !f.propuestaNomenclatura.trim()) {
    errores.propuestaNomenclatura = 'Describe la actividad que quieres crear.'
  }
  if (f.tipo !== 'crear' && !f.actividadId) {
    errores.actividadId = 'Selecciona la actividad afectada.'
  }
  // El código sugerido es opcional aquí: lo confirma coordinación al aprobar.
  const errorCodigoPropuesto = validarCodigo(f.propuestaCodigo, false)
  if (errorCodigoPropuesto) errores.propuestaCodigo = errorCodigoPropuesto

  const largoJustificacion = f.justificacion.trim().length
  if (largoJustificacion < MIN_JUSTIFICACION) {
    errores.justificacion = `Faltan ${MIN_JUSTIFICACION - largoJustificacion} caracteres para alcanzar el mínimo.`
  }

  const valido = Object.keys(errores).length === 0

  function ver(campo: keyof Formulario) {
    return tocado.has(campo) ? errores[campo] ?? null : null
  }
  function marcar(campo: keyof Formulario) {
    setTocado((t) => new Set(t).add(campo))
  }
  function set<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setF((prev) => ({ ...prev, [campo]: valor }))
  }

  // ---------------------------------------------------------------------------
  const enviar = useMutation({
    mutationFn: async (comoBorrador: boolean) => {
      if (!perfil) throw new Error('Sesión no disponible')

      const { data: periodo } = await supabase
        .from('periodos')
        .select('id')
        .eq('estado', 'abierto')
        .maybeSingle()

      const { data, error } = await supabase
        .from('solicitudes')
        .insert({
          tipo: f.tipo,
          estado: comoBorrador ? 'borrador' : 'pendiente',
          prioridad: f.prioridad,
          solicitante_id: perfil.id,
          periodo_id: periodo?.id ?? null,
          actividad_id: f.tipo === 'crear' ? null : f.actividadId || null,
          actividad_principal_id: f.actividadPrincipalId || null,
          propuesta_codigo: f.propuestaCodigo.trim() || null,
          propuesta_nomenclatura: f.propuestaNomenclatura.trim() || null,
          propuesta_tipo: f.tipo === 'crear' ? 'directa' : null,
          propuesta_apoyo: f.propuestaApoyo.trim() || null,
          concepto_justificativo: f.justificacion.trim(),
        })
        .select('folio')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data, comoBorrador) => {
      toast.success(
        comoBorrador
          ? `Borrador guardado como ${data.folio}`
          : `Solicitud ${data.folio} enviada a revisión`,
      )
      void qc.invalidateQueries({ queryKey: ['solicitudes'] })
      navigate('/solicitudes')
      // Los triggers ya encolaron los avisos; esto los empuja ahora.
      dispararEnvioCorreos()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    // Al intentar enviar, se muestran todos los errores de golpe: en ese
    // momento sí es lo que el usuario espera.
    setTocado(new Set(Object.keys(f) as (keyof Formulario)[]))
    if (valido) enviar.mutate(false)
  }

  return (
    <>
      <PageHeader
        titulo="Nueva solicitud"
        descripcion="Propón la creación o modificación de una actividad. La revisará el comité académico."
        volver={{ a: '/solicitudes', etiqueta: 'Volver a solicitudes' }}
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex flex-col gap-4">
          {/* Clasificación --------------------------------------------- */}
          <Card>
            <CardHeader
              titulo="Clasificación"
              descripcion="Dónde encaja esta petición dentro de la estructura."
            />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Campo
                etiqueta="Qué solicitas"
                requerido
                pista="Determina qué campos se piden a continuación."
              >
                {({ id }) => (
                  <Select
                    id={id}
                    value={f.tipo}
                    onChange={(e) => set('tipo', e.target.value as TipoSolicitud)}
                  >
                    <option value="crear">Crear una actividad nueva</option>
                    <option value="editar">Modificar una actividad existente</option>
                    <option value="eliminar">Dar de baja una actividad</option>
                  </Select>
                )}
              </Campo>

              <Campo etiqueta="Prioridad">
                {({ id }) => (
                  <Select
                    id={id}
                    value={f.prioridad}
                    onChange={(e) => set('prioridad', e.target.value as Prioridad)}
                  >
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente — bloquea el periodo</option>
                  </Select>
                )}
              </Campo>

              <Campo
                etiqueta="Actividad principal"
                requerido
                error={ver('actividadPrincipalId')}
                className="sm:col-span-2"
                pista="El pilar estratégico al que pertenece la petición."
              >
                {({ id, describedBy, invalido }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalido}
                    value={f.actividadPrincipalId}
                    onBlur={() => marcar('actividadPrincipalId')}
                    onChange={(e) => {
                      set('actividadPrincipalId', e.target.value)
                      set('actividadId', '') // la selección hija deja de ser válida
                    }}
                  >
                    <option value="">Selecciona la actividad principal…</option>
                    {principales.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo} · {a.nomenclatura}
                      </option>
                    ))}
                  </Select>
                )}
              </Campo>

              {f.tipo !== 'crear' && (
                <Campo
                  etiqueta="Actividad afectada"
                  requerido
                  error={ver('actividadId')}
                  className="sm:col-span-2"
                >
                  {({ id, describedBy, invalido }) => (
                    <Select
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalido}
                      disabled={!f.actividadPrincipalId}
                      value={f.actividadId}
                      onBlur={() => marcar('actividadId')}
                      onChange={(e) => set('actividadId', e.target.value)}
                    >
                      <option value="">
                        {f.actividadPrincipalId
                          ? 'Selecciona la actividad…'
                          : 'Elige primero la actividad principal'}
                      </option>
                      {hijasDeSeleccion.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.codigo} · {a.nomenclatura}
                        </option>
                      ))}
                    </Select>
                  )}
                </Campo>
              )}
            </div>
          </Card>

          {/* Propuesta ------------------------------------------------- */}
          {f.tipo !== 'eliminar' && (
            <Card>
              <CardHeader
                titulo={f.tipo === 'crear' ? 'Actividad propuesta' : 'Cambios propuestos'}
                descripcion="Cómo debería quedar la estructura si se aprueba."
              />
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                <Campo
                  etiqueta="Código sugerido"
                  error={ver('propuestaCodigo')}
                  pista={`Opcional. ${AYUDA_CODIGO}`}
                >
                  {({ id, describedBy, invalido }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalido}
                      placeholder="SUB-014"
                      value={f.propuestaCodigo}
                      onBlur={() => marcar('propuestaCodigo')}
                      onChange={(e) => set('propuestaCodigo', normalizarCodigo(e.target.value))}
                    />
                  )}
                </Campo>

                <Campo
                  etiqueta="Nomenclatura oficial"
                  requerido={f.tipo === 'crear'}
                  error={ver('propuestaNomenclatura')}
                  className="sm:col-span-2"
                >
                  {({ id, describedBy, invalido }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalido}
                      placeholder="Ej. Revisión de Sílabos de Ciencias Generales"
                      value={f.propuestaNomenclatura}
                      onBlur={() => marcar('propuestaNomenclatura')}
                      onChange={(e) => set('propuestaNomenclatura', e.target.value)}
                    />
                  )}
                </Campo>

                <Campo
                  etiqueta="Actividad de apoyo asociada"
                  className="sm:col-span-3"
                  pista="Si esta actividad requiere una tarea de soporte, descríbela aquí."
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      placeholder="Ej. Preparación de material didáctico"
                      value={f.propuestaApoyo}
                      onChange={(e) => set('propuestaApoyo', e.target.value)}
                    />
                  )}
                </Campo>
              </div>
            </Card>
          )}

          {/* Justificación --------------------------------------------- */}
          <Card>
            <CardHeader
              titulo="Concepto justificativo"
              descripcion="Es lo que lee el comité. Determina si la solicitud avanza."
            />
            <div className="p-4">
              <Campo etiqueta="Exposición de motivos" requerido error={ver('justificacion')}>
                {({ id, describedBy, invalido }) => (
                  <Textarea
                    id={id}
                    rows={8}
                    maxLength={MAX_JUSTIFICACION}
                    aria-describedby={describedBy}
                    aria-invalid={invalido}
                    placeholder="Explica el impacto esperado, los recursos necesarios y cómo se alinea con los objetivos institucionales. Si requiere presupuesto adicional, indícalo explícitamente."
                    value={f.justificacion}
                    onBlur={() => marcar('justificacion')}
                    onChange={(e) => set('justificacion', e.target.value)}
                  />
                )}
              </Campo>

              {/* El contador informa del progreso hacia el mínimo mientras se
                  escribe, no del fracaso una vez enviado. */}
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width,background-color] duration-200 ease-out',
                      largoJustificacion >= MIN_JUSTIFICACION ? 'bg-success' : 'bg-warning',
                    )}
                    style={{
                      width: `${Math.min(100, (largoJustificacion / MIN_JUSTIFICACION) * 100)}%`,
                    }}
                  />
                </div>
                <p className="shrink-0 tabular text-body-sm text-fg-subtle">
                  {largoJustificacion} / {MAX_JUSTIFICACION}
                </p>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => navigate('/solicitudes')}>Cancelar</Button>
            <Button
              onClick={() => enviar.mutate(true)}
              disabled={enviar.isPending || !f.justificacion.trim()}
            >
              Guardar borrador
            </Button>
            <Button
              type="submit"
              variante="primario"
              cargando={enviar.isPending}
              iconoIzq={<Send className="size-4" />}
            >
              Enviar a revisión
            </Button>
          </div>
        </div>

        {/* Guía contextual ---------------------------------------------- */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-label text-fg">
              <Info aria-hidden className="size-4 text-primary" />
              Guía de llenado
            </h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 text-body-sm text-fg-muted">
              <li>Evita descripciones genéricas: el comité deniega lo que no puede evaluar.</li>
              <li>Menciona la normativa institucional aplicable, si la hay.</li>
              <li>
                Si la actividad requiere presupuesto adicional, dilo de forma explícita en el texto.
              </li>
              <li>Un borrador puede editarse; una solicitud enviada, ya no.</li>
            </ul>
          </Card>

          <Card className="flex items-start gap-3 bg-primary-soft p-4">
            <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-softFg" />
            <div>
              <h2 className="text-label text-primary-softFg">Aprobación acelerada</h2>
              <p className="mt-1 text-body-sm leading-relaxed text-primary-softFg/85">
                Las solicitudes asociadas a Gestión Institucional se resuelven normalmente en 48–72
                horas hábiles.
              </p>
            </div>
          </Card>
        </aside>
      </form>
    </>
  )
}
