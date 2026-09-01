import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  FileSpreadsheet,
  Info,
  PlayCircle,
  RotateCcw,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { csvAObjetos, descargarTexto, objetosACsv } from '@/lib/csv'
import {
  COLUMNAS_ACTIVIDADES,
  MENSAJE_XLS_ANTIGUO,
  descargarPlantillaExcel,
  detectarFormato,
  leerExcel,
} from '@/lib/excel'
import { cn } from '@/lib/cn'
import { AYUDA_CODIGO } from '@/lib/codigos'
import { fmtNumero } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { Campo, Select, Textarea } from '@/components/ui/Field'
import { Badge, Card, CardHeader, TableShell, Td, Th, Tr } from '@/components/ui/primitives'
import type {
  DiagnosticoImportacion,
  FilaImportacion,
  ModoImportacion,
  ResultadoImportacion,
} from '@/types/database'

// Las columnas viven en un solo sitio: plantilla, lector y exportación
// tienen que coincidir o el ciclo exportar → editar → reimportar se rompe.

const PLANTILLA = objetosACsv(
  [
    {
      codigo: 'ACT-010',
      nomenclatura: 'Vinculación Empresarial',
      tipo: 'principal',
      padre_codigo: '',
      estado: 'activa',
      descripcion: 'Convenios y prácticas profesionales',
    },
    {
      codigo: 'SUB-010A',
      nomenclatura: 'Gestión de Convenios',
      tipo: 'directa',
      padre_codigo: 'ACT-010',
      estado: 'activa',
      descripcion: '',
    },
    {
      codigo: 'AP-010A',
      nomenclatura: 'Seguimiento de Estudiantes en Práctica',
      tipo: 'apoyo',
      padre_codigo: 'SUB-010A',
      estado: 'activa',
      descripcion: '',
    },
  ],
  [...COLUMNAS_ACTIVIDADES],
)

type Paso = 'origen' | 'revision' | 'resultado'

