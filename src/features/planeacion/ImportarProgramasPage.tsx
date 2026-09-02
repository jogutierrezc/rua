import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Download, FileUp, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { csvAObjetos } from '@/lib/csv'
import {
  descargarPlantillaProgramas,
  detectarFormato,
  leerExcel,
  MENSAJE_XLS_ANTIGUO,
} from '@/lib/excel'
import { cn } from '@/lib/cn'
import { fmtNumero } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Campo, Select, Textarea } from '@/components/ui/Field'
import { Badge, Card, CardHeader, TableShell, Td, Th, Tr } from '@/components/ui/primitives'
import type {
  FilaProgramaValidada,
  ModoImportacion,
  ResultadoImportacionProgramas,
} from '@/types/database'

const SEVERIDAD: Record<
  FilaProgramaValidada['severidad'],
  { icono: typeof CheckCircle2; clase: string }
> = {
  ok: { icono: CheckCircle2, clase: 'text-success' },
  aviso: { icono: AlertCircle, clase: 'text-warning' },
  error: { icono: XCircle, clase: 'text-danger' },
}

export function ImportarProgramasPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const inputArchivo = useRef<HTMLInputElement>(null)

  const [pegado, setPegado] = useState('')
  const [modo, setModo] = useState<ModoImportacion>('mezclar')
  const [filas, setFilas] = useState<Record<string, string>[]>([])
  const [validadas, setValidadas] = useState<FilaProgramaValidada[] | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacionProgramas | null>(null)

  /**
   * Previsualizar y escribir usan el MISMO normalizador, en la base.
   *
   * Es lo que hace que la previsualización valga algo: si el que valida y el
   * que escribe limpiaran el texto por su cuenta, el usuario aprobaría una cosa
   * y se guardaría otra.
   */
  const previsualizar = useMutation({
    mutationFn: async (origen: File | string) => {
      let objetos: Record<string, string>[]

      if (typeof origen === 'string') {
        objetos = csvAObjetos(origen)
      } else {
        const formato = detectarFormato(origen.name)
        if (formato === 'xls-antiguo') throw new Error(MENSAJE_XLS_ANTIGUO)
        if (formato === 'desconocido') {
          throw new Error('Formato no reconocido. Sube un archivo .xlsx o .csv.')
        }
        objetos = formato === 'xlsx' ? await leerExcel(origen) : csvAObjetos(await origen.text())
      }

      if (objetos.length === 0) throw new Error('No se encontró ninguna fila con datos.')

      const { data, error } = await supabase.rpc('fn_validar_importacion_programas', {
        p_filas: objetos,
      })
      if (error) throw error

      setFilas(objetos)
      setResultado(null)
      return (data ?? []) as FilaProgramaValidada[]
    },
    onSuccess: (d) => setValidadas(d),
    onError: (e) => {
      setValidadas(null)
      toast.error(mensajeDeError(e))
    },
  })

  const importar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('fn_importar_programas', {
        p_filas: filas,
        p_modo: modo,
      })
      if (error) throw error
      return data?.[0] as ResultadoImportacionProgramas
    },
    onSuccess: (r) => {
      setResultado(r)
      setValidadas(null)
      setFilas([])
      setPegado('')
      void qc.invalidateQueries({ queryKey: ['programas'] })
      toast.success(
        `${fmtNumero.format(r.creados)} creados · ${fmtNumero.format(r.actualizados)} actualizados`,
      )
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const conError = validadas?.filter((f) => f.severidad === 'error').length ?? 0
  const aCrear = validadas?.filter((f) => f.accion === 'crear').length ?? 0
  const aActualizar = validadas?.filter((f) => f.accion === 'actualizar').length ?? 0
  const aplicables = aCrear + aActualizar

  return (
    <>
      <PageHeader
        titulo="Importar Programas"
        descripcion="Trae la oferta académica desde una hoja de cálculo. Nada se escribe hasta que confirmes."
        volver={{ a: '/planeacion/programas', etiqueta: 'Volver a Programas UDES' }}
      />

      <div className="flex flex-col gap-4">
        {/* Plantilla ---------------------------------------------------- */}
        <Card>
          <CardHeader
            titulo="1 · La plantilla"
            descripcion="Trae dos hojas: los datos y las instrucciones con los valores admitidos."
            acciones={
              <Button
                onClick={() => void descargarPlantillaProgramas()}
                iconoIzq={<Download className="size-4" />}
              >
                Descargar plantilla .xlsx
              </Button>
            }
          />
          <p className="px-4 pb-4 text-body-sm text-fg-muted">
            La columna que empareja es <strong>snies</strong>: si el código ya existe, el programa
            se actualiza; si no, se crea. El <strong>registro único</strong> es opcional. Y una
            celda vacía en una fila que actualiza significa «no lo sé», nunca «bórralo».
          </p>
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
              <Badge tono="exito">{fmtNumero.format(aCrear)} se crean</Badge>
              <Badge tono="primario">{fmtNumero.format(aActualizar)} se actualizan</Badge>
              {conError > 0 && (
                <Badge tono="peligro">{fmtNumero.format(conError)} con error</Badge>
              )}
            </div>

            <TableShell>
              <thead>
                <tr>
                  <Th className="w-14">Fila</Th>
                  <Th className="w-24">SNIES</Th>
                  <Th className="w-28">Registro único</Th>
                  <Th>Programa</Th>
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
                      <Td className="font-mono text-fg-muted">{f.snies ?? '—'}</Td>
                      <Td className="font-mono text-fg-subtle">{f.registro_unico ?? 'N/A'}</Td>
                      <Td className="max-w-0">
                        <span className="block truncate text-fg">{f.nombre ?? '—'}</span>
                        <span className="block truncate text-body-sm text-fg-subtle">
                          {f.facultad ?? '—'}
                        </span>
                      </Td>
                      <Td>
                        <Badge
                          tono={
                            f.accion === 'error'
                              ? 'peligro'
                              : f.accion === 'crear'
                                ? 'exito'
                                : 'primario'
                          }
                        >
                          {f.accion === 'error'
                            ? 'Error'
                            : f.accion === 'crear'
                              ? 'Crear'
                              : 'Actualizar'}
                        </Badge>
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
            <div className="mt-3">
              <Button variante="primario" onClick={() => navigate('/planeacion/programas')}>
                Ver los programas
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
