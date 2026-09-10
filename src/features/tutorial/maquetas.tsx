import type { ReactNode } from 'react'
import {
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Folder,
  GraduationCap,
  Landmark,
  Lock,
  MailCheck,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Maquetas ilustradas de las pantallas reales.
 *
 * Se dibujan con los mismos tokens que la aplicación en vez de usar capturas.
 * Una captura queda desfasada en cuanto cambia un botón, no sigue la paleta
 * que el usuario haya elegido, y en tema oscuro se ve como un recorte de otra
 * aplicación. Estas maquetas heredan el tema y pueden animarse para mostrar
 * la interacción, que es justo lo que un tutorial necesita explicar.
 */

// -----------------------------------------------------------------------------
// Marco de ventana
// -----------------------------------------------------------------------------
export function Ventana({
  titulo,
  children,
  className,
}: {
  titulo: string
  children: ReactNode
  className?: string
}) {
  return (
    <figure className={cn('overflow-hidden rounded-lg border border-line bg-surface shadow-md', className)}>
      <div className="flex items-center gap-2 border-b border-line bg-sunken px-3 py-2">
        <span aria-hidden className="flex gap-1.5">
          {['bg-danger/40', 'bg-warning/40', 'bg-success/40'].map((c) => (
            <span key={c} className={cn('size-2.5 rounded-full', c)} />
          ))}
        </span>
        <figcaption className="truncate text-body-sm text-fg-subtle">{titulo}</figcaption>
      </div>
      <div className="p-4">{children}</div>
    </figure>
  )
}

/** Etiqueta numerada que señala una parte de la maqueta. */
export function Pista({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-2 text-body-sm text-fg-muted">
      <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-fg">
        {n}
      </span>
      {children}
    </span>
  )
}

// -----------------------------------------------------------------------------
// Piezas falsas, con el aspecto de las reales
// -----------------------------------------------------------------------------
const Etiqueta = ({ children }: { children: ReactNode }) => (
  <span className="mb-1 block text-label text-fg">{children}</span>
)

const Campo = ({
  etiqueta,
  valor,
  marcado,
  mono,
}: {
  etiqueta: string
  valor: string
  marcado?: boolean
  mono?: boolean
}) => (
  <div>
    <Etiqueta>{etiqueta}</Etiqueta>
    <div
      className={cn(
        'flex h-8 items-center rounded border px-2.5 text-body-sm',
        mono && 'font-mono',
        marcado
          ? 'border-primary bg-surface text-fg ring-2 ring-focus/25'
          : 'border-line bg-surface text-fg-muted',
      )}
    >
      {valor}
    </div>
  </div>
)

const Boton = ({
  children,
  primario,
  pulsando,
}: {
  children: ReactNode
  primario?: boolean
  pulsando?: boolean
}) => (
  <span
    data-motion="transform"
    className={cn(
      'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-label',
      primario ? 'bg-primary text-primary-fg' : 'border border-line bg-surface text-fg',
      // El pulso marca dónde hay que hacer clic en este paso.
      pulsando && 'motion-safe:animate-pulse ring-2 ring-focus/40',
    )}
  >
    {children}
  </span>
)

// -----------------------------------------------------------------------------
// Paso 1 · Clasificación
// -----------------------------------------------------------------------------
export function MaquetaClasificacion() {
  return (
    <Ventana titulo="rua.udes.edu.co/solicitudes/nueva">
      <p className="text-title-sm text-fg">Nueva solicitud</p>
      <p className="mt-0.5 text-body-sm text-fg-subtle">
        Propón la creación o modificación de una actividad.
      </p>

      <div className="mt-4 rounded-md border border-line">
        <div className="border-b border-line px-3 py-2 text-label text-fg">Clasificación</div>
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <Campo etiqueta="Qué solicitas" valor="Crear una actividad nueva" marcado />
          <Campo etiqueta="Prioridad" valor="Normal" />
          <div className="sm:col-span-2">
            <Campo etiqueta="Actividad principal" valor="ACT-002 · Investigación Institucional" marcado />
          </div>
        </div>
      </div>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Paso 2 · Propuesta
// -----------------------------------------------------------------------------
export function MaquetaPropuesta() {
  return (
    <Ventana titulo="rua.udes.edu.co/solicitudes/nueva">
      <div className="rounded-md border border-line">
        <div className="border-b border-line px-3 py-2 text-label text-fg">Actividad propuesta</div>
        <div className="grid gap-3 p-3 sm:grid-cols-3">
          <Campo etiqueta="Código sugerido" valor="SUB-014" mono marcado />
          <div className="sm:col-span-2">
            <Campo
              etiqueta="Nomenclatura oficial"
              valor="Seminario de Investigación Aplicada II"
              marcado
            />
          </div>
          <div className="sm:col-span-3">
            <Campo etiqueta="Actividad de apoyo asociada" valor="Preparación de material didáctico" />
          </div>
        </div>
      </div>

      <p className="mt-3 text-body-sm text-fg-subtle">
        El código es opcional: si no lo sabes, lo confirma la administración al crearla.
      </p>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Paso 3 · Justificación
// -----------------------------------------------------------------------------
export function MaquetaJustificacion() {
  return (
    <Ventana titulo="rua.udes.edu.co/solicitudes/nueva">
      <div className="rounded-md border border-line">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-label text-fg">Concepto justificativo</span>
          <span className="rounded bg-danger-soft px-1.5 py-0.5 text-overline uppercase text-danger-softFg">
            Obligatorio
          </span>
        </div>

        <div className="p-3">
          <Etiqueta>Exposición de motivos</Etiqueta>
          <div className="rounded border border-primary bg-surface p-2.5 text-body-sm leading-relaxed text-fg ring-2 ring-focus/25">
            Se requiere aperturar una nueva sección del seminario por la alta demanda
            registrada entre los estudiantes de término. La proyección de matrícula supera
            en un 40 % la capacidad actual…
          </div>

          <div className="mt-2 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full w-[78%] rounded-full bg-warning" />
            </div>
            <span className="shrink-0 tabular text-body-sm text-fg-subtle">117 / 2000</span>
          </div>
          <p className="mt-1.5 text-body-sm text-fg-subtle">
            Mínimo 150 caracteres. La barra avanza mientras escribes.
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Boton>Guardar borrador</Boton>
        <Boton primario pulsando>
          <Send className="size-3.5" />
          Enviar a revisión
        </Boton>
      </div>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Rua Tracker
// -----------------------------------------------------------------------------
export function MaquetaTracker() {
  const fases = [
    { titulo: 'Registrada', estado: 'completa' as const, icono: CheckCircle2 },
    { titulo: 'Validación', estado: 'activa' as const, icono: Clock },
    { titulo: 'Resolución', estado: 'pendiente' as const, icono: Lock },
  ]
  const PICO = '1rem'

  return (
    <Ventana titulo="rua.udes.edu.co/solicitudes/REQ-2026-0001">
      <ol className="flex overflow-hidden rounded-md">
        {fases.map((f, i) => {
          const primera = i === 0
          const ultima = i === fases.length - 1
          const clip = primera
            ? `polygon(0 0, calc(100% - ${PICO}) 0, 100% 50%, calc(100% - ${PICO}) 100%, 0 100%)`
            : ultima
              ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${PICO} 50%)`
              : `polygon(0 0, calc(100% - ${PICO}) 0, 100% 50%, calc(100% - ${PICO}) 100%, 0 100%, ${PICO} 50%)`

          return (
            <li
              key={f.titulo}
              style={{
                clipPath: clip,
                marginLeft: primera ? 0 : `-${PICO}`,
                paddingLeft: primera ? 0 : PICO,
              }}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-3',
                f.estado === 'completa' && 'bg-primary text-primary-fg',
                f.estado === 'activa' && 'bg-accent text-accent-fg',
                f.estado === 'pendiente' && 'bg-surface-muted text-fg-subtle',
              )}
            >
              {f.estado === 'activa' && (
                <span aria-hidden className="absolute inset-0 bg-white/15 motion-safe:animate-pulse" />
              )}
              <span className="relative flex items-center gap-1.5">
                <f.icono className="size-3.5" />
                <span className="text-overline uppercase">{f.titulo}</span>
              </span>
            </li>
          )
        })}
      </ol>

      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          ['Financiera', 'Aprobada · ayer', 'exito'],
          ['Auditoría', 'En espera de firma', 'activa'],
          ['Creación en plataforma', 'Bloqueada', 'espera'],
        ].map(([nombre, estado, tono]) => (
          <li
            key={nombre}
            className={cn(
              'rounded-md border p-2.5',
              tono === 'exito' && 'border-line bg-surface',
              tono === 'activa' && 'border-accent bg-accent-soft',
              tono === 'espera' && 'border-dashed border-line bg-surface-muted/40',
            )}
          >
            <span className="block text-overline uppercase text-fg-muted">{nombre}</span>
            <span
              className={cn(
                'mt-0.5 block text-body-sm',
                tono === 'activa' ? 'text-accent-softFg' : 'text-fg',
              )}
            >
              {estado}
            </span>
          </li>
        ))}
      </ul>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Vista del revisor
// -----------------------------------------------------------------------------
export function MaquetaRevision() {
  return (
    <Ventana titulo="Expediente REQ-2026-0001">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-body-sm text-fg-muted">REQ-2026-0001</span>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-overline uppercase text-primary-softFg">
          Crear
        </span>
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-overline uppercase text-warning-softFg">
          Pendiente
        </span>
      </div>
      <p className="mt-1.5 text-title-sm text-fg">Seminario de Investigación Aplicada II</p>

      <div className="mt-3 rounded-md border border-line p-3">
        <span className="text-overline uppercase text-fg-subtle">
          Actividad y subactividades afectadas
        </span>
        <ul className="mt-2 flex flex-col gap-1">
          <li className="flex items-center gap-2 rounded bg-primary-soft px-2 py-1 text-body-sm text-primary-softFg">
            <Folder className="size-3.5" />
            <span className="font-mono">ACT-002</span>
            <span className="truncate">Investigación Institucional</span>
          </li>
          <li className="ml-5 flex items-center gap-2 px-2 py-1 text-body-sm text-fg-muted">
            <FileText className="size-3.5" />
            <span className="font-mono">SUB-002A</span>
            <span className="truncate">Recolección de Datos de Campo</span>
          </li>
        </ul>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <Etiqueta>Justificación de Auditoría *</Etiqueta>
          <span className="tabular text-body-sm text-success">34 / 20 mín.</span>
        </div>
        <div className="rounded border border-line bg-surface p-2.5 text-body-sm text-fg">
          Cumple la normativa vigente. Se aprueba.
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Boton>Denegar</Boton>
        <Boton primario pulsando>
          <Check className="size-3.5" />
          Aprobar etapa
        </Boton>
      </div>

      <p className="mt-2 text-body-sm text-fg-subtle">
        Sin justificación, los dos botones están desactivados. Se pide también al aprobar.
      </p>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Diagrama del flujo
// -----------------------------------------------------------------------------
const ETAPAS = [
  {
    icono: Building2,
    titulo: 'La oficina solicita',
    detalle: 'Vicerrectorías, Bienestar Institucional, Coordinación Académica',
    tono: 'inicio' as const,
  },
  {
    icono: Landmark,
    titulo: 'Valida lo financiero',
    detalle: 'Vicerrectoría Administrativa y Financiera revisa el impacto presupuestal',
    tono: 'validacion' as const,
  },
  {
    icono: ShieldCheck,
    titulo: 'Valida lo normativo',
    detalle: 'Auditoría verifica el cumplimiento y la trazabilidad del expediente',
    tono: 'validacion' as const,
  },
  {
    icono: Sparkles,
    titulo: 'Se crea la actividad',
    detalle: 'La administración firma y la actividad nace en la estructura maestra',
    tono: 'final' as const,
  },
]

export function DiagramaFlujo() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ETAPAS.map((e, i) => (
        <li key={e.titulo} className="relative">
          {/* Conector: sólo entre tarjetas, y sólo cuando van en fila */}
          {i < ETAPAS.length - 1 && (
            <span
              aria-hidden
              className="absolute -right-3 top-8 hidden h-px w-3 bg-line-strong lg:block"
            />
          )}

          <div
            className={cn(
              'flex h-full flex-col gap-2 rounded-lg border p-4',
              e.tono === 'inicio' && 'border-line bg-surface',
              e.tono === 'validacion' && 'border-line bg-surface',
              e.tono === 'final' && 'border-primary/40 bg-primary-soft',
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-body-sm font-bold',
                  e.tono === 'final'
                    ? 'bg-primary text-primary-fg'
                    : 'bg-primary-soft text-primary-softFg',
                )}
              >
                {i + 1}
              </span>
              <e.icono
                aria-hidden
                className={cn(
                  'size-4',
                  e.tono === 'final' ? 'text-primary-softFg' : 'text-fg-subtle',
                )}
              />
            </span>

            <span
              className={cn(
                'text-body font-medium',
                e.tono === 'final' ? 'text-primary-softFg' : 'text-fg',
              )}
            >
              {e.titulo}
            </span>
            <span
              className={cn(
                'text-body-sm leading-relaxed',
                e.tono === 'final' ? 'text-primary-softFg/85' : 'text-fg-muted',
              )}
            >
              {e.detalle}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

// -----------------------------------------------------------------------------
// Qué ve cada oficina
// -----------------------------------------------------------------------------
export function TablaOficinas() {
  const filas = [
    ['Vicerrectorías y Bienestar Institucional', 'Presentan solicitudes y siguen las suyas', ClipboardList],
    ['Vicerrectoría Administrativa y Financiera', 'Firma la validación presupuestal', Landmark],
    ['Auditoría', 'Firma la validación normativa', ShieldCheck],
    ['Administración de la plataforma', 'Crea la actividad y configura el flujo', Sparkles],
  ] as const

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {filas.map(([oficina, funcion, Icono]) => (
        <li key={oficina} className="flex items-start gap-3 bg-surface p-4">
          <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <div className="min-w-0">
            <p className="text-body font-medium text-fg">{oficina}</p>
            <p className="mt-0.5 text-body-sm text-fg-muted">{funcion}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

// -----------------------------------------------------------------------------
// Rankings · las plantillas prediseñadas
//
// Se dibujan las cabeceras REALES de los dos archivos, con su grafía original en
// inglés. No es un detalle estético: quien abre el tutorial suele tener la
// plantilla delante, y lo que necesita es reconocerla, no leer una versión
// bonita de ella.
// -----------------------------------------------------------------------------
const Sello = ({
  children,
  tono = 'neutro',
}: {
  children: ReactNode
  tono?: 'neutro' | 'exito' | 'primario' | 'aviso' | 'peligro'
}) => (
  <span
    className={cn(
      'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-overline uppercase ring-1 ring-inset',
      {
        neutro: 'bg-surface-muted text-fg-muted ring-line',
        exito: 'bg-success-soft text-success-softFg ring-success/25',
        primario: 'bg-primary-soft text-primary-softFg ring-primary/20',
        aviso: 'bg-warning-soft text-warning-softFg ring-warning/25',
        peligro: 'bg-danger-soft text-danger-softFg ring-danger/25',
      }[tono],
    )}
  >
    {children}
  </span>
)

const PLANTILLAS_TUTORIAL = [
  {
    icono: GraduationCap,
    nombre: 'Contactos académicos',
    archivo: 'academic_template_V3.xlsx',
    columnas: [
      'Source',
      'Title',
      'First Name',
      'Last Name',
      'Job Title',
      'Department',
      'Institution',
      'Country or Territory',
      'Email',
      'Subject',
      'Phone (Optional)',
    ],
  },
  {
    icono: Briefcase,
    nombre: 'Contactos de empleadores',
    archivo: 'employer_template_2024_V1.xlsx',
    columnas: [
      'Source',
      'Title',
      'First Name',
      'Last Name',
      'Position',
      'Industry',
      'Company Name',
      'Country or Territory',
      'Email',
      'Phone (Optional)',
    ],
  },
]

export function MaquetaPlantillas() {
  return (
    <Ventana titulo="Internacionalización → Importar Contactos">
      <div className="grid gap-3 sm:grid-cols-2">
        {PLANTILLAS_TUTORIAL.map((p, i) => {
          const Icono = p.icono
          return (
            <div
              key={p.nombre}
              className={cn(
                'rounded-lg border p-3',
                // La primera va resaltada: en la pantalla real siempre hay una
                // elegida, y una maqueta con las dos apagadas no enseña eso.
                i === 0 ? 'border-primary bg-primary-soft' : 'border-line bg-surface',
              )}
            >
              <p className="flex items-center gap-2">
                <Icono
                  aria-hidden
                  className={cn('size-4', i === 0 ? 'text-primary-softFg' : 'text-fg-subtle')}
                />
                <span className={cn('text-label', i === 0 ? 'text-primary-softFg' : 'text-fg')}>
                  {p.nombre}
                </span>
              </p>

              <p className="mt-2 flex flex-wrap gap-1">
                {p.columnas.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-muted ring-1 ring-inset ring-line"
                  >
                    {c}
                  </span>
                ))}
              </p>

              <p className="mt-2.5 truncate font-mono text-[10px] text-fg-subtle">{p.archivo}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Boton primario pulsando>
          <Download className="size-3.5" />
          Descargar plantilla .xlsx
        </Boton>
        <span className="text-body-sm text-fg-subtle">
          La primera hoja es la plantilla tal cual; la segunda, las instrucciones.
        </span>
      </div>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Rankings · la previsualización
//
// Cuatro filas elegidas para que se vean los cuatro desenlaces posibles. Es lo
// que de verdad hay que entender antes de pulsar «Importar»: que nada se escribe
// sin haberlo enseñado antes.
// -----------------------------------------------------------------------------
const FILAS_PREVISUALIZACION: {
  linea: number
  nombre: string
  correo: string
  sello: string
  tono: 'exito' | 'primario' | 'neutro' | 'peligro'
  mensaje: string
}[] = [
  {
    linea: 12,
    nombre: 'María Fernanda Ruiz',
    correo: 'mf.ruiz@universidad.mx',
    sello: 'Crear',
    tono: 'exito',
    mensaje: 'Se creará.',
  },
  {
    linea: 13,
    nombre: 'John Carter',
    correo: 'j.carter@stateuniv.edu',
    sello: 'Actualizar',
    tono: 'primario',
    mensaje: 'Se actualizará el contacto existente.',
  },
  {
    linea: 14,
    nombre: 'Li Wei',
    correo: 'li.wei@tsinghua.cn',
    sello: 'Se conserva',
    tono: 'neutro',
    mensaje: 'Ya está en la libreta como contacto académico. No se tocará.',
  },
  {
    linea: 15,
    nombre: '—',
    correo: 'sin.arroba.example',
    sello: 'Error',
    tono: 'peligro',
    mensaje: 'El correo no tiene arroba.',
  },
]

export function MaquetaPrevisualizacion() {
  return (
    <Ventana titulo="Previsualización · nada se ha escrito todavía">
      <div className="flex flex-wrap gap-1.5">
        <Sello tono="primario">Contactos de empleadores</Sello>
        <Sello tono="exito">248 se crean</Sello>
        <Sello tono="primario">31 se actualizan</Sello>
        <Sello tono="neutro">6 de la otra lista</Sello>
        <Sello tono="peligro">3 con error</Sello>
      </div>

      <div className="mt-3 rounded-md bg-primary-soft px-3 py-2 text-body-sm text-primary-softFg">
        Se añadirán <strong>4 valores nuevos</strong> al catálogo: Banking, Manufacturing,
        Consulting, Logistics.
      </div>

      <ul className="mt-3 divide-y divide-line">
        {FILAS_PREVISUALIZACION.map((f) => (
          <li key={f.linea} className="flex items-start gap-3 py-2">
            <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-[11px] text-fg-subtle">
              {f.linea}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm text-fg">{f.nombre}</span>
              <span className="block truncate font-mono text-[11px] text-fg-subtle">
                {f.correo}
              </span>
            </span>
            <span className="shrink-0">
              <Sello tono={f.tono}>{f.sello}</Sello>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 border-t border-line pt-2 text-body-sm text-fg-subtle">
        Cada fila lleva su diagnóstico al lado: qué se corrige, qué se clasifica solo y qué hay
        que arreglar antes.
      </p>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Rankings · el veredicto de los correos
// -----------------------------------------------------------------------------
const VEREDICTOS: {
  correo: string
  sello: string
  tono: 'exito' | 'aviso' | 'peligro'
  mensaje: string
}[] = [
  {
    correo: 'mf.ruiz@universidad.mx',
    sello: 'Válido',
    tono: 'exito',
    mensaje: 'El buzón existe y acepta correo.',
  },
  {
    correo: 'info@empresa.com',
    sello: 'Riesgoso',
    tono: 'aviso',
    mensaje: 'Acepta correo, pero es genérico: llega a una oficina, no a una persona.',
  },
  {
    correo: 'j.perez@dominio-viejo.edu',
    sello: 'Inválido',
    tono: 'peligro',
    mensaje: 'El dominio no tiene servidor de correo: nada de lo que se envíe llegará.',
  },
]

export function MaquetaVerificacion() {
  return (
    <Ventana titulo="Internacionalización → Verificación de Correos">
      <div className="flex items-center gap-2">
        <Boton primario pulsando>
          <MailCheck className="size-3.5" />
          Verificar 200
        </Boton>
        <span className="text-body-sm text-fg-subtle">Va a un correo por segundo.</span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {VEREDICTOS.map((v) => (
          <li key={v.correo} className="rounded-md border border-line bg-surface p-2.5">
            <p className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-fg-muted">
                {v.correo}
              </span>
              <Sello tono={v.tono}>{v.sello}</Sello>
            </p>
            <p className="mt-1 text-body-sm text-fg-subtle">{v.mensaje}</p>
          </li>
        ))}
      </ul>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Compartir · la ficha mínima
//
// Qué datos hacen falta para reportar UN contacto sin plantilla ninguna. Se
// distingue lo obligatorio de lo que ayuda, porque la duda de quien va a
// escribir el correo es exactamente ésa: «¿y si no sé el teléfono?».
// -----------------------------------------------------------------------------
const FICHA_MINIMA: { campo: string; ejemplo: string; obligatorio: boolean }[] = [
  { campo: 'Nombre y apellidos', ejemplo: 'María Fernanda Ruiz Gómez', obligatorio: true },
  { campo: 'Cargo', ejemplo: 'Directora de Relaciones Internacionales', obligatorio: true },
  { campo: 'Correo', ejemplo: 'mf.ruiz@universidad.mx', obligatorio: true },
  { campo: 'País', ejemplo: 'México', obligatorio: false },
  { campo: 'Institución o empresa', ejemplo: 'Universidad Nacional Autónoma de México', obligatorio: false },
  { campo: 'De dónde salió', ejemplo: 'Congreso de Ingeniería, mayo 2026', obligatorio: false },
]

export function MaquetaFichaMinima() {
  return (
    <Ventana titulo="Un contacto suelto · lo mínimo que hace falta">
      <ul className="flex flex-col gap-2">
        {FICHA_MINIMA.map((f) => (
          <li key={f.campo} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="flex w-44 shrink-0 items-center gap-1.5">
              <span className="text-body-sm text-fg">{f.campo}</span>
              {f.obligatorio ? (
                <span aria-label="obligatorio" className="text-danger">
                  *
                </span>
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate rounded border border-line bg-surface px-2 py-1 text-body-sm text-fg-muted">
              {f.ejemplo}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-line pt-2.5 text-body-sm text-fg-subtle">
        <span className="text-danger">*</span> Sin estos tres no se puede guardar el contacto. Lo
        demás se completa después.
      </p>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Compartir · la hoja rellena
//
// Se dibuja con aspecto de hoja de cálculo —letras de columna, celda activa— y
// no de tabla del portal, porque eso es lo que quien lee va a tener delante
// cuando la rellene.
// -----------------------------------------------------------------------------
const COLUMNAS_HOJA = ['First Name', 'Last Name', 'Position', 'Company Name', 'Email']

const FILAS_HOJA = [
  ['Laura', 'Restrepo Díaz', 'Gerente de Talento Humano', 'Tecnologías Andinas', 'l.restrepo@tecandinas.com'],
  ['Peter', 'Novak', 'Head of Recruitment', 'Nordic Systems AB', 'p.novak@nordicsys.se'],
  ['Amina', 'Okoro', 'Operations Director', 'Lagos Logistics Ltd', 'a.okoro@lagoslog.ng'],
]

export function MaquetaHojaRellena() {
  return (
    <Ventana titulo="employer_template_2024_V1.xlsx · Excel">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr>
              <th className="w-7 border border-line bg-sunken px-1 py-1 text-center text-[10px] text-fg-subtle">
                {' '}
              </th>
              {COLUMNAS_HOJA.map((c, i) => (
                <th
                  key={c}
                  className="border border-line bg-sunken px-2 py-1 text-[10px] font-normal text-fg-subtle"
                >
                  {String.fromCharCode(65 + i)}
                </th>
              ))}
              <th className="w-10 border border-line bg-sunken px-1 py-1 text-center text-[10px] text-fg-subtle">
                …
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-line bg-sunken px-1 py-1 text-center text-[10px] text-fg-subtle">
                1
              </td>
              {COLUMNAS_HOJA.map((c) => (
                <td
                  key={c}
                  className="whitespace-nowrap border border-line bg-primary-soft px-2 py-1 font-mono text-[11px] font-semibold text-primary-softFg"
                >
                  {c}
                </td>
              ))}
              <td className="border border-line bg-primary-soft px-1 py-1 text-center text-[11px] text-primary-softFg">
                …
              </td>
            </tr>

            {FILAS_HOJA.map((fila, f) => (
              <tr key={fila[4]}>
                <td className="border border-line bg-sunken px-1 py-1 text-center text-[10px] text-fg-subtle">
                  {f + 2}
                </td>
                {fila.map((celda, c) => (
                  <td
                    key={celda}
                    className={cn(
                      'max-w-[10rem] truncate border px-2 py-1 text-[11px]',
                      // Una celda en edición: es lo que hace que se lea como una
                      // hoja de cálculo y no como una tabla ya terminada.
                      f === 2 && c === 2
                        ? 'border-primary bg-surface text-fg ring-1 ring-focus/40'
                        : 'border-line bg-surface text-fg-muted',
                    )}
                  >
                    {celda}
                  </td>
                ))}
                <td className="border border-line bg-surface px-1 py-1 text-center text-[11px] text-fg-subtle">
                  …
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-body-sm text-fg-subtle">
        Añade una fila por contacto, debajo de la cabecera. Las columnas que no sepas se dejan en
        blanco: sólo el nombre, el cargo y el correo son imprescindibles.
      </p>
    </Ventana>
  )
}

// -----------------------------------------------------------------------------
// Compartir · corregir lo que ya está
//
// El «antes y después» es la única forma de explicar esto sin ambigüedad: qué
// campo manda la hoja nueva, cuál se conserva y por qué una celda vacía no borra.
// -----------------------------------------------------------------------------
const CAMBIOS: { campo: string; antes: string; despues: string; nota: string }[] = [
  {
    campo: 'Cargo',
    antes: 'Coordinadora de Convenios',
    despues: 'Directora de Relaciones Internacionales',
    nota: 'lo manda la hoja nueva',
  },
  {
    campo: 'Company Name',
    antes: 'Universidad del Norte',
    despues: 'Universidad del Norte',
    nota: 'la celda venía vacía: se conserva',
  },
  {
    campo: 'Teléfono',
    antes: '+52 55 1234 5678',
    despues: '+52 55 1234 5678',
    nota: 'la celda venía vacía: se conserva',
  },
]

export function MaquetaActualizar() {
  return (
    <Ventana titulo="Mismo correo · el contacto se actualiza, no se duplica">
      <p className="flex flex-wrap items-center gap-2 rounded-md bg-surface-muted px-2.5 py-2">
        <span className="text-body-sm text-fg-subtle">La llave:</span>
        <span className="font-mono text-[11px] text-fg">mf.ruiz@universidad.mx</span>
        <Sello tono="primario">Actualizar</Sello>
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {CAMBIOS.map((c) => {
          const cambia = c.antes !== c.despues
          return (
            <li key={c.campo} className="rounded-md border border-line bg-surface p-2.5">
              <p className="text-body-sm text-fg">{c.campo}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span
                  className={cn(
                    'truncate rounded px-1.5 py-0.5',
                    cambia
                      ? 'bg-danger-soft text-danger-softFg line-through'
                      : 'bg-surface-muted text-fg-subtle',
                  )}
                >
                  {c.antes}
                </span>
                <ArrowRight aria-hidden className="size-3 shrink-0 text-fg-subtle" />
                <span
                  className={cn(
                    'truncate rounded px-1.5 py-0.5',
                    cambia ? 'bg-success-soft text-success-softFg' : 'bg-surface-muted text-fg-muted',
                  )}
                >
                  {c.despues}
                </span>
              </p>
              <p className="mt-1 text-body-sm text-fg-subtle">{c.nota}</p>
            </li>
          )
        })}
      </ul>
    </Ventana>
  )
}
