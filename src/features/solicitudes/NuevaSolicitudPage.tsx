import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Layers, Lightbulb, Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { dispararEnvioCorreos } from '@/lib/correo'
import { cn } from '@/lib/cn'
import { AYUDA_CODIGO, normalizarCodigo, validarCodigo } from '@/lib/codigos'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Campo, Checkbox, Input, Select, Textarea } from '@/components/ui/Field'
import { Card, CardHeader, EmptyState } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/AuthProvider'
import type { ActividadArbolRow, Prioridad, TipoSolicitud } from '@/types/database'

const MIN_JUSTIFICACION = 150
const MAX_JUSTIFICACION = 2000

/**
 * Una actividad afectada por la solicitud.
 *
 * El expediente guarda CÓMO DEBE QUEDAR cada actividad, no una instrucción que
 * alguien tenga que interpretar. Por eso al seleccionar una se copian su código
 * y su nomenclatura actuales: el solicitante edita lo que quiere cambiar y deja
 * el resto como está, y quien firma lee el resultado, no la orden.
 */
interface Linea {
  /** Clave local de React. No viaja a la base. */
  clave: string
  principalId: string
  /** Vacío en un alta: la actividad todavía no existe. */
  actividadId: string
  codigo: string
  nomenclatura: string
  /** Lo que hay hoy, para poder enseñarlo al lado de la propuesta. */
  actualCodigo: string
  actualNomenclatura: string
}

interface Formulario {
  tipo: TipoSolicitud
  prioridad: Prioridad
  principales: string[]
  lineas: Linea[]
  justificacion: string
}

const INICIAL: Formulario = {
  tipo: 'crear',
  prioridad: 'normal',
  principales: [],
  lineas: [],
  justificacion: '',
}

let contador = 0
const nuevaClave = () => `linea-${++contador}`

