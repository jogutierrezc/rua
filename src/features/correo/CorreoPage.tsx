import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  KeyRound,
  Mail,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { fechaRelativa } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Campo, Input, Switch, Textarea } from '@/components/ui/Field'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  TableShell,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives'
import type { TonoBadge } from '@/components/ui/primitives'
import type { ConfigCorreo, CorreoRow, EstadoCorreo, PlantillaCorreoRow } from '@/types/database'

type Pestana = 'configuracion' | 'plantillas' | 'bitacora'

const ESTADO_CORREO: Record<EstadoCorreo, { etiqueta: string; tono: TonoBadge }> = {
  pendiente: { etiqueta: 'En cola', tono: 'aviso' },
  enviado: { etiqueta: 'Enviado', tono: 'exito' },
  fallido: { etiqueta: 'Falló', tono: 'peligro' },
  cancelado: { etiqueta: 'Cancelado', tono: 'neutro' },
}

export function CorreoPage() {
  const [pestana, setPestana] = useState<Pestana>('configuracion')

  return (
    <>
      <PageHeader
        titulo="Notificaciones por correo"
        descripcion="Avisa a las oficinas del flujo cuando una solicitud entra, avanza o se resuelve."
      />

      <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ['configuracion', 'Configuración'],
            ['plantillas', 'Plantillas'],
            ['bitacora', 'Bitácora'],
          ] as const
        ).map(([clave, etiqueta]) => (
          <button
            key={clave}
            role="tab"
            aria-selected={pestana === clave}
            onClick={() => setPestana(clave)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-label',
              'transition-[color,border-color] duration-fast ease-out',
              pestana === clave
                ? 'border-primary text-primary'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'configuracion' && <Configuracion />}
      {pestana === 'plantillas' && <Plantillas />}
      {pestana === 'bitacora' && <Bitacora />}
    </>
  )
}

