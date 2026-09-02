import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Compass,
  Layers,
  LogIn,
  Mail,
  Network,
  Sprout,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Marca } from '@/components/layout/Marca'
import { LinkButton } from '@/components/ui/LinkButton'
import { Card } from '@/components/ui/primitives'
import { Revelar } from './Revelar'
import {
  DiagramaFlujo,
  MaquetaClasificacion,
  MaquetaJustificacion,
  MaquetaPropuesta,
  MaquetaRevision,
  MaquetaTracker,
  Pista,
  TablaOficinas,
} from './maquetas'

const SECCIONES = [
  { id: 'iniciativa', titulo: 'La iniciativa' },
  { id: 'nombre', titulo: 'Por qué RUA' },
  { id: 'oficinas', titulo: 'Quién hace qué' },
  { id: 'solicitud', titulo: 'Cómo se solicita' },
  { id: 'flujo', titulo: 'El flujo de aprobación' },
  { id: 'seguimiento', titulo: 'Rua Tracker' },
  { id: 'axioma', titulo: 'Axioma AI' },
] as const

export function TutorialPage() {
  const [activa, setActiva] = useState<string>(SECCIONES[0].id)

  // Índice lateral que sigue a la lectura. Se marca la última sección que
  // cruzó el tercio superior: es donde está mirando quien lee.
  useEffect(() => {
    const observador = new IntersectionObserver(
      (entradas) => {
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiva(visible.target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )

    SECCIONES.forEach((s) => {
      const nodo = document.getElementById(s.id)
      if (nodo) observador.observe(nodo)
    })
    return () => observador.disconnect()
  }, [])

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Cabecera translúcida: el contenido pasa por debajo. */}
      <header className="material-chrome sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex h-topbar max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Marca />
          <LinkButton
            to="/entrar"
            variante="primario"
            tamano="sm"
            className="ml-auto"
            iconoIzq={<LogIn className="size-4" />}
          >
            Entrar
          </LinkButton>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Portada                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-line bg-[#001730]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'radial-gradient(60rem 40rem at 12% 5%, #1b3f78 0%, transparent 60%),' +
              'radial-gradient(45rem 35rem at 88% 90%, #7a3410 0%, transparent 55%),' +
              'radial-gradient(35rem 30rem at 70% 15%, #123a6b 0%, transparent 60%)',
          }}
        />
        {/* Retícula: textura y, de paso, la idea de territorio parcelado. */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px),' +
              'linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '52px 52px',
          }}
        />

        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <Revelar>
            <p className="text-overline uppercase tracking-widest text-white/50">
              Oficina de Inteligencia de Negocios · Universidad de Santander
            </p>
          </Revelar>

          <Revelar retraso={80}>
            <h1 className="mt-4 max-w-3xl text-balance text-[2.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-[3.5rem]">
              RUA es el territorio digital donde la universidad decide.
            </h1>
          </Revelar>

          <Revelar retraso={160}>
            <p className="mt-5 max-w-2xl text-pretty text-body-lg leading-relaxed text-white/70">
              Un solo lugar para registrar, validar y medir las actividades de todas las
              facultades y dependencias. Este recorrido explica cómo funciona y, sobre todo,
              cómo se presenta una solicitud.
            </p>
          </Revelar>

          <Revelar retraso={240}>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#solicitud"
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 text-label text-[#001730]',
                  'transition-transform duration-press ease-out active:scale-[0.97]',
                )}
                data-motion="transform"
              >
                Ver cómo se solicita
                <ArrowRight className="size-4" />
              </a>
              <a
                href="#nombre"
                className={cn(
                  'inline-flex h-11 items-center rounded-md border border-white/25 px-5 text-label text-white',
                  'transition-[background-color,transform] duration-press ease-out',
                  'hover:bg-white/10 active:scale-[0.97]',
                )}
                data-motion="transform"
              >
                Por qué se llama RUA
              </a>
            </div>
          </Revelar>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Índice */}
        <nav aria-label="Secciones" className="hidden lg:block">
          <ol className="sticky top-24 flex flex-col gap-0.5 border-l border-line">
            {SECCIONES.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={activa === s.id ? 'true' : undefined}
                  className={cn(
                    '-ml-px block border-l-2 py-1.5 pl-4 text-body-sm',
                    'transition-[color,border-color] duration-fast ease-out',
                    activa === s.id
                      ? 'border-primary font-medium text-primary'
                      : 'border-transparent text-fg-subtle hover:text-fg',
                  )}
                >
                  {s.titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="flex min-w-0 flex-col gap-16">
          {/* =========================== La iniciativa =================== */}
          <Seccion
            id="iniciativa"
            sobretitulo="La iniciativa"
            titulo="Por qué existe esta herramienta"
          >
            <Parrafo>
              Desde la Oficina de Inteligencia de Negocios tomamos la iniciativa de construir
              RUA con un propósito concreto: <Fuerte>optimizar la gestión de las solicitudes
              de actividades</Fuerte> y, sobre esa base ordenada, levantar un motor de
              decisiones avanzado.
            </Parrafo>

            <Parrafo>
              El problema no era la falta de datos. Era su dispersión. Cada facultad y cada
              dependencia registraba sus actividades a su manera, en formatos distintos, y la
              consolidación llegaba tarde y a mano. Cuando la información sobre lo que hace la
              universidad vive en veinte hojas de cálculo, no se puede planear: sólo se puede
              reconstruir el pasado.
            </Parrafo>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [Layers, 'Una sola fuente', 'Todas las actividades en un mismo registro, con la misma nomenclatura y los mismos códigos.'],
                [Network, 'Trazabilidad completa', 'Cada solicitud deja constancia de quién la pidió, quién la validó y con qué argumento.'],
                [Target, 'Datos que sirven', 'Información estructurada desde el origen, no depurada a posteriori.'],
              ].map(([Icono, titulo, texto], i) => (
                <Revelar key={titulo as string} retraso={i * 70}>
                  <Card className="h-full p-4">
                    <Icono aria-hidden className="size-5 text-primary" />
                    <p className="mt-2.5 text-body font-medium text-fg">{titulo as string}</p>
                    <p className="mt-1 text-body-sm leading-relaxed text-fg-muted">
                      {texto as string}
                    </p>
                  </Card>
                </Revelar>
              ))}
            </div>

            <Parrafo>
              Esta plataforma contribuye a consolidar a la UDES como referente en innovación
              educativa y en la toma de decisiones inteligentes basadas en datos. No por tener
              más tableros, sino por tener un registro del que se pueda fiar quien decide.
            </Parrafo>
          </Seccion>

          {/* =========================== Por qué RUA ===================== */}
          <Seccion id="nombre" sobretitulo="El nombre" titulo="Por qué RUA">
            <Parrafo>
              El nombre funciona en dos planos, y los dos importan.
            </Parrafo>

            <Revelar>
              <Card className="border-primary/30 bg-primary-soft p-5">
                <p className="text-overline uppercase tracking-wider text-primary-softFg/70">
                  En lo técnico
                </p>
                <p className="mt-1.5 text-title-sm text-primary-softFg">
                  Registro Unificado de Actividades
                </p>
                <p className="mt-2 text-body leading-relaxed text-primary-softFg/85">
                  También leído como <Fuerte>Red Universitaria de Analítica</Fuerte>: la
                  descripción exacta de lo que hace el sistema.
                </p>
              </Card>
            </Revelar>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                [
                  'Visión de conjunto',
                  'En lugar de información fragmentada por facultades, RUA concentra el dato. La Oficina de Planeación ve el ecosistema completo de la UDES, no veinte fotografías parciales.',
                ],
                [
                  'De reactivo a anticipatorio',
                  'Decidir bien no es sólo medir lo que ya ocurrió. Con el registro ordenado se pueden optimizar recursos, prever cuellos de botella y alinear la ejecución diaria con los macroproyectos.',
                ],
                [
                  'Sinergia institucional',
                  'Al centralizar las actividades afloran las duplicidades de esfuerzo, y el registro conecta con los indicadores de calidad que alimentan reportes críticos como SNIES o HECAA.',
                ],
              ].map(([titulo, texto], i) => (
                <Revelar key={titulo} retraso={i * 70}>
                  <Card className="h-full p-4">
                    <p className="text-body font-medium text-fg">{titulo}</p>
                    <p className="mt-1.5 text-body-sm leading-relaxed text-fg-muted">{texto}</p>
                  </Card>
                </Revelar>
              ))}
            </div>

            {/* --- La raíz --- */}
            <Revelar>
              <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-6 sm:p-8">
                <Sprout
                  aria-hidden
                  className="pointer-events-none absolute -right-6 -top-6 size-32 text-primary/[0.06]"
                />

                <p className="relative text-overline uppercase tracking-wider text-fg-subtle">
                  En lo profundo
                </p>
                <p className="relative mt-2 text-balance text-title-lg text-fg">
                  En lengua Emberá Chamí, <Fuerte>rúa</Fuerte> significa territorio, tierra.
                </p>

                <div className="relative mt-5 flex flex-col gap-4 text-body leading-relaxed text-fg-muted">
                  <p>
                    Un territorio no es un espacio vacío: es donde una comunidad se asienta,
                    siembra y decide. Eso es exactamente lo que queremos que sea este sistema
                    para la Universidad de Santander — <Fuerte>la tierra firme donde se
                    consolidan las actividades de todas las facultades y dependencias</Fuerte>,
                    y desde donde se proyecta hacia dónde va la institución.
                  </p>
                  <p>
                    La misma raíz aparece en el quechua <Fuerte>ruway</Fuerte>: hacer, crear,
                    construir. Y en esa cosmovisión no se actúa <em>contra</em> el entorno sino
                    en armonía con él. Aplicado a la planeación, significa leer los ciclos
                    académicos y administrativos de la UDES para tomar decisiones sostenibles,
                    que no desgasten los recursos —espacios, presupuesto, talento— sino que los
                    potencien.
                  </p>
                  <p>
                    Y hay una tercera imagen que nos parece la más precisa: las actividades no
                    son entes aislados, son hilos. RUA es el telar donde se teje el trabajo de
                    estudiantes, docentes y directivos. La inteligencia de negocios aquí no es
                    fría: es entender cómo el movimiento de una parte de la universidad alcanza
                    a toda la comunidad.
                  </p>
                </div>

                <blockquote className="relative mt-6 border-l-2 border-primary pl-4 text-body-lg leading-relaxed text-fg">
                  No construimos sólo un Registro Unificado de Actividades. Construimos RUA
                  —territorio— y eso es precisamente lo que es: el nuevo territorio digital
                  donde se unifica, se mide y se proyecta el futuro de la UDES.
                </blockquote>
              </div>
            </Revelar>
          </Seccion>

          {/* =========================== Oficinas ======================== */}
          <Seccion
            id="oficinas"
            sobretitulo="Los participantes"
            titulo="Quién hace qué"
          >
            <Parrafo>
              RUA no reparte el trabajo por jerarquía sino por <Fuerte>función</Fuerte>. Cada
              oficina ve exactamente lo que le toca hacer, y nada más.
            </Parrafo>

            <Revelar>
              <TablaOficinas />
            </Revelar>

            <Parrafo>
              Las <Fuerte>vicerrectorías y Bienestar Institucional</Fuerte> son quienes
              presentan las solicitudes: conocen la actividad que hay que crear y por qué hace
              falta. No aprueban su propia petición — eso lo hacen las oficinas de validación,
              y es la razón de que el registro tenga valor como evidencia.
            </Parrafo>
          </Seccion>

          {/* =========================== La solicitud ==================== */}
          <Seccion
            id="solicitud"
            sobretitulo="Lo esencial"
            titulo="Cómo se presenta una solicitud"
          >
            <Parrafo>
              Son tres pasos en una sola pantalla, en{' '}
              <Codigo>Solicitudes → Nueva solicitud</Codigo>. No hay que rellenar nada dos
              veces ni saberse los códigos de memoria.
            </Parrafo>

            <Paso
              n={1}
              titulo="Di qué necesitas y dónde encaja"
              pistas={[
                'Elige si vas a crear una actividad nueva, modificar una existente o darla de baja. Los campos siguientes cambian según lo que elijas.',
                'Selecciona la actividad principal: el pilar estratégico del que colgará tu petición.',
              ]}
            >
              <MaquetaClasificacion />
            </Paso>

            <Paso
              n={2}
              titulo="Describe la actividad propuesta"
              pistas={[
                'La nomenclatura oficial es el nombre con el que la actividad quedará registrada. Escríbelo como debe aparecer en los reportes.',
                'El código es opcional. Si no lo sabes, la administración lo asigna al crearla.',
              ]}
            >
              <MaquetaPropuesta />
            </Paso>

            <Paso
              n={3}
              titulo="Justifica por qué hace falta"
              pistas={[
                'Es el campo que de verdad decide. Lo leen las oficinas de validación, y una descripción genérica es la causa más común de que una solicitud se deniegue.',
                'Se piden 150 caracteres como mínimo. Menciona el impacto esperado, los recursos necesarios y, si requiere presupuesto adicional, dilo de forma explícita.',
                'Puedes guardar un borrador y volver más tarde. Sólo al enviar entra en el flujo.',
              ]}
            >
              <MaquetaJustificacion />
            </Paso>

            <Revelar>
              <Card className="flex items-start gap-3 border-warning/30 bg-warning-soft p-4">
                <Compass aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-softFg" />
                <p className="text-body-sm leading-relaxed text-warning-softFg">
                  <Fuerte>Un borrador se puede editar; una solicitud enviada, no.</Fuerte> Si
                  necesitas corregir algo después de enviarla, la oficina de validación puede
                  denegarla con un comentario para que la presentes de nuevo — así queda
                  constancia de por qué cambió.
                </p>
              </Card>
            </Revelar>
          </Seccion>

          {/* =========================== El flujo ======================== */}
          <Seccion
            id="flujo"
            sobretitulo="Qué pasa después"
            titulo="El flujo de aprobación"
          >
            <Parrafo>
              Al enviar, la solicitud entra en una cadena de firmas. Cada eslabón se desbloquea
              sólo cuando el anterior firma, y <Fuerte>toda decisión lleva justificación
              escrita, también las aprobaciones</Fuerte>: un expediente aprobado sin motivo
              registrado no se puede auditar después.
            </Parrafo>

            <Revelar>
              <DiagramaFlujo />
            </Revelar>

            <Parrafo>
              La última etapa es distinta a las demás: al firmarla, la actividad{' '}
              <Fuerte>se crea de verdad</Fuerte> en la estructura maestra. Aprobar y ejecutar
              son el mismo acto, así que no existe el hueco de «está aprobada pero nadie la ha
              dado de alta».
            </Parrafo>

            <Paso
              n={4}
              titulo="Así la ve quien valida"
              pistas={[
                'Antes de decidir se ve el expediente completo: qué se pide, sobre qué actividad y qué cuelga de ella.',
                'Los botones de aprobar y denegar están desactivados hasta escribir la justificación.',
                'Nadie puede firmar su propia solicitud, aunque tenga el permiso.',
              ]}
            >
              <MaquetaRevision />
            </Paso>

            <Revelar>
              <Card className="flex items-start gap-3 p-4">
                <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                <p className="text-body-sm leading-relaxed text-fg-muted">
                  Cada movimiento genera un correo. Quien presenta recibe acuse al enviar y
                  aviso al resolverse; la oficina a la que le toca firmar recibe el suyo en
                  cuanto el expediente llega a su etapa. Nadie tiene que entrar a comprobar si
                  hay algo pendiente.
                </p>
              </Card>
            </Revelar>
          </Seccion>

          {/* =========================== Tracker ========================= */}
          <Seccion id="seguimiento" sobretitulo="Transparencia" titulo="Rua Tracker">
            <Parrafo>
              Desde <Codigo>Solicitudes</Codigo>, el botón <Fuerte>Seguimiento</Fuerte> abre el
              expediente. Responde de un vistazo la única pregunta que importa cuando has
              pedido algo: <em>¿en qué va lo mío?</em>
            </Parrafo>

            <Revelar>
              <MaquetaTracker />
            </Revelar>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['En qué fase está', 'Registrada, en validación o resuelta, y qué oficina la tiene ahora.'],
                ['Cuánto lleva', 'Días hábiles transcurridos frente al plazo normativo.'],
                ['Qué dijo cada quien', 'La justificación completa de cada firma, con nombre y fecha.'],
              ].map(([t, d], i) => (
                <Revelar key={t} retraso={i * 70}>
                  <Card className="h-full p-4">
                    <p className="text-body font-medium text-fg">{t}</p>
                    <p className="mt-1 text-body-sm leading-relaxed text-fg-muted">{d}</p>
                  </Card>
                </Revelar>
              ))}
            </div>
          </Seccion>

          {/* =========================== Axioma ========================== */}
          <Seccion id="axioma" sobretitulo="Lo que viene" titulo="Axioma AI">
            <Revelar>
              <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-6 sm:p-8">
                <BrainCircuit
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 size-40 text-primary/[0.05]"
                />

                <span className="relative inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-overline uppercase text-accent-softFg">
                  <span className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse" />
                  En construcción
                </span>

                <p className="relative mt-4 text-balance text-title-lg text-fg">
                  Un motor de decisiones sobre el territorio de datos
                </p>

                <div className="relative mt-4 flex flex-col gap-4 text-body leading-relaxed text-fg-muted">
                  <p>
                    RUA ordena el registro. <Fuerte>Axioma AI</Fuerte> es lo que construimos
                    encima: el motor que lee ese registro para anticipar en lugar de sólo
                    reportar.
                  </p>
                  <p>
                    Así como en la sabiduría indígena se estudia la tierra para saber cuándo
                    sembrar y cómo proteger los recursos, la Oficina de Planeación usará este
                    territorio de datos para prever el comportamiento institucional, detectar
                    cuellos de botella antes de que ocurran y optimizar el esfuerzo de todos.
                  </p>
                  <p className="text-body-sm text-fg-subtle">
                    Cada solicitud bien justificada que entra hoy en RUA es material con el que
                    Axioma aprenderá mañana. Por eso el concepto justificativo importa tanto: no
                    es un trámite, es el dato.
                  </p>
                </div>
              </div>
            </Revelar>
          </Seccion>

          {/* =========================== Cierre ========================== */}
          <Revelar>
            <Card className="flex flex-wrap items-center justify-between gap-4 bg-primary p-6 text-primary-fg">
              <div className="min-w-0">
                <p className="text-title-sm">¿Listo para presentar tu primera solicitud?</p>
                <p className="mt-1 text-body-sm opacity-80">
                  Entra con tu correo institucional y ve a Solicitudes → Nueva solicitud.
                </p>
              </div>
              <Link
                to="/entrar"
                data-motion="transform"
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-white px-5 text-label text-primary',
                  'transition-transform duration-press ease-out active:scale-[0.97]',
                )}
              >
                Entrar a RUA
                <ArrowRight className="size-4" />
              </Link>
            </Card>
          </Revelar>

          <footer className="border-t border-line pt-6">
            <p className="text-body-sm text-fg-subtle">
              Oficina de Inteligencia de Negocios · Universidad de Santander
            </p>
            <Link
              to="/entrar"
              className="mt-2 inline-flex items-center gap-1.5 text-body-sm text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" />
              Volver al inicio de sesión
            </Link>
          </footer>
        </main>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Piezas de composición
