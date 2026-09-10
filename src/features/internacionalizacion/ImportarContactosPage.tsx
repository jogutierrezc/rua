import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  GraduationCap,
  Briefcase,
  MailCheck,
  Table2,
  Upload,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { csvAObjetos } from '@/lib/csv'
import {
  descargarPlantillaContactos,
  descargarPlantillaNominacion,
  detectarFormato,
  leerExcel,
  MENSAJE_XLS_ANTIGUO,
} from '@/lib/excel'
import { PLANTILLAS } from '@/lib/plantillasContactos'
import type { CodigoPlantilla } from '@/lib/plantillasContactos'
import { cn } from '@/lib/cn'
import { fmtNumero } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { Campo, Select, Textarea } from '@/components/ui/Field'
import { Badge, Card, CardHeader, TableShell, Td, Th, Tr } from '@/components/ui/primitives'
import type { TonoBadge } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  FILAS_MINIMAS_POR_LOTE,
  FILAS_POR_IMPORTACION,
  FILAS_POR_VALIDACION,
} from './dominio'
import type {
  FilaContactoValidada,
  ModoImportacion,
  ResultadoImportacionContactos,
  TipoContactoInternacional,
} from '@/types/database'

/**
 * Cómo se dice cada acción y de qué color.
 *
 * `omitir` es neutro, no rojo: no ha fallado nada. Es un contacto que ya está en
 * la libreta porque vino de la otra plantilla, y que se deja intacto justamente
 * para que las dos listas no se pisen.
 */
const ETIQUETA_ACCION: Record<FilaContactoValidada['accion'], string> = {
  crear: 'Crear',
  actualizar: 'Actualizar',
  omitir: 'Se conserva',
  error: 'Error',
}

const TONO_ACCION: Record<FilaContactoValidada['accion'], TonoBadge> = {
  crear: 'exito',
  actualizar: 'primario',
  omitir: 'neutro',
  error: 'peligro',
}

const SEVERIDAD: Record<
  FilaContactoValidada['severidad'],
  { icono: typeof CheckCircle2; clase: string }
> = {
  ok: { icono: CheckCircle2, clase: 'text-success' },
  aviso: { icono: AlertCircle, clase: 'text-warning' },
  error: { icono: XCircle, clase: 'text-danger' },
}

/**
 * De qué plantilla se está cargando.
 *
 * No es sólo cuál se descarga: viaja al servidor y cambia cómo se interpreta la
 * hoja. La académica, por ejemplo, no trae columna de sector porque no le hace
 * falta —todo el que está en ella trabaja en educación superior—, y sin saber de
 * qué plantilla viene, esa clasificación se perdería.
 */
type OrigenCarga = CodigoPlantilla | 'general'

const ORIGENES: {
  codigo: OrigenCarga
  nombre: string
  detalle: string
  icono: typeof GraduationCap
}[] = [
  {
    codigo: 'academica',
    nombre: 'Contactos académicos',
    detalle: 'Source · Title · First Name · Last Name · Job Title · Department · Institution…',
    icono: GraduationCap,
  },
  {
    codigo: 'empleadores',
    nombre: 'Contactos de empleadores',
    detalle: 'Source · Title · First Name · Last Name · Position · Industry · Company Name…',
    icono: Briefcase,
  },
  {
    codigo: 'general',
    nombre: 'Plantilla propia de Rua',
    detalle: 'nombre_completo · cargo · pais · correo · rol · sector · organización…',
    icono: Table2,
  },
]

interface Progreso {
  hechas: number
  total: number
  fase: 'validando' | 'importando'
  /** El tamaño de lote vigente. Baja solo si la base corta por tiempo. */
  tamano: number
}

/**
 * ¿PostgREST no encontró la función con esos argumentos?
 *
 * Pasa cuando la base va por detrás del código: se le pide una versión de la
 * función que aún no tiene. El mensaje que devuelve —«Could not find the
 * function … in the schema cache»— es correcto pero incomprensible para quien
 * sólo quería subir una hoja, así que se detecta para poder reaccionar en vez de
 * enseñarlo tal cual.
 */