// -----------------------------------------------------------------------------
// Configuración de Resend
// -----------------------------------------------------------------------------
function Configuracion() {
  const qc = useQueryClient()
  const [prueba, setPrueba] = useState('')

  const { data, isPending } = useQuery({
    queryKey: ['correo', 'configuracion'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracion')
        .select('correo, nombre_institucion')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  /** Diagnóstico del servidor: qué falta para poder enviar. */
  const { data: diagnostico, refetch: rediagnosticar } = useQuery({
    queryKey: ['correo', 'diagnostico'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('probar-correo', { body: {} })
      if (error) return { api_key: false, remitente: false, activo: false, inalcanzable: true }
      return (data as { diagnostico: Record<string, boolean> }).diagnostico
    },
    retry: false,
  })

  const [config, setConfig] = useState<ConfigCorreo | null>(null)
  useEffect(() => {
    if (data?.correo && !config) setConfig(data.correo as ConfigCorreo)
  }, [data, config])

  const guardar = useMutation({
    mutationFn: async (c: ConfigCorreo) => {
      const { error } = await supabase.from('configuracion').update({ correo: c }).eq('id', true)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Configuración guardada')
      void qc.invalidateQueries({ queryKey: ['correo'] })
      void rediagnosticar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const enviarPrueba = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('probar-correo', {
        body: { destinatario: prueba.trim() },
      })
      if (error) {
        const ctx = error as { context?: { json?: () => Promise<unknown> } }
        const detalle = (await ctx.context?.json?.().catch(() => null)) as
          | { error?: string }
          | null
        throw new Error(detalle?.error ?? 'No se pudo enviar el correo de prueba.')
      }
      return data
    },
    onSuccess: () => {
      toast.success(`Correo enviado a ${prueba}`, {
        description: 'Si no llega en un minuto, revisa la carpeta de no deseados.',
      })
      void rediagnosticar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  if (isPending || !config) return <Skeleton className="h-64" />

  const listo = diagnostico?.api_key && diagnostico?.remitente && config.activo

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader
            titulo="Remitente"
            descripcion="Desde qué dirección salen las notificaciones."
            icono={<Mail className="size-4" />}
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo
              etiqueta="Dirección remitente"
              requerido
              pista="Debe pertenecer a un dominio verificado en Resend."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="email"
                  aria-describedby={describedBy}
                  placeholder="no-responder@institucion.edu"
                  value={config.remitente ?? ''}
                  onChange={(e) => setConfig({ ...config, remitente: e.target.value })}
                />
              )}
            </Campo>

            <Campo etiqueta="Nombre visible" pista="Lo que ve el destinatario antes del correo.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  placeholder="Rua · Gestión Académica"
                  value={config.nombre_remitente ?? ''}
                  onChange={(e) => setConfig({ ...config, nombre_remitente: e.target.value })}
                />
              )}
            </Campo>

            <Campo
              etiqueta="Responder a"
              pista="Opcional. Adónde van las respuestas, si alguien contesta."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="email"
                  aria-describedby={describedBy}
                  placeholder="soporte@institucion.edu"
                  value={config.responder_a ?? ''}
                  onChange={(e) => setConfig({ ...config, responder_a: e.target.value || null })}
                />
              )}
            </Campo>

            <Campo
              etiqueta="Copia oculta"
              pista="Opcional. Recibe copia de todo lo que sale, para archivo."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="email"
                  aria-describedby={describedBy}
                  placeholder="archivo@institucion.edu"
                  value={config.copia_oculta ?? ''}
                  onChange={(e) => setConfig({ ...config, copia_oculta: e.target.value || null })}
                />
              )}
            </Campo>
          </div>

          <div className="border-t border-line px-4">
            <Switch
              etiqueta="Enviar notificaciones"
              descripcion="Con esto apagado no se encola ni un correo: útil mientras se configura o durante una migración."
              checked={config.activo ?? false}
              onChange={(e) => setConfig({ ...config, activo: e.target.checked })}
            />
          </div>

          <div className="flex justify-end border-t border-line p-4">
            <Button
              variante="primario"
              cargando={guardar.isPending}
              onClick={() => guardar.mutate(config)}
            >
              Guardar configuración
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            titulo="Envío de prueba"
            descripcion="Comprueba la configuración de extremo a extremo antes de activarla."
            icono={<Send className="size-4" />}
          />
          <div className="flex flex-wrap items-end gap-3 p-4">
            <Campo etiqueta="Enviar a" className="min-w-[16rem] flex-1">
              {({ id }) => (
                <Input
                  id={id}
                  type="email"
                  placeholder="tu.correo@institucion.edu"
                  value={prueba}
                  onChange={(e) => setPrueba(e.target.value)}
                />
              )}
            </Campo>
            <Button
              cargando={enviarPrueba.isPending}
              disabled={!prueba.includes('@')}
              onClick={() => enviarPrueba.mutate()}
              iconoIzq={<Send className="size-4" />}
            >
              Enviar prueba
            </Button>
          </div>
          <p className="border-t border-line px-4 py-3 text-body-sm text-fg-subtle">
            La prueba no pasa por la bandeja de salida ni ensucia la bitácora, y devuelve el error
            exacto de Resend si algo falla.
          </p>
        </Card>
      </div>

      {/* Estado de la configuración ---------------------------------- */}
      <Card className="lg:sticky lg:top-20">
        <CardHeader titulo="Estado" icono={<KeyRound className="size-4" />} />
        <ul className="divide-y divide-line">
          {[
            [
              'API key de Resend',
              diagnostico?.api_key,
              'Secreto de Supabase, nunca en la base de datos.',
            ],
            ['Remitente configurado', diagnostico?.remitente, 'Con dominio verificado en Resend.'],
            ['Envío activado', config.activo, 'El interruptor de arriba.'],
          ].map(([etiqueta, ok, pista]) => (
            <li key={etiqueta as string} className="flex items-start gap-2.5 px-4 py-3">
              {ok ? (
                <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
              )}
              <span className="min-w-0">
                <span className="block text-body-sm text-fg">{etiqueta as string}</span>
                <span className="block text-body-sm text-fg-subtle">{pista as string}</span>
              </span>
            </li>
          ))}
        </ul>

        {!listo && (
          <div className="border-t border-line bg-warning-soft p-4 text-body-sm text-warning-softFg">
            <p className="flex items-start gap-2">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Todavía no se enviarán notificaciones.
                {!diagnostico?.api_key && (
                  <>
                    {' '}
                    Falta la clave: ejecuta{' '}
                    <code className="break-all font-mono">
                      supabase secrets set RESEND_API_KEY=re_...
                    </code>
                    .
                  </>
                )}
              </span>
            </p>
          </div>
        )}

        <p className="border-t border-line p-4 text-body-sm text-fg-subtle">
          La API key vive como secreto de Supabase y sólo la ve la Edge Function. Guardarla en la
          base la expondría a cualquiera que consiga leerla, y permite suplantar a la institución.
        </p>
      </Card>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Editor de plantillas