export function NuevaSolicitudPage() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [f, setF] = useState<Formulario>(INICIAL)
  const [tocado, setTocado] = useState<Set<string>>(new Set())

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
  const hijasDe = (principalId: string) =>
    actividades?.filter((a) => a.tipo !== 'principal' && a.raiz_id === principalId) ?? []

  // ---------------------------------------------------------------------------
  // Selección
  // ---------------------------------------------------------------------------
  function alternarPrincipal(id: string) {
    setF((prev) => {
      const dentro = prev.principales.includes(id)
      return {
        ...prev,
        principales: dentro
          ? prev.principales.filter((p) => p !== id)
          : [...prev.principales, id],
        // Al quitar un pilar se van con él sus actividades: dejarlas colgando
        // produciría una solicitud que afecta a algo que ya no está declarado.
        lineas: dentro ? prev.lineas.filter((l) => l.principalId !== id) : prev.lineas,
      }
    })
  }

  function alternarAfectada(principalId: string, a: ActividadArbolRow) {
    setF((prev) => {
      const existente = prev.lineas.find((l) => l.actividadId === a.id)
      if (existente) {
        return { ...prev, lineas: prev.lineas.filter((l) => l.clave !== existente.clave) }
      }
      return {
        ...prev,
        lineas: [
          ...prev.lineas,
          {
            clave: nuevaClave(),
            principalId,
            actividadId: a.id,
            // Precargado con lo que hay hoy: se edita lo que cambia.
            codigo: a.codigo,
            nomenclatura: a.nomenclatura,
            actualCodigo: a.codigo,
            actualNomenclatura: a.nomenclatura,
          },
        ],
      }
    })
  }

  function anadirAlta(principalId: string) {
    setF((prev) => ({
      ...prev,
      lineas: [
        ...prev.lineas,
        {
          clave: nuevaClave(),
          principalId,
          actividadId: '',
          codigo: '',
          nomenclatura: '',
          actualCodigo: '',
          actualNomenclatura: '',
        },
      ],
    }))
  }

  const quitarLinea = (clave: string) =>
    setF((prev) => ({ ...prev, lineas: prev.lineas.filter((l) => l.clave !== clave) }))

  const editarLinea = (clave: string, campo: 'codigo' | 'nomenclatura', valor: string) =>
    setF((prev) => ({
      ...prev,
      lineas: prev.lineas.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)),
    }))

  function cambiarTipo(tipo: TipoSolicitud) {
    // Las líneas de una modificación no significan lo mismo en un alta: se
    // vacían en vez de arrastrar una selección que dejó de tener sentido.
    setF((prev) => ({ ...prev, tipo, lineas: [] }))
  }

  // ---------------------------------------------------------------------------
  // Validación. Se calcula siempre, pero sólo se MUESTRA en los campos que el
  // usuario ya tocó: señalar en rojo un formulario recién abierto es hostil.
  // ---------------------------------------------------------------------------
  const errores: Record<string, string> = {}

  if (f.principales.length === 0) {
    errores.principales = 'Elige al menos una actividad principal.'
  }
  if (f.lineas.length === 0) {
    errores.lineas =
      f.tipo === 'crear'
        ? 'Añade al menos una actividad que quieras crear.'
        : 'Selecciona al menos una actividad afectada.'
  }

  for (const l of f.lineas) {
    if (f.tipo === 'crear' && !l.nomenclatura.trim()) {
      errores[`nomenclatura-${l.clave}`] = 'Describe la actividad que quieres crear.'
    }
    // El código sugerido es opcional: lo confirma la administración al aplicar.
    const err = validarCodigo(l.codigo, false)
    if (err) errores[`codigo-${l.clave}`] = err
  }

  const largoJustificacion = f.justificacion.trim().length
  if (largoJustificacion < MIN_JUSTIFICACION) {
    errores.justificacion = `Faltan ${MIN_JUSTIFICACION - largoJustificacion} caracteres para alcanzar el mínimo.`
  }

  const valido = Object.keys(errores).length === 0

  const ver = (campo: string) => (tocado.has(campo) ? errores[campo] ?? null : null)
  const marcar = (campo: string) => setTocado((t) => new Set(t).add(campo))

  // ---------------------------------------------------------------------------
  const enviar = useMutation({
    mutationFn: async (comoBorrador: boolean) => {
      if (!perfil) throw new Error('Sesión no disponible')

      // La cabecera y sus líneas entran en la misma transacción: la función se
      // encarga, y por eso ya no se inserta contra la tabla desde aquí.
      const { data, error } = await supabase.rpc('fn_guardar_solicitud', {
        p_solicitud_id: null,
        p_tipo: f.tipo,
        p_prioridad: f.prioridad,
        p_concepto: f.justificacion.trim(),
        p_lineas: f.lineas.map((l) => ({
          actividad_principal_id: l.principalId,
          actividad_id: l.actividadId || null,
          codigo: l.codigo.trim() || null,
          nomenclatura: l.nomenclatura.trim() || null,
        })),
        p_enviar: !comoBorrador,
      })

      if (error) throw error
      return data?.[0]
    },
    onSuccess: (data, comoBorrador) => {
      toast.success(
        comoBorrador
          ? `Borrador guardado como ${data?.folio}`
          : `Solicitud ${data?.folio} enviada a revisión`,
        {
          description:
            f.lineas.length > 1
              ? `${f.lineas.length} actividades en un solo expediente.`
              : undefined,
        },
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
    setTocado(new Set(Object.keys(errores)))
    if (valido) enviar.mutate(false)
  }

  const etiquetaAcciones =
    f.tipo === 'crear'
      ? 'Actividades a crear'
      : f.tipo === 'eliminar'
        ? 'Actividades a dar de baja'
        : 'Actividades afectadas'

  return (
    <>
      <PageHeader
        titulo="Nueva solicitud"
        descripcion="Propón cambios sobre una o varias actividades. Se revisan juntas, en un solo expediente."
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
                    onChange={(e) => cambiarTipo(e.target.value as TipoSolicitud)}
                  >
                    <option value="crear">Crear actividades nuevas</option>
                    <option value="editar">Modificar actividades existentes</option>
                    <option value="eliminar">Dar de baja actividades</option>
                  </Select>
                )}
              </Campo>

              <Campo etiqueta="Prioridad">
                {({ id }) => (
                  <Select
                    id={id}
                    value={f.prioridad}
                    onChange={(e) =>
                      setF((prev) => ({ ...prev, prioridad: e.target.value as Prioridad }))
                    }
                  >
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente — bloquea el periodo</option>
                  </Select>
                )}
              </Campo>
            </div>
          </Card>

          {/* Actividades principales ----------------------------------- */}
          <Card>
            <CardHeader
              titulo="Actividades principales"
              descripcion="Los pilares a los que pertenece la petición. Puedes marcar varios."
              icono={<Layers className="size-4" />}
            />
            <div className="p-4">
              {ver('principales') && (
                <p className="mb-2 text-body-sm text-danger">{errores.principales}</p>
              )}
              <div className="grid gap-1 sm:grid-cols-2">
                {principales.map((a) => (
                  <Checkbox
                    key={a.id}
                    etiqueta={
                      <span>
                        <span className="font-mono text-fg-muted">{a.codigo}</span>{' '}
                        {a.nomenclatura}
                      </span>
                    }
                    checked={f.principales.includes(a.id)}
                    onChange={() => {
                      marcar('principales')
                      alternarPrincipal(a.id)
                    }}
                  />
                ))}
              </div>
            </div>
          </Card>

          {/* Actividades afectadas ------------------------------------- */}
          <Card>
            <CardHeader
              titulo={etiquetaAcciones}
              descripcion={
                f.tipo === 'crear'
                  ? 'Añade una fila por cada actividad nueva. Todas colgarán del pilar indicado.'
                  : 'Sólo se ofrecen las actividades que cuelgan de los pilares que marcaste arriba.'
              }
            />

            <div className="flex flex-col gap-4 p-4">
              {ver('lineas') && <p className="text-body-sm text-danger">{errores.lineas}</p>}

              {f.principales.length === 0 ? (
                <EmptyState
                  titulo="Elige primero la actividad principal"
                  descripcion="Las actividades afectadas siempre cuelgan de un pilar, así que ése es el primer paso."
                />
              ) : (
                f.principales.map((pid) => {
                  const principal = principales.find((a) => a.id === pid)
                  const hijas = hijasDe(pid)
                  return (
                    <section key={pid}>
                      <h3 className="text-label text-fg">
                        <span className="font-mono text-fg-muted">{principal?.codigo}</span>{' '}
                        {principal?.nomenclatura}
                      </h3>

                      {f.tipo === 'crear' ? (
                        <div className="mt-2">
                          <Button
                            tamano="sm"
                            onClick={() => anadirAlta(pid)}
                            iconoIzq={<Plus className="size-4" />}
                          >
                            Añadir actividad bajo este pilar
                          </Button>
                          <p className="mt-1.5 text-body-sm text-fg-subtle">
                            {f.lineas.filter((l) => l.principalId === pid).length} añadida(s). Se
                            describen abajo, en «Cambios propuestos».
                          </p>
                        </div>
                      ) : hijas.length === 0 ? (
                        <p className="mt-2 text-body-sm text-fg-subtle">
                          Este pilar todavía no tiene actividades por debajo.
                        </p>
                      ) : (
                        <div className="mt-2 grid gap-1 sm:grid-cols-2">
                          {hijas.map((a) => (
                            <Checkbox
                              key={a.id}
                              etiqueta={
                                <span>
                                  <span className="font-mono text-fg-muted">{a.codigo}</span>{' '}
                                  {a.nomenclatura}
                                </span>
                              }
                              checked={f.lineas.some((l) => l.actividadId === a.id)}
                              onChange={() => {
                                marcar('lineas')
                                alternarAfectada(pid, a)
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  )
                })
              )}
            </div>
          </Card>

          {/* Cambios propuestos ---------------------------------------- */}
          {f.tipo !== 'eliminar' && f.lineas.length > 0 && (
            <Card>
              <CardHeader
                titulo="Cambios propuestos"
                descripcion="Cómo debería quedar cada actividad si se aprueba. Lo precargado es lo que hay hoy."
              />
              <div className="flex flex-col divide-y divide-line">
                {f.lineas.map((l, i) => {
                  const principal = principales.find((a) => a.id === l.principalId)
                  const cambiado =
                    l.codigo.trim() !== l.actualCodigo ||
                    l.nomenclatura.trim() !== l.actualNomenclatura
                  return (
                    <div key={l.clave} className="p-4">
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-label text-fg">
                          {i + 1}.{' '}
                          {l.actividadId ? (
                            <>
                              <span className="font-mono text-fg-muted">{l.actualCodigo}</span>{' '}
                              {l.actualNomenclatura}
                            </>
                          ) : (
                            <span className="text-fg-muted">
                              Actividad nueva bajo {principal?.codigo}
                            </span>
                          )}
                        </h3>
                        <div className="flex items-center gap-2">
                          {l.actividadId && !cambiado && (
                            <span className="text-body-sm text-warning">Sin cambios todavía</span>
                          )}
                          <Button
                            tamano="sm"
                            onClick={() => quitarLinea(l.clave)}
                            iconoIzq={<Trash2 className="size-4" />}
                          >
                            Quitar
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <Campo
                          etiqueta="Código"
                          error={ver(`codigo-${l.clave}`)}
                          pista={`Opcional. ${AYUDA_CODIGO}`}
                        >
                          {({ id, describedBy, invalido }) => (
                            <Input
                              id={id}
                              aria-describedby={describedBy}
                              aria-invalid={invalido}
                              placeholder="SUB-014"
                              value={l.codigo}
                              onBlur={() => marcar(`codigo-${l.clave}`)}
                              onChange={(e) =>
                                editarLinea(l.clave, 'codigo', normalizarCodigo(e.target.value))
                              }
                            />
                          )}
                        </Campo>

                        <Campo
                          etiqueta="Nomenclatura oficial"
                          requerido={f.tipo === 'crear'}
                          error={ver(`nomenclatura-${l.clave}`)}
                          className="sm:col-span-2"
                        >
                          {({ id, describedBy, invalido }) => (
                            <Input
                              id={id}
                              aria-describedby={describedBy}
                              aria-invalid={invalido}
                              placeholder="Ej. Revisión de Sílabos de Ciencias Generales"
                              value={l.nomenclatura}
                              onBlur={() => marcar(`nomenclatura-${l.clave}`)}
                              onChange={(e) => editarLinea(l.clave, 'nomenclatura', e.target.value)}
                            />
                          )}
                        </Campo>
                      </div>
                    </div>
                  )
                })}
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
                    onChange={(e) =>
                      setF((prev) => ({ ...prev, justificacion: e.target.value }))
                    }
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

              <p className="mt-2 text-body-sm text-fg-subtle">
                Una sola justificación para todo el expediente: las{' '}
                {f.lineas.length || 'varias'} actividades se deciden juntas.
              </p>
            </div>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => navigate('/solicitudes')}>Cancelar</Button>
            <Button
              onClick={() => enviar.mutate(true)}
              disabled={enviar.isPending || f.lineas.length === 0}
              title={f.lineas.length === 0 ? 'Añade al menos una actividad' : undefined}
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
              <li>
                Agrupa en un mismo expediente las actividades que se deciden juntas; separa las que
                no.
              </li>
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