function funcionNoEncontrada(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  return (
    e?.code === 'PGRST202' ||
    /could not find the function/i.test(e?.message ?? '')
  )
}

/** El comienzo del aviso de repetido. Lo escriben la base y el cliente, igual. */
const REPETIDO = 'Este correo ya aparece en la fila'

/**
 * ¿La base cortó la consulta por tiempo?
 *
 * PostgREST corta cualquier consulta que pase de unos segundos, y con razón: es
 * lo que impide que una llamada mal hecha bloquee la base para todos.
 */
function esCortePorTiempo(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  return e?.code === '57014' || /statement timeout/i.test(e?.message ?? '')
}

/**
 * Recorre la hoja en lotes, y el lote se encoge solo si hace falta.
 *
 * El tamaño correcto no se puede saber de antemano: depende de cuántas columnas
 * traiga la hoja, de cuántos contactos haya ya en la libreta y del tamaño de la
 * instancia. Elegir una constante es elegir un número que será demasiado grande
 * en un sitio y demasiado pequeño en otro.
 *
 * Así que no se elige: se empieza por uno razonable y, si la base corta por
 * tiempo, se parte por la mitad y se reintenta EL MISMO TRAMO. Converge en dos o
 * tres intentos y no pierde nada por el camino, porque lo ya confirmado quedó
 * confirmado.
 *
 * Sólo se reintenta el corte por tiempo. Cualquier otro error se deja subir tal
 * cual: reintentar más pequeño un permiso denegado o una columna que no existe
 * sería repetir el mismo fallo en trozos.
 */
async function recorrerEnLotes<T>(
  items: T[],
  tamanoInicial: number,
  ejecutar: (lote: T[], desde: number) => Promise<void>,
  alAvanzar: (hechas: number, tamano: number) => void,
): Promise<void> {
  let tamano = tamanoInicial
  let hechas = 0

  while (hechas < items.length) {
    const lote = items.slice(hechas, hechas + tamano)
    try {
      await ejecutar(lote, hechas)
    } catch (e) {
      if (esCortePorTiempo(e) && tamano > FILAS_MINIMAS_POR_LOTE) {
        tamano = Math.max(FILAS_MINIMAS_POR_LOTE, Math.floor(tamano / 2))
        alAvanzar(hechas, tamano)
        continue
      }
      throw e
    }
    hechas += lote.length
    alAvanzar(hechas, tamano)
  }
}

/**
 * Caza los correos repetidos que la base no puede ver.
 *
 * Cada trozo se valida por separado, así que el servidor sólo detecta los
 * repetidos DENTRO de su trozo: dos filas con el mismo correo en los trozos 1 y 3
 * le parecen dos contactos distintos. El cliente es el único que tiene la hoja
 * entera delante, así que la última palabra sobre esto es suya.
 *
 * El mensaje es idéntico al del servidor a propósito: al usuario le da igual
 * quién detectó el problema, y dos textos distintos para el mismo caso sólo
 * harían dudar de si son el mismo problema.
 */
function marcarRepetidos(filas: FilaContactoValidada[]): FilaContactoValidada[] {
  const vistos = new Map<string, number>()

  return filas.map((f) => {
    const correo = f.correo?.trim().toLowerCase()
    if (!correo) return f

    const primera = vistos.get(correo)
    if (primera === undefined) {
      vistos.set(correo, f.linea)
      return f
    }

    // Si ya traía OTRO problema, se respeta: el primero que se encontró es el
    // que hay que arreglar, y encadenar mensajes no ayuda a arreglar ninguno.
    //
    // La excepción es que el problema fuera este mismo. El servidor sólo ve su
    // trozo, así que el número de fila que da es el del trozo; el de aquí es el
    // de la hoja, que es el que se busca al ir a corregirla.
    if (f.severidad === 'error' && !f.mensaje.startsWith(REPETIDO)) return f

    return {
      ...f,
      accion: 'error',
      severidad: 'error',
      mensaje: `${REPETIDO} ${primera} de esta misma hoja.`,
    }
  })
}

