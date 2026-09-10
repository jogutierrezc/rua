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
  Users2,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Marca } from '@/components/layout/Marca'
import { LinkButton } from '@/components/ui/LinkButton'
import { Card } from '@/components/ui/primitives'
import { Revelar } from './Revelar'
import {
  DiagramaFlujo,
  MaquetaActualizar,
  MaquetaClasificacion,
  MaquetaFichaMinima,
  MaquetaHojaRellena,
  MaquetaJustificacion,
  MaquetaPlantillas,
  MaquetaPrevisualizacion,
  MaquetaPropuesta,
  MaquetaRevision,
  MaquetaTracker,
  MaquetaVerificacion,
  Pista,
  TablaOficinas,
} from './maquetas'

const SECCIONES = [
  { id: 'iniciativa', titulo: 'La iniciativa' },
  { id: 'nombre', titulo: '¿Por qué RUA?' },
  { id: 'oficinas', titulo: '¿Quién hace qué?' },
  { id: 'solicitud', titulo: '¿Cómo se solicita?' },
  { id: 'flujo', titulo: 'El flujo de aprobación' },
  { id: 'seguimiento', titulo: 'Rua Tracker' },
  { id: 'rankings', titulo: 'Rankings internacionales' },
  { id: 'compartir', titulo: '¿Cómo comparto contactos?' },
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
              facultades y dependencias. Este recorrido explica cómo funciona, cómo se presenta
              una solicitud y cómo se reportan los contactos para los rankings internacionales.
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
                ¿Por qué se llama RUA?
              </a>
              <a
                href="#rankings"
                className={cn(
                  'inline-flex h-11 items-center rounded-md border border-white/25 px-5 text-label text-white',
                  'transition-[background-color,transform] duration-press ease-out',
                  'hover:bg-white/10 active:scale-[0.97]',
                )}
                data-motion="transform"
              >
                Reportar contactos
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
            titulo="¿Por qué existe esta herramienta?"
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
          <Seccion id="nombre" sobretitulo="El nombre" titulo="¿Por qué RUA?">
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
            titulo="¿Quién hace qué?"
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
            titulo="¿Cómo se presenta una solicitud?"
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
            sobretitulo="¿Qué pasa después?"
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

          {/* =========================== Rankings ======================== */}
          <Seccion
            id="rankings"
            sobretitulo="Internacionalización"
            titulo="¿Cómo se reportan los contactos?"
          >
            <Parrafo>
              Los rankings internacionales no se calculan solos: buena parte de la posición de una
              universidad sale de <Fuerte>encuestas de reputación</Fuerte>. Quienes las responden
              son académicos de otras instituciones y empleadores que contratan egresados, y cada
              universidad propone a quién preguntar. Esa propuesta se llama{' '}
              <Fuerte>nominación</Fuerte>, y es exactamente lo que se prepara aquí.
            </Parrafo>

            <Parrafo>
              De ahí que el módulo tenga la forma que tiene. No es una agenda de contactos: es el
              archivo que la Universidad entrega, y por eso importa tanto que los correos{' '}
              <Fuerte>sirvan de verdad</Fuerte>. Una lista de mil direcciones de las que responden
              cuarenta vale menos que una de cien que llegan todas.
            </Parrafo>

            <Revelar>
              <Card className="flex items-start gap-3 border-primary/25 bg-primary-soft p-4">
                <Users2 aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-softFg" />
                <p className="text-body-sm leading-relaxed text-primary-softFg">
                  <Fuerte>Cualquier dependencia puede aportar contactos.</Fuerte> Un decano que
                  volvió de un congreso, una facultad con convenios activos, la oficina de
                  egresados con sus empleadores: todos tienen contactos que la Universidad no
                  tiene registrados. Se envían a la oficina de Internacionalización, que es quien
                  los carga y los mantiene.
                </p>
              </Card>
            </Revelar>

            <Paso
              n={1}
              titulo="Descarga la plantilla que te toca"
              pistas={[
                'Hay dos, y no se mezclan: la académica es para docentes e investigadores de instituciones socias; la de empleadores, para empresas y organizaciones que contratan egresados.',
                'La primera hoja del archivo es la plantilla tal cual, con sus columnas en inglés y en su orden original. No cambies los nombres ni el orden: así es como la espera quien la recibe.',
                'La segunda hoja son las instrucciones, con un ejemplo por columna. Está aparte para que no haya que borrarla antes de entregar el archivo.',
              ]}
            >
              <MaquetaPlantillas />
            </Paso>

            <Paso
              n={2}
              titulo="Rellénala y súbela"
              pistas={[
                'Se admite .xlsx, .csv y también pegar las celdas directamente desde Excel. No hace falta renombrar cabeceras: se reconocen en inglés y en español.',
                'La columna que manda es el correo: si ya está en la libreta, el contacto se actualiza; si no, se crea. Es la identidad, porque dos personas se llaman igual pero nadie comparte buzón.',
                'Antes de escribir nada se enseña qué va a pasar fila por fila. Los errores —un nombre que falta, un correo sin arroba, una fila repetida— se saltan; el resto entra.',
              ]}
            >
              <MaquetaPrevisualizacion />
            </Paso>

            <Paso
              n={3}
              titulo="Verifica que los correos existan"
              pistas={[
                'Al cargar sólo se comprueba que el correo tenga forma de correo. Saber si el buzón existe exige preguntárselo a un proveedor externo, y eso cuesta dinero por consulta: es un paso aparte, que dispara una persona.',
                'El veredicto tiene tres colores porque la realidad tiene tres respuestas. Válido llega; inválido rebota; riesgoso es el que no se puede confirmar ni descartar — un buzón genérico, un dominio que acepta todo.',
                'Cada veredicto queda fechado y firmado. No es una propiedad eterna de la dirección: la gente cambia de trabajo, y por eso se vuelve a preguntar pasados tres meses.',
              ]}
            >
              <MaquetaVerificacion />
            </Paso>

            <Revelar>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  [
                    'El vocabulario lo pones tú',
                    'Si tu hoja trae sectores que el portal no conoce —«Banking», «Manufacturing»—, se añaden solos al catálogo con el texto exacto que traes. Lo que sólo cambia en tildes, mayúsculas o una errata se entiende como el que ya estaba.',
                  ],
                  [
                    'Las dos listas no se pisan',
                    'Un contacto que llegó como académico no lo convierte en empleador una carga posterior, aunque aparezca en las dos hojas. Se conserva como estaba y la previsualización lo dice antes.',
                  ],
                  [
                    'Y vuelve a salir igual',
                    'La libreta se exporta en el formato exacto de la plantilla, columna por columna. Lo que se cargó se puede devolver sin rehacerlo a mano.',
                  ],
                ].map(([titulo, texto], i) => (
                  <Revelar key={titulo} retraso={i * 70}>
                    <div className="h-full rounded-lg border border-line bg-surface p-4">
                      <p className="text-body font-medium text-fg">{titulo}</p>
                      <p className="mt-1.5 text-body-sm leading-relaxed text-fg-muted">{texto}</p>
                    </div>
                  </Revelar>
                ))}
              </div>
            </Revelar>

            <Revelar>
              <Card className="flex items-start gap-3 border-warning/30 bg-warning-soft p-4">
                <Compass aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-softFg" />
                <p className="text-body-sm leading-relaxed text-warning-softFg">
                  <Fuerte>Un contacto sin clasificar entra igual.</Fuerte> Si falta el país, el rol
                  o el sector, la carga no se detiene: el contacto se guarda y se completa después
                  desde su ficha. Lo único que impide guardarlo es que no tenga nombre, no tenga
                  cargo o el correo no sea un correo — lo demás se puede arreglar más tarde, y
                  detener una carga de cuatrocientas filas por eso no ayuda a nadie.
                </p>
              </Card>
            </Revelar>
          </Seccion>

          {/* =========================== Axioma ========================== */}
          {/* =========================== Compartir contactos ============= */}
          <Seccion
            id="compartir"
            sobretitulo="Para todos, no sólo para Internacionalización"
            titulo="¿Cómo comparto mis contactos?"
          >
            <Parrafo>
              Cargar contactos en la libreta lo hacen dos roles: el administrador y la oficina de
              Internacionalización. <Fuerte>Aportarlos lo hace cualquiera.</Fuerte> Un decano que
              vuelve de un congreso, una facultad con convenios activos, la oficina de egresados
              con sus empleadores: ahí están los contactos que la Universidad todavía no tiene
              registrados, y esta sección explica cómo hacerlos llegar.
            </Parrafo>

            <Parrafo>
              La separación es a propósito. La libreta es el archivo que la Universidad entrega a
              los rankings, así que tiene <Fuerte>una sola puerta de entrada</Fuerte> y alguien
              responsable de ella. Pero eso no puede convertirse en una excusa para perder
              contactos, y por eso reportarlos es tan simple como esto.
            </Parrafo>

            <Paso
              n={1}
              titulo="¿Tienes uno o dos? Mándalos escritos"
              pistas={[
                'Para un puñado de contactos no hace falta plantilla ninguna: basta un correo a la oficina de Internacionalización con estos datos.',
                'Sólo tres son imprescindibles — nombre y apellidos, cargo y correo —, porque son los que impiden guardar la ficha si faltan. El país, la institución y lo demás se completan después.',
                'Di siempre de dónde salió el contacto. Meses más tarde, cuando nadie recuerde quién lo propuso, esa línea es lo único que permite rendir cuentas de la lista.',
              ]}
            >
              <MaquetaFichaMinima />
            </Paso>

            <Paso
              n={2}
              titulo="¿Tienes una lista? Usa la plantilla"
              pistas={[
                'Descárgala desde Internacionalización → Contactos → Plantillas. Ese botón lo ve cualquiera que pueda consultar la libreta: bajar un archivo en blanco no es escribir en ella.',
                'Elige la que corresponda: la académica para docentes e investigadores de otras instituciones, la de empleadores para empresas que contratan egresados. No se mezclan.',
                'Rellénala en Excel, una fila por contacto, debajo de la cabecera. No cambies los nombres de las columnas ni su orden: así es como la espera quien la recibe.',
                'Cuando la tengas lista, envíasela a Internacionalización. Una lista de ocho contactos sirve igual que una de ochocientas.',
              ]}
            >
              <MaquetaHojaRellena />
            </Paso>

            <Paso
              n={3}
              titulo="¿Ya estaba y hay que corregirlo? Manda el mismo correo"
              pistas={[
                'El correo es la llave. Si mandas una fila con un correo que ya está en la libreta, el contacto NO se duplica: se actualiza con lo que traiga tu hoja.',
                'Una celda vacía significa «no lo sé», nunca «bórralo». Si sólo sabes el cargo nuevo, rellena el nombre, el correo y el cargo, y deja el resto en blanco: lo que ya estaba guardado se conserva.',
                'La única excepción es el correo mismo. Si a alguien le cambió la dirección, mandar la nueva crea un contacto aparte — dilo en el mensaje para que Internacionalización una las dos fichas.',
              ]}
            >
              <MaquetaActualizar />
            </Paso>

            <Revelar>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [
                    'No te preocupes por la ortografía del sector',
                    'Si escribes «Banking» y el portal no lo conoce, se añade solo. Si escribes «Bankng», se entiende como el que ya estaba. Y «EDUCACIÓN SUPERIOR», «Educación Superior» y «educacion superior» son el mismo sector, no tres.',
                  ],
                  [
                    'Ni por mandar algo repetido',
                    'Si dos personas reportan al mismo contacto, no se duplica: es el mismo correo, así que es la misma ficha. Repetir un contacto no rompe nada — omitirlo por si acaso, sí.',
                  ],
                  [
                    'Nada entra sin revisarse',
                    'Antes de escribir una sola fila, quien carga ve exactamente qué se va a crear, qué se va a actualizar y qué tiene errores. Si algo de tu hoja está mal, se ve antes y te lo pueden preguntar.',
                  ],
                  [
                    'Y puedes consultar lo que ya hay',
                    'La libreta la ve todo el mundo desde Internacionalización → Contactos. Antes de reunir una lista, míralo: quizá la mitad ya está, y así te centras en lo que falta.',
                  ],
                ].map(([titulo, texto], i) => (
                  <Revelar key={titulo} retraso={i * 70}>
                    <div className="h-full rounded-lg border border-line bg-surface p-4">
                      <p className="text-body font-medium text-fg">{titulo}</p>
                      <p className="mt-1.5 text-body-sm leading-relaxed text-fg-muted">{texto}</p>
                    </div>
                  </Revelar>
                ))}
              </div>
            </Revelar>
          </Seccion>

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