// -----------------------------------------------------------------------------
function Plantillas() {
  const qc = useQueryClient()
  const [activa, setActiva] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<{ asunto: string; cuerpo: string } | null>(null)

  const { data: plantillas, isPending } = useQuery({
    queryKey: ['correo', 'plantillas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plantillas_correo').select('*').order('codigo')
      if (error) throw error
      return (data ?? []) as PlantillaCorreoRow[]
    },
  })

  const seleccionada = plantillas?.find((p) => p.codigo === (activa ?? plantillas[0]?.codigo))

  useEffect(() => {
    if (seleccionada && !borrador) {
      setBorrador({ asunto: seleccionada.asunto, cuerpo: seleccionada.cuerpo })
    }
  }, [seleccionada, borrador])

  const guardar = useMutation({
    mutationFn: async () => {
      if (!seleccionada || !borrador) return
      const { error } = await supabase
        .from('plantillas_correo')
        .update({ asunto: borrador.asunto.trim(), cuerpo: borrador.cuerpo.trim() })
        .eq('codigo', seleccionada.codigo)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Plantilla guardada', {
        description: 'Los correos ya encolados conservan el texto con el que se generaron.',
      })
      void qc.invalidateQueries({ queryKey: ['correo', 'plantillas'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  // Variables usadas en el texto que NO están declaradas en la plantilla: se
  // renderizarían vacías, así que conviene avisar antes de guardar.
  const desconocidas = useMemo(() => {
    if (!borrador || !seleccionada) return []
    const usadas = [
      ...`${borrador.asunto} ${borrador.cuerpo}`.matchAll(/\{\{([a-z_]+)\}\}/g),
    ].map((m) => m[1])
    return [...new Set(usadas.filter((v) => !seleccionada.variables.includes(v)))]
  }, [borrador, seleccionada])

  if (isPending || !seleccionada || !borrador) return <Skeleton className="h-96" />

  function insertarVariable(v: string) {
    setBorrador((b) => (b ? { ...b, cuerpo: `${b.cuerpo}{{${v}}}` } : b))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
      <Card className="lg:sticky lg:top-20">
        <CardHeader titulo="Plantillas" />
        <ul className="divide-y divide-line">
          {plantillas?.map((p) => (
            <li key={p.codigo}>
              <button
                onClick={() => {
                  setActiva(p.codigo)
                  setBorrador({ asunto: p.asunto, cuerpo: p.cuerpo })
                }}
                className={cn(
                  'w-full px-4 py-3 text-left transition-colors duration-fast ease-out',
                  p.codigo === seleccionada.codigo
                    ? 'bg-primary-soft text-primary-softFg'
                    : 'hover:bg-surface-muted',
                )}
              >
                <span className="block text-body font-medium">{p.nombre}</span>
                <span className="mt-0.5 block text-body-sm opacity-75">{p.descripcion}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader
            titulo={seleccionada.nombre}
            descripcion={seleccionada.descripcion ?? undefined}
            acciones={
              <Badge tono={seleccionada.activa ? 'exito' : 'neutro'} punto>
                {seleccionada.activa ? 'Activa' : 'Inactiva'}
              </Badge>
            }
          />

          <div className="flex flex-col gap-4 p-4">
            <Campo etiqueta="Asunto" requerido>
              {({ id }) => (
                <Input
                  id={id}
                  value={borrador.asunto}
                  onChange={(e) => setBorrador({ ...borrador, asunto: e.target.value })}
                />
              )}
            </Campo>

            <Campo
              etiqueta="Cuerpo"
              requerido
              pista="Texto plano. Una línea en blanco separa párrafos; las líneas «Etiqueta: valor» se agrupan como ficha de datos."
            >
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  rows={16}
                  className="font-mono text-body-sm"
                  value={borrador.cuerpo}
                  onChange={(e) => setBorrador({ ...borrador, cuerpo: e.target.value })}
                />
              )}
            </Campo>

            <div>
              <p className="text-label text-fg">Variables disponibles</p>
              <p className="mt-0.5 text-body-sm text-fg-subtle">
                Pulsa una para añadirla al final del cuerpo.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {seleccionada.variables.map((v) => (
                  <button
                    key={v}
                    onClick={() => insertarVariable(v)}
                    className={cn(
                      'rounded-full bg-surface-muted px-2 py-0.5 font-mono text-body-sm text-fg-muted',
                      'transition-colors duration-fast ease-out hover:bg-primary-soft hover:text-primary-softFg',
                    )}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            {desconocidas.length > 0 && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-body-sm text-warning-softFg"
              >
                <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Estas variables no existen y saldrán vacías:{' '}
                  <span className="font-mono">{desconocidas.join(', ')}</span>
                </span>
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-line p-4">
            <Button
              onClick={() =>
                setBorrador({ asunto: seleccionada.asunto, cuerpo: seleccionada.cuerpo })
              }
            >
              Descartar cambios
            </Button>
            <Button variante="primario" cargando={guardar.isPending} onClick={() => guardar.mutate()}>
              Guardar plantilla
            </Button>
          </div>
        </Card>

        <Previsualizacion asunto={borrador.asunto} cuerpo={borrador.cuerpo} />
      </div>
    </div>
  )
}

/**
 * Vista previa con datos de muestra.
 *
 * Aplica las mismas reglas de maquetación que la Edge Function —párrafos,
 * fichas de datos, encabezados— para que lo que se ve aquí sea lo que llega.
 */
function Previsualizacion({ asunto, cuerpo }: { asunto: string; cuerpo: string }) {
  const MUESTRA: Record<string, string> = {
    destinatario: 'Dra. Rosalinda Reyes',
    folio: 'REQ-2026-0001',
    tipo: 'creación',
    estado: 'pendiente',
    decision: 'aprobada',
    actividad: 'Seminario de Investigación Aplicada II',
    codigo_actividad: 'SUB-014',
    solicitante: 'Mtro. Víctor Valdés',
    solicitante_correo: 'v.valdes@institucion.edu',
    unidad: 'Vicerrectoría Académica',
    periodo: '2026-2',
    fecha: '01/09/2026 09:30',
    justificacion:
      'Se requiere aperturar una nueva sección del seminario debido a la alta demanda registrada entre los estudiantes de término.',
    etapa: 'Vicerrectoría Administrativa y Financiera',
    revisor: 'Ing. Eduardo Soto',
    comentario: 'Revisado el impacto presupuestal. Se cubre con la carga docente disponible.',
    institucion: 'Gestión Académica',
  }

  const render = (t: string) => t.replace(/\{\{([a-z_]+)\}\}/g, (_, k: string) => MUESTRA[k] ?? '')

  const bloques = render(cuerpo)
    .trim()
    .split(/\n\s*\n/)
    .map((p) => {
      const lineas = p.split('\n').filter((l) => l.trim())
      const esDatos = lineas.length > 1 && lineas.every((l) => /^[^:]{2,40}:\s/.test(l))
      const esTitulo =
        lineas.length === 1 && lineas[0].length < 60 && !/[.:!?]$/.test(lineas[0].trim())
      return { p, lineas, esDatos, esTitulo }
    })

  return (
    <Card>
      <CardHeader titulo="Vista previa" descripcion="Con datos de ejemplo." />
      <div className="bg-sunken p-4">
        <div className="mx-auto max-w-xl overflow-hidden rounded-lg border border-line bg-white">
          <div className="bg-[#0f2f56] px-5 py-3.5">
            <span className="text-body font-bold text-white">{MUESTRA.institucion}</span>
          </div>

          <div className="px-5 py-4">
            <p className="mb-3 border-b border-[#e4e7ec] pb-3 text-body-sm text-[#5b6472]">
              <span className="font-medium text-[#111c2c]">Asunto:</span> {render(asunto)}
            </p>

            {bloques.map((b, i) =>
              b.esDatos ? (
                <table key={i} className="mb-4 border-collapse">
                  <tbody>
                    {b.lineas.map((l, j) => {
                      const corte = l.indexOf(':')
                      return (
                        <tr key={j}>
                          <td className="whitespace-nowrap pr-4 align-top text-body-sm text-[#5b6472]">
                            {l.slice(0, corte)}
                          </td>
                          <td className="py-0.5 text-body text-[#111c2c]">
                            {l.slice(corte + 1).trim()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : b.esTitulo ? (
                <p
                  key={i}
                  className="mb-2 mt-5 text-overline uppercase tracking-wider text-[#5b6472]"
                >
                  {b.p}
                </p>
              ) : (
                <p key={i} className="mb-4 whitespace-pre-line text-body leading-relaxed text-[#111c2c]">
                  {b.p}
                </p>
              ),
            )}
          </div>

          <div className="border-t border-[#e4e7ec] bg-[#f7f8fb] px-5 py-3">
            <p className="text-body-sm text-[#6b7585]">
              Este mensaje se generó automáticamente desde el portal de gestión académica. No
              respondas a esta dirección.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

// -----------------------------------------------------------------------------
// Bitácora
// -----------------------------------------------------------------------------
function Bitacora() {
  const qc = useQueryClient()

  const { data, isPending } = useQuery({
    queryKey: ['correo', 'bitacora'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('correos')
        .select('*')
        .order('creado_en', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as CorreoRow[]
    },
    refetchInterval: 30_000,
  })

  const vaciarCola = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('enviar-correo', { body: {} })
      if (error) throw new Error('No se pudo contactar con la función de envío.')
      return data as { enviados: number; fallidos: number; motivo?: string }
    },
    onSuccess: (r) => {
      toast.success(
        r.motivo ??
          (r.enviados === 0 ? 'No había nada en la cola' : `${r.enviados} correos enviados`),
        { description: r.fallidos ? `${r.fallidos} fallaron; revisa el detalle.` : undefined },
      )
      void qc.invalidateQueries({ queryKey: ['correo', 'bitacora'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const enCola = data?.filter((c) => c.estado === 'pendiente').length ?? 0

  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo="Bandeja de salida"
        descripcion="Los últimos 100 correos, con el cuerpo tal como se envió."
        icono={<Inbox className="size-4" />}
        acciones={
          <>
            {enCola > 0 && (
              <Badge tono="aviso" punto>
                {enCola} en cola
              </Badge>
            )}
            <Button
              tamano="sm"
              cargando={vaciarCola.isPending}
              onClick={() => vaciarCola.mutate()}
              iconoIzq={<RefreshCw className="size-3.5" />}
            >
              Procesar cola
            </Button>
          </>
        }
      />

      {isPending ? (
        <Skeleton className="h-64" />
      ) : !data?.length ? (
        <EmptyState
          icono={<Mail className="size-5" />}
          titulo="Todavía no se ha enviado ningún correo"
          descripcion="Aquí aparecerá cada notificación generada por el flujo de solicitudes."
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th className="w-32">Momento</Th>
              <Th className="w-56">Destinatario</Th>
              <Th>Asunto</Th>
              <Th className="w-28">Estado</Th>
              <Th className="w-16" alineado="der">
                Intentos
              </Th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <Tr key={c.id}>
                <Td className="whitespace-nowrap text-fg-muted">{fechaRelativa(c.creado_en)}</Td>
                <Td className="truncate">
                  <span className="block truncate text-fg">{c.destinatario_nombre ?? '—'}</span>
                  <span className="block truncate text-body-sm text-fg-subtle">
                    {c.destinatario}
                  </span>
                </Td>
                <Td className="max-w-0">
                  <span className="block truncate text-fg">{c.asunto}</span>
                  {c.error && (
                    <span className="block truncate text-body-sm text-danger" title={c.error}>
                      {c.error}
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge tono={ESTADO_CORREO[c.estado].tono} punto>
                    {ESTADO_CORREO[c.estado].etiqueta}
                  </Badge>
                </Td>
                <Td alineado="der" className="tabular text-fg-subtle">
                  {c.intentos}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  )
}