export function ImportarContactosPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { puede } = useAuth()
  const inputArchivo = useRef<HTMLInputElement>(null)

  const [origen, setOrigen] = useState<OrigenCarga>('academica')
  const [pegado, setPegado] = useState('')
  const [modo, setModo] = useState<ModoImportacion>('mezclar')
  const [filas, setFilas] = useState<Record<string, string>[]>([])
  const [validadas, setValidadas] = useState<FilaContactoValidada[] | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacionContactos | null>(null)
  const [progreso, setProgreso] = useState<Progreso | null>(null)

  const plantilla = origen === 'general' ? null : PLANTILLAS[origen]
  const tipo: TipoContactoInternacional = plantilla?.tipoContacto ?? 'general'

  /** Cambiar de plantilla invalida lo previsualizado: se validó con otras reglas. */
  const cambiarOrigen = (nuevo: OrigenCarga) => {
    setOrigen(nuevo)
    setValidadas(null)
    setFilas([])
    setResultado(null)
  }

  /**
   * Previsualizar y escribir usan el MISMO normalizador, en la base, y reciben
   * la MISMA plantilla. Es lo que hace que la previsualización valga algo: si el
   * que valida y el que escribe interpretaran la hoja por su cuenta, el usuario
   * aprobaría una cosa y se guardaría otra.
   */
  const previsualizar = useMutation({
    mutationFn: async (fuente: File | string | Record<string, string>[]) => {
      let objetos: Record<string, string>[]

      // Ya leídas: se rehace la previsualización sobre lo mismo, sin volver a
      // pedir el archivo. Hace falta al añadir valores al catálogo, que cambia
      // el veredicto de filas que ya estaban en pantalla.
      if (Array.isArray(fuente)) {
        objetos = fuente
      } else if (typeof fuente === 'string') {
        objetos = csvAObjetos(fuente)
      } else {
        const formato = detectarFormato(fuente.name)
        if (formato === 'xls-antiguo') throw new Error(MENSAJE_XLS_ANTIGUO)
        if (formato === 'desconocido') {
          throw new Error('Formato no reconocido. Sube un archivo .xlsx o .csv.')
        }
        objetos = formato === 'xlsx' ? await leerExcel(fuente) : csvAObjetos(await fuente.text())
      }

      if (objetos.length === 0) throw new Error('No se encontró ninguna fila con datos.')

      // La hoja se valida a trozos: entera no cabe en el tiempo que PostgREST
      // le da a una consulta. A cada trozo se le dice desde qué fila va, para
      // que los números que devuelve sean los de la hoja y no los del trozo.
      const acumulado: FilaContactoValidada[] = []
      setProgreso({
        hechas: 0,
        total: objetos.length,
        fase: 'validando',
        tamano: FILAS_POR_VALIDACION,
      })

      await recorrerEnLotes(
        objetos,
        FILAS_POR_VALIDACION,
        async (lote, desde) => {
          let respuesta = await supabase.rpc('fn_validar_importacion_contactos', {
            p_filas: lote,
            p_tipo: tipo,
            p_desde: desde,
          })

          // `p_desde` lo estrenó la migración 26. Si la base todavía no la
          // tiene, se llama a la versión anterior y el desplazamiento de las
          // líneas se hace aquí: el resultado es el mismo y la carga no se queda
          // esperando a que alguien aplique una migración.
          let desplazarAqui = false
          if (respuesta.error && funcionNoEncontrada(respuesta.error)) {
            respuesta = await supabase.rpc('fn_validar_importacion_contactos', {
              p_filas: lote,
              p_tipo: tipo,
            })
            desplazarAqui = true
          }

          if (respuesta.error) {
            if (funcionNoEncontrada(respuesta.error)) {
              throw new Error(
                'La base de datos no tiene todavía el módulo de plantillas. Aplica la migración ' +
                  '20260901002500_plantillas_nominacion.sql y vuelve a intentarlo.',
              )
            }
            throw respuesta.error
          }

          const delLote = (respuesta.data ?? []) as FilaContactoValidada[]
          acumulado.push(
            ...(desplazarAqui ? delLote.map((f) => ({ ...f, linea: f.linea + desde })) : delLote),
          )
        },
        (hechas, tamano) =>
          setProgreso({ hechas, total: objetos.length, fase: 'validando', tamano }),
      )

      setFilas(objetos)
      setResultado(null)
      return marcarRepetidos(acumulado)
    },
    onSuccess: (d) => setValidadas(d),
    onSettled: () => setProgreso(null),
    onError: (e) => {
      setValidadas(null)
      toast.error(mensajeDeError(e))
    },
  })

  const importar = useMutation({
    mutationFn: async () => {
      // También a trozos, y por el mismo motivo. Que no sea una única
      // transacción no cambia nada de lo prometido: el importador ya saltaba las
      // filas con error y seguía con las demás, así que la carga nunca fue «todo
      // o nada». Lo que se gana es que una hoja larga termine, y que se vea
      // avanzar mientras lo hace.
      const total: ResultadoImportacionContactos = { creados: 0, actualizados: 0, omitidos: 0 }
      let hechas = 0
      setProgreso({
        hechas: 0,
        total: filas.length,
        fase: 'importando',
        tamano: FILAS_POR_IMPORTACION,
      })

      try {
        await recorrerEnLotes(
          filas,
          FILAS_POR_IMPORTACION,
          async (lote) => {
            const { data, error } = await supabase.rpc('fn_importar_contactos', {
              p_filas: lote,
              p_modo: modo,
              p_tipo: tipo,
            })
            // Se deja subir el error TAL CUAL: quien recorre los lotes necesita
            // reconocer el corte por tiempo para encoger y reintentar, y un
            // error envuelto en otro mensaje ya no se reconoce.
            if (error) throw error

            const parcial = data?.[0] as ResultadoImportacionContactos | undefined
            total.creados += parcial?.creados ?? 0
            total.actualizados += parcial?.actualizados ?? 0
            total.omitidos += parcial?.omitidos ?? 0
          },
          (n, tamano) => {
            hechas = n
            setProgreso({ hechas: n, total: filas.length, fase: 'importando', tamano })
          },
        )
      } catch (e) {
        if (funcionNoEncontrada(e)) {
          throw new Error(
            'La base de datos no tiene todavía el módulo de plantillas. Aplica la migración ' +
              '20260901002500_plantillas_nominacion.sql y vuelve a intentarlo.',
          )
        }
        // Lo ya escrito NO se pierde: cada lote se confirmó al terminar. Se dice
        // cuánto entró antes de fallar, que es lo que hace falta saber para
        // retomar sin duplicar.
        throw new Error(
          `${mensajeDeError(e)} Se alcanzaron a procesar ${fmtNumero.format(hechas)} de ` +
            `${fmtNumero.format(filas.length)} filas; el resto no se importó.`,
        )
      }

      return total
    },
    onSettled: () => setProgreso(null),
    onSuccess: (r) => {
      setResultado(r)
      setValidadas(null)
      setFilas([])
      setPegado('')
      void qc.invalidateQueries({ queryKey: ['contactos'] })
      toast.success(
        `${fmtNumero.format(r.creados)} creados · ${fmtNumero.format(r.actualizados)} actualizados`,
      )
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const conError = validadas?.filter((f) => f.severidad === 'error').length ?? 0
  const aCrear = validadas?.filter((f) => f.accion === 'crear').length ?? 0
  const aActualizar = validadas?.filter((f) => f.accion === 'actualizar').length ?? 0
  const aConservar = validadas?.filter((f) => f.accion === 'omitir').length ?? 0
  const aplicables = aCrear + aActualizar

  /**
   * Los valores que la hoja trae y el catálogo va a estrenar.
   *
   * Quién se reconoce y quién no lo dice el servidor, fila a fila —incluida la
   * equivalencia por parecido—: aquí sólo se juntan y se quitan los repetidos.
   * Comparar aquí los textos contra el catálogo sería reimplementar en el
   * navegador las reglas de normalización de la base, que es exactamente como
   * acaban discrepando.
   */
  const nuevosDelCatalogo = (tipo: 'rol' | 'sector') => {
    const vistos = new Map<string, string>()
    for (const f of validadas ?? []) {
      const reconocido = tipo === 'rol' ? f.rol_ok : f.sector_ok
      const texto = (tipo === 'rol' ? f.rol : f.sector)?.trim()
      if (reconocido === false && texto) vistos.set(texto.toLowerCase(), texto)
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'))
  }

  const rolesNuevos = nuevosDelCatalogo('rol')
  const sectoresNuevos = nuevosDelCatalogo('sector')

  return (
    <>
      <PageHeader
        titulo="Importar contactos"
        descripcion="Trae la libreta desde una hoja de cálculo. Nada se escribe hasta que confirmes."
        volver={{ a: '/internacionalizacion/contactos', etiqueta: 'Volver a Contactos' }}
      />

      <div className="flex flex-col gap-4">
        {/* Plantilla ---------------------------------------------------- */}
        <Card>
          <CardHeader
            titulo="1 · Qué estás cargando"
            descripcion="Cada plantilla tiene sus columnas, y de esto depende cómo se lee la hoja."
          />

          <div className="grid gap-3 p-4 sm:grid-cols-3">
            {ORIGENES.map((o) => {
              const Icono = o.icono
              const activo = o.codigo === origen
              return (
                <button
                  key={o.codigo}
                  onClick={() => cambiarOrigen(o.codigo)}
                  aria-pressed={activo}
                  className={cn(
                    'rounded-lg border p-3 text-left',
                    'transition-[border-color,background-color] duration-fast ease-out',
                    activo
                      ? 'border-primary bg-primary-soft'
                      : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icono
                      aria-hidden
                      className={cn('size-4', activo ? 'text-primary-softFg' : 'text-fg-subtle')}
                    />
                    <span
                      className={cn(
                        'text-label',
                        activo ? 'text-primary-softFg' : 'text-fg',
                      )}
                    >
                      {o.nombre}
                    </span>
                  </span>
                  <span className="mt-1 block text-body-sm text-fg-subtle">{o.detalle}</span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <p className="max-w-2xl text-body-sm text-fg-muted">
              {plantilla ? (
                <>
                  La primera hoja del archivo es la plantilla <strong>tal cual</strong>: sus
                  cabeceras, en su orden y con su grafía original. Los ejemplos y las explicaciones
                  van en una segunda hoja, para que no haya que borrarlos antes de entregarla.
                </>
              ) : (
                <>
                  La plantilla propia trae todos los campos de la libreta, incluidos los que las de
                  nominación no tienen: rol, sector y notas.
                </>
              )}
            </p>
            <Button
              onClick={() =>
                void (plantilla
                  ? descargarPlantillaNominacion(plantilla)
                  : descargarPlantillaContactos())
              }
              iconoIzq={<Download className="size-4" />}
            >
              Descargar plantilla .xlsx
            </Button>
          </div>

          <div className="border-t border-line px-4 py-3 text-body-sm text-fg-muted">
            <p>
              La columna que empareja es siempre <strong>el correo</strong>: si ya existe, el
              contacto se actualiza; si no, se crea. Se comprueba que tenga estructura de correo y
              que el nombre y el cargo parezcan lo que dicen ser. País y sector se validan contra su
              catálogo <em>si vienen</em>: mal escritos son un error, ausentes sólo dejan el contacto
              sin clasificar.
            </p>
            <p className="mt-2">
              {origen !== 'general' && (
                <>
                  Ninguna de las dos plantillas de nominación trae columna de <strong>rol</strong>:
                  los contactos entran sin él y se clasifican después desde la libreta.{' '}
                </>
              )}
              {origen === 'academica' && (
                <>
                  Los contactos académicos se clasifican solos en el sector{' '}
                  <strong>Educación superior</strong>, que es lo que la plantilla da por supuesto.{' '}
                </>
              )}
              {origen === 'empleadores' && (
                <>
                  La columna <strong>Industry</strong> se valida contra el catálogo de sectores.{' '}
                </>
              )}
              Si tu hoja trae un rol o un sector que aún no existe,{' '}
              <Link
                to="/internacionalizacion/catalogos"
                className="text-primary underline underline-offset-2 hover:text-primary-hover"
              >
                añádelo antes en Roles y Sectores
              </Link>
              .
            </p>
          </div>
        </Card>

        {/* Origen ------------------------------------------------------- */}
        <Card>
          <CardHeader
            titulo="2 · Los datos"
            descripcion="Sube un .xlsx o un .csv, o pega las celdas directamente desde Excel."
          />
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputArchivo}
                type="file"
                className="sr-only"
                accept={
                  '.xlsx,.xlsm,.csv,.txt,' +
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'
                }
                onChange={(e) => {
                  const archivo = e.target.files?.[0]
                  if (archivo) previsualizar.mutate(archivo)
                  e.target.value = ''
                }}
              />
              <Button
                variante="primario"
                cargando={previsualizar.isPending}
                onClick={() => inputArchivo.current?.click()}
                iconoIzq={<FileUp className="size-4" />}
              >
                Elegir archivo
              </Button>
              <span className="text-body-sm text-fg-subtle">o pega las celdas aquí abajo</span>
            </div>

            <Campo etiqueta="Pegar desde Excel">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={4}
                  placeholder="Copia el rango en Excel, incluida la fila de cabecera, y pégalo aquí."
                  value={pegado}
                  onChange={(e) => setPegado(e.target.value)}
                />
              )}
            </Campo>

            <div className="flex justify-end">
              <Button
                disabled={!pegado.trim()}
                cargando={previsualizar.isPending}
                onClick={() => previsualizar.mutate(pegado)}
              >
                Previsualizar lo pegado
              </Button>
            </div>

            {/* El avance.

                Una hoja larga viaja en varias llamadas, y sin esto la pantalla
                se quedaría quieta un minuto sin decir si está trabajando o se
                colgó. Sólo se anima el ancho de una barra que ya está en su
                sitio: no hay salto de maquetación. */}
            {progreso && (
              <div>
                <div className="flex items-center justify-between text-body-sm text-fg-muted">
                  <span>
                    {progreso.fase === 'validando'
                      ? 'Revisando la hoja…'
                      : 'Escribiendo los contactos…'}
                  </span>
                  <span className="tabular">
                    {fmtNumero.format(progreso.hechas)} de {fmtNumero.format(progreso.total)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                    style={{
                      width: `${Math.round((progreso.hechas / Math.max(progreso.total, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-body-sm text-fg-subtle">
                  La hoja va en tandas de <span className="tabular">{progreso.tamano}</span> filas:
                  entera no cabe en el tiempo que la base da a una consulta. Si alguna tanda no
                  llega a tiempo, se parte por la mitad y se reintenta sola. No cierres esta pestaña.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Previsualización --------------------------------------------- */}
        {validadas && (
          <Card>
            <CardHeader
              titulo="3 · Qué va a pasar"
              descripcion="Revisa antes de confirmar. Las filas con error se saltan; el resto se aplica."
              acciones={
                <div className="flex flex-wrap items-end gap-2">
                  <Campo etiqueta="Modo" className="w-52">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={modo}
                        onChange={(e) => setModo(e.target.value as ModoImportacion)}
                      >
                        <option value="mezclar">Crear y actualizar</option>
                        <option value="solo_crear">Sólo crear los nuevos</option>
                        <option value="solo_actualizar">Sólo actualizar los existentes</option>
                      </Select>
                    )}
                  </Campo>
                  <Button
                    variante="primario"
                    disabled={aplicables === 0}
                    cargando={importar.isPending}
                    onClick={() => importar.mutate()}
                    iconoIzq={<Upload className="size-4" />}
                  >
                    Importar {fmtNumero.format(aplicables)}
                  </Button>
                </div>
              }
            />

            <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
              <Badge tono="primario">{plantilla?.nombre ?? 'Plantilla propia'}</Badge>
              <Badge tono="exito">{fmtNumero.format(aCrear)} se crean</Badge>
              <Badge tono="primario">{fmtNumero.format(aActualizar)} se actualizan</Badge>
              {aConservar > 0 && (
                <Badge tono="neutro">{fmtNumero.format(aConservar)} de la otra lista</Badge>
              )}
              {conError > 0 && <Badge tono="peligro">{fmtNumero.format(conError)} con error</Badge>}
            </div>

            {/* El vocabulario que la hoja estrena.

                La columna «Industry» de una plantilla de nominación trae el
                vocabulario de quien la escribe, no el nuestro. Se añade al
                catálogo con el texto EXACTO de la hoja, para que a la siguiente
                carga ya coincida. Se enseña antes de confirmar porque ampliar el
                catálogo es una decisión, aunque la tome la base: quien importa
                tiene derecho a ver qué palabras va a adoptar el portal. */}
            {(rolesNuevos.length > 0 || sectoresNuevos.length > 0) && (
              <div className="border-b border-line bg-primary-soft px-4 py-3 text-body-sm text-primary-softFg">
                <p className="font-medium">
                  Se añadirán {rolesNuevos.length + sectoresNuevos.length} valores nuevos al
                  catálogo.
                </p>
                <p className="mt-1">
                  Los que ya existían se reutilizan, y los que sólo se diferencian en tildes,
                  mayúsculas o una errata se entienden como el que ya estaba — cada fila lo dice en
                  su diagnóstico.
                </p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {rolesNuevos.map((v) => (
                    <Badge key={`rol-${v}`} tono="neutro">
                      rol · {v}
                    </Badge>
                  ))}
                  {sectoresNuevos.map((v) => (
                    <Badge key={`sector-${v}`} tono="neutro">
                      sector · {v}
                    </Badge>
                  ))}
                </p>
              </div>
            )}

            <TableShell>
              <thead>
                <tr>
                  <Th className="w-14">Fila</Th>
                  <Th>Contacto</Th>
                  <Th className="w-56">Correo</Th>
                  <Th className="w-36">País</Th>
                  <Th className="w-28">Acción</Th>
                  <Th>Diagnóstico</Th>
                </tr>
              </thead>
              <tbody>
                {validadas.map((f) => {
                  const sev = SEVERIDAD[f.severidad]
                  const Icono = sev.icono
                  return (
                    <Tr
                      key={f.linea}
                      className={cn(f.severidad === 'error' && 'border-l-2 border-l-danger')}
                    >
                      <Td className="tabular text-fg-subtle">{f.linea}</Td>
                      <Td className="max-w-0">
                        <span className="block truncate text-fg">{f.nombre ?? '—'}</span>
                        <span className="block truncate text-body-sm text-fg-subtle">
                          {f.cargo ?? '—'}
                        </span>
                      </Td>
                      <Td className="max-w-0">
                        <span className="block truncate font-mono text-body-sm text-fg-muted">
                          {f.correo ?? '—'}
                        </span>
                      </Td>
                      <Td className="max-w-0 text-fg-muted">
                        <span className="block truncate">{f.pais ?? '—'}</span>
                        <span className="block truncate text-body-sm text-fg-subtle">
                          {f.sector ?? '—'}
                        </span>
                      </Td>
                      <Td>
                        <Badge tono={TONO_ACCION[f.accion]}>{ETIQUETA_ACCION[f.accion]}</Badge>
                      </Td>
                      <Td>
                        <span className={cn('flex items-start gap-1.5 text-body-sm', sev.clase)}>
                          <Icono aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                          {f.mensaje}
                        </span>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </TableShell>
          </Card>
        )}

        {/* Resultado ----------------------------------------------------- */}
        {resultado && (
          <Card className="p-4">
            <h2 className="text-label text-fg">Importación terminada</h2>
            <p className="mt-1 text-body text-fg-muted">
              {fmtNumero.format(resultado.creados)} creados ·{' '}
              {fmtNumero.format(resultado.actualizados)} actualizados ·{' '}
              {fmtNumero.format(resultado.omitidos)} omitidos.
            </p>
            <p className="mt-2 max-w-2xl text-body-sm text-fg-subtle">
              De estos correos sólo se comprobó la estructura. Para saber cuáles existen de verdad
              queda el segundo paso, que es el que consume créditos del plan.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variante="primario"
                onClick={() => navigate('/internacionalizacion/contactos')}
              >
                Ver los contactos
              </Button>
              {puede('internacionalizacion.verificar') && (
                <LinkButton
                  to="/internacionalizacion/verificacion"
                  iconoIzq={<MailCheck className="size-4" />}
                >
                  Verificar los correos
                </LinkButton>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