export function ImportarActividadesPage() {
  const qc = useQueryClient()
  const inputArchivo = useRef<HTMLInputElement>(null)

  const [paso, setPaso] = useState<Paso>('origen')
  const [texto, setTexto] = useState('')
  const [modo, setModo] = useState<ModoImportacion>('mezclar')
  const [diagnostico, setDiagnostico] = useState<DiagnosticoImportacion[]>([])
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [descargando, setDescargando] = useState(false)

  // ---------------------------------------------------------------------------
  // Validación: la hace el servidor contra el estado real de la base. El cliente
  // no puede saber si un código ya existe sin preguntarlo.
  // ---------------------------------------------------------------------------
  const validar = useMutation({
    /**
     * Acepta texto pegado o un archivo. Excel y CSV convergen en la misma
     * lista de objetos antes de tocar el servidor, así que a partir de aquí
     * el origen deja de importar.
     */
    mutationFn: async (origen: string | File) => {
      let objetos: Record<string, string>[]

      if (typeof origen === 'string') {
        objetos = csvAObjetos(origen)
      } else {
        const formato = detectarFormato(origen.name)
        if (formato === 'xls-antiguo') throw new Error(MENSAJE_XLS_ANTIGUO)
        if (formato === 'desconocido') {
          throw new Error('Formato no reconocido. Sube un archivo .xlsx o .csv.')
        }
        objetos =
          formato === 'xlsx' ? await leerExcel(origen) : csvAObjetos(await origen.text())
      }

      if (objetos.length === 0) {
        throw new Error(
          'No se encontraron filas. Revisa que la primera fila sea la cabecera con los nombres de columna.',
        )
      }
      if (objetos.length > 2000) {
        throw new Error(
          `El archivo trae ${objetos.length} filas. Divídelo en lotes de 2000 como máximo.`,
        )
      }

      const filas: FilaImportacion[] = objetos.map((o) => ({
        codigo: o.codigo,
        nomenclatura: o.nomenclatura,
        tipo: o.tipo,
        // Se acepta también «padre» a secas: es como lo escribe medio mundo.
        padre_codigo: o.padre_codigo || o.padre || '',
        estado: o.estado,
        descripcion: o.descripcion,
      }))

      const { data, error } = await supabase.rpc('fn_validar_importacion', { p_filas: filas })
      if (error) throw error
      return data ?? []
    },
    onSuccess: (d) => {
      setDiagnostico(d)
      setPaso('revision')
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const importar = useMutation({
    mutationFn: async () => {
      const filas: FilaImportacion[] = diagnostico.map((d) => ({
        codigo: d.codigo ?? '',
        nomenclatura: d.nomenclatura ?? '',
        tipo: d.tipo ?? '',
        padre_codigo: d.padre_codigo ?? '',
        estado: d.estado ?? '',
        descripcion: d.descripcion ?? '',
      }))

      const { data, error } = await supabase.rpc('fn_importar_actividades', {
        p_filas: filas,
        p_modo: modo,
      })
      if (error) throw error
      return data?.[0] ?? { creadas: 0, actualizadas: 0, omitidas: 0 }
    },
    onSuccess: (r) => {
      setResultado(r)
      setPaso('resultado')
      void qc.invalidateQueries({ queryKey: ['actividades'] })
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  /**
   * Un .xlsx es un ZIP: no tiene sentido volcarlo al área de texto. Se guarda
   * el nombre para que se vea qué se cargó, y el archivo va entero al lector.
   */
  function cargarArchivo(archivo: File) {
    setArchivo(archivo)
    setTexto('')
    validar.mutate(archivo)
  }

  const errores = diagnostico.filter((d) => d.severidad === 'error')
  const aCrear = diagnostico.filter((d) => d.accion === 'crear')
  const aActualizar = diagnostico.filter((d) => d.accion === 'actualizar')

  function reiniciar() {
    setPaso('origen')
    setTexto('')
    setArchivo(null)
    setDiagnostico([])
    setResultado(null)
  }

  return (
    <>
      <PageHeader
        titulo="Importar actividades"
        descripcion="Carga o actualiza la estructura completa desde un archivo de Excel o CSV."
        volver={{ a: '/actividades', etiqueta: 'Volver a la estructura' }}
        acciones={
          <>
            <Button
              variante="sutil"
              cargando={descargando}
              onClick={async () => {
                setDescargando(true)
                try {
                  await descargarPlantillaExcel()
                } catch {
                  toast.error('No se pudo generar la plantilla.')
                } finally {
                  setDescargando(false)
                }
              }}
              iconoIzq={<FileSpreadsheet className="size-4" />}
            >
              Plantilla Excel
            </Button>
            <Button
              onClick={() => descargarTexto('plantilla-actividades.csv', PLANTILLA)}
              iconoIzq={<Download className="size-4" />}
            >
              CSV
            </Button>
          </>
        }
      />

      <Pasos actual={paso} />

      {/* ---------------------------------------------------------------- */}
      {paso === 'origen' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <Card>
            <CardHeader
              titulo="Origen de los datos"
              descripcion="Sube un .xlsx o un .csv, o pega las celdas directamente desde Excel."
            />

            <div className="flex flex-col gap-4 p-4">
              {/* Zona de arrastre */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setArrastrando(true)
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setArrastrando(false)
                  const archivo = e.dataTransfer.files?.[0]
                  if (archivo) cargarArchivo(archivo)
                }}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center',
                  'transition-[border-color,background-color] duration-fast ease-out',
                  arrastrando ? 'border-primary bg-primary-soft/50' : 'border-line-strong',
                )}
              >
                {/* Un .xlsx cargado no se puede mostrar en el área de texto —es
                    un ZIP—, así que se confirma con su nombre y su tamaño. */}
                {archivo ? (
                  <>
                    <FileSpreadsheet aria-hidden className="size-6 text-primary" />
                    <p className="max-w-full truncate text-body font-medium text-fg">
                      {archivo.name}
                    </p>
                    <p className="text-body-sm text-fg-subtle">
                      {(archivo.size / 1024).toFixed(0)} KB
                      {validar.isPending && ' · leyendo…'}
                    </p>
                    <Button
                      tamano="sm"
                      onClick={() => setArchivo(null)}
                      iconoIzq={<RotateCcw className="size-3.5" />}
                    >
                      Elegir otro
                    </Button>
                  </>
                ) : (
                  <>
                    <FileUp aria-hidden className="size-6 text-fg-subtle" />
                    <p className="text-body text-fg">Arrastra aquí tu archivo</p>
                    <p className="text-body-sm text-fg-subtle">Excel (.xlsx) o CSV</p>
                    <Button
                      onClick={() => inputArchivo.current?.click()}
                      iconoIzq={<Upload className="size-4" />}
                    >
                      Seleccionar archivo
                    </Button>
                  </>
                )}
                <input
                  ref={inputArchivo}
                  type="file"
                  accept={'.xlsx,.xlsm,.csv,.txt,' +
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'}
                  className="sr-only"
                  onChange={(e) => {
                    const archivo = e.target.files?.[0]
                    if (archivo) cargarArchivo(archivo)
                    // Permite volver a elegir el MISMO archivo tras corregirlo:
                    // sin esto, el evento change no se dispara la segunda vez.
                    e.target.value = ''
                  }}
                />
              </div>

              <Campo
                etiqueta="O pega el contenido"
                pista="Al pegar desde Excel llegan tabuladores; también acepta comas y punto y coma. La primera línea es la cabecera."
              >
                {({ id, describedBy }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    rows={8}
                    className="font-mono text-body-sm"
                    placeholder={'codigo,nomenclatura,tipo,padre_codigo,estado\nACT-010,Vinculación Empresarial,principal,,activa'}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                )}
              </Campo>

              <div className="flex justify-end">
                <Button
                  variante="primario"
                  disabled={!texto.trim()}
                  cargando={validar.isPending}
                  onClick={() => validar.mutate(texto)}
                  iconoIzq={<PlayCircle className="size-4" />}
                >
                  Validar
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-label text-fg">
              <Info aria-hidden className="size-4 text-primary" />
              Formato esperado
            </h2>
            <dl className="mt-3 flex flex-col gap-2.5 text-body-sm">
              {[
                ['codigo', `Obligatorio. ${AYUDA_CODIGO}`],
                ['nomenclatura', 'Obligatorio. El nombre oficial.'],
                ['tipo', 'principal, directa o apoyo.'],
                ['padre_codigo', 'Vacío en las principales; obligatorio en el resto.'],
                ['estado', 'Opcional. Por defecto, activa.'],
                ['descripcion', 'Opcional.'],
              ].map(([col, desc]) => (
                <div key={col}>
                  <dt className="font-mono text-body-sm text-fg">{col}</dt>
                  <dd className="text-fg-subtle">{desc}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 text-body-sm text-fg-subtle">
              <p>
                El orden de las filas no importa: un hijo puede aparecer antes que su
                padre y se resolverá igual.
              </p>
              <p>
                La plantilla de Excel trae una hoja de instrucciones con los valores
                admitidos en cada columna.
              </p>
              <p>
                Si tu archivo es <strong className="font-medium text-fg-muted">.xls</strong>{' '}
                (Excel 97-2003), guárdalo antes como .xlsx.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 'revision' && (
        <Card className="overflow-hidden">
          <CardHeader
            titulo="Revisión"
            descripcion={`${fmtNumero.format(diagnostico.length)} filas analizadas contra el estado actual del sistema.`}
            acciones={
              <Button tamano="sm" onClick={reiniciar} iconoIzq={<RotateCcw className="size-3.5" />}>
                Empezar de nuevo
              </Button>
            }
          />

          {/* Resumen. Lo primero que hay que saber es si se puede continuar. */}
          <div className="grid gap-px border-b border-line bg-line sm:grid-cols-3">
            <Resumen etiqueta="Se crearán" valor={aCrear.length} tono="exito" />
            <Resumen etiqueta="Se actualizarán" valor={aActualizar.length} tono="aviso" />
            <Resumen etiqueta="Con errores" valor={errores.length} tono="peligro" />
          </div>

          {errores.length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2.5 border-b border-line bg-danger-soft px-4 py-3 text-body-sm text-danger-softFg"
            >
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p>
                Hay {errores.length} {errores.length === 1 ? 'fila' : 'filas'} con errores. La
                importación es todo o nada: corrige el archivo y vuelve a validar.
              </p>
            </div>
          )}

          <TableShell>
            <thead>
              <tr>
                <Th className="w-16" alineado="der">
                  Línea
                </Th>
                <Th className="w-32">Código</Th>
                <Th>Nomenclatura</Th>
                <Th className="w-24">Tipo</Th>
                <Th className="w-28">Padre</Th>
                <Th className="w-28">Acción</Th>
                <Th>Observación</Th>
              </tr>
            </thead>
            <tbody>
              {diagnostico.map((d) => (
                <Tr
                  key={d.linea}
                  className={cn(d.severidad === 'error' && 'bg-danger-soft/35')}
                >
                  <Td alineado="der" className="text-fg-subtle">
                    {d.linea}
                  </Td>
                  <Td className="font-mono text-body-sm text-fg">{d.codigo ?? '—'}</Td>
                  <Td className="max-w-0 truncate">{d.nomenclatura ?? '—'}</Td>
                  <Td className="text-fg-muted">{d.tipo ?? '—'}</Td>
                  <Td className="font-mono text-body-sm text-fg-muted">{d.padre_codigo ?? '—'}</Td>
                  <Td>
                    <Badge
                      tono={
                        d.accion === 'error' ? 'peligro' : d.accion === 'crear' ? 'exito' : 'aviso'
                      }
                    >
                      {d.accion === 'error'
                        ? 'Error'
                        : d.accion === 'crear'
                          ? 'Crear'
                          : 'Actualizar'}
                    </Badge>
                  </Td>
                  <Td
                    className={cn(
                      'max-w-0 truncate',
                      d.severidad === 'error' ? 'text-danger-softFg' : 'text-fg-subtle',
                    )}
                    title={d.mensaje ?? undefined}
                  >
                    {d.mensaje ?? 'Lista para crear.'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-4 py-3">
            <Campo etiqueta="Modo" className="mr-auto max-w-xs">
              {({ id }) => (
                <Select
                  id={id}
                  value={modo}
                  onChange={(e) => setModo(e.target.value as ModoImportacion)}
                >
                  <option value="mezclar">Crear y actualizar</option>
                  <option value="solo_crear">Sólo crear las nuevas</option>
                  <option value="solo_actualizar">Sólo actualizar las existentes</option>
                </Select>
              )}
            </Campo>

            <Button onClick={reiniciar}>Cancelar</Button>
            <Button
              variante="primario"
              disabled={errores.length > 0 || diagnostico.length === 0}
              cargando={importar.isPending}
              onClick={() => importar.mutate()}
              iconoIzq={<CheckCircle2 className="size-4" />}
            >
              Aplicar {diagnostico.length - errores.length} filas
            </Button>
          </div>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 'resultado' && resultado && (
        <Card className="p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success-softFg">
            <CheckCircle2 className="size-6" />
          </span>
          <h2 className="mt-4 text-title text-fg">Importación completada</h2>

          <dl className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {[
              ['Creadas', resultado.creadas],
              ['Actualizadas', resultado.actualizadas],
              ['Omitidas', resultado.omitidas],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta as string} className="bg-surface px-3 py-4">
                <dt className="text-overline uppercase text-fg-subtle">{etiqueta}</dt>
                <dd className="mt-1 text-title-lg tabular text-fg">{valor as number}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={reiniciar} iconoIzq={<Upload className="size-4" />}>
              Importar otro archivo
            </Button>
            <LinkButton to="/actividades" variante="primario">
              Ver la estructura
            </LinkButton>
          </div>
        </Card>
      )}
    </>
  )
}

// -----------------------------------------------------------------------------
function Pasos({ actual }: { actual: Paso }) {
  const pasos: { clave: Paso; etiqueta: string }[] = [
    { clave: 'origen', etiqueta: 'Cargar' },
    { clave: 'revision', etiqueta: 'Revisar' },
    { clave: 'resultado', etiqueta: 'Aplicar' },
  ]
  const indice = pasos.findIndex((p) => p.clave === actual)

  return (
    <ol className="mb-4 flex items-center gap-2" aria-label="Progreso de la importación">
      {pasos.map((p, i) => (
        <li key={p.clave} className="flex items-center gap-2">
          <span
            aria-current={i === indice ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1 text-label',
              'transition-colors duration-fast ease-out',
              i < indice && 'bg-success-soft text-success-softFg',
              i === indice && 'bg-primary text-primary-fg',
              i > indice && 'bg-surface-muted text-fg-subtle',
            )}
          >
            <span className="tabular">{i + 1}</span>
            {p.etiqueta}
          </span>
          {i < pasos.length - 1 && <span aria-hidden className="h-px w-4 bg-line-strong" />}
        </li>
      ))}
    </ol>
  )
}

function Resumen({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string
  valor: number
  tono: 'exito' | 'aviso' | 'peligro'
}) {
  const color = {
    exito: 'text-success',
    aviso: 'text-warning',
    peligro: valor > 0 ? 'text-danger' : 'text-fg-subtle',
  }[tono]

  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-overline uppercase text-fg-subtle">{etiqueta}</p>
      <p className={cn('mt-0.5 text-title-lg tabular', color)}>{fmtNumero.format(valor)}</p>
    </div>
  )
}