// -----------------------------------------------------------------------------
function Seccion({
  id,
  sobretitulo,
  titulo,
  children,
}: {
  id: string
  sobretitulo: string
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Revelar>
        <p className="text-overline uppercase tracking-wider text-primary">{sobretitulo}</p>
        <h2 className="mt-1.5 text-balance text-title-lg text-fg sm:text-display">{titulo}</h2>
      </Revelar>
      <div className="mt-6 flex flex-col gap-5">{children}</div>
    </section>
  )
}

function Parrafo({ children }: { children: React.ReactNode }) {
  return (
    <Revelar>
      <p className="max-w-2xl text-pretty text-body-lg leading-relaxed text-fg-muted">
        {children}
      </p>
    </Revelar>
  )
}

const Fuerte = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-semibold text-fg">{children}</strong>
)

const Codigo = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-surface-muted px-1.5 py-0.5 text-body-sm text-fg">{children}</code>
)

/** Un paso del instructivo: maqueta a un lado, indicaciones al otro. */
function Paso({
  n,
  titulo,
  pistas,
  children,
}: {
  n: number
  titulo: string
  pistas: string[]
  children: React.ReactNode
}) {
  return (
    <Revelar className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
      <div>{children}</div>

      <div className="lg:pt-2">
        <p className="flex items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-body-sm font-bold text-primary-fg">
            {n}
          </span>
          <span className="text-title-sm text-fg">{titulo}</span>
        </p>

        <ul className="mt-3 flex flex-col gap-2.5">
          {pistas.map((p, i) => (
            <li key={p}>
              <Pista n={i + 1}>{p}</Pista>
            </li>
          ))}
        </ul>
      </div>
    </Revelar>
  )
}
