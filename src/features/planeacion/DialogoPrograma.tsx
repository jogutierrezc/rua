import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp, Paperclip, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Campo, Checkbox, Input, Select } from '@/components/ui/Field'
import { Card } from '@/components/ui/primitives'
import {
  BUCKET_REGISTROS,
  MODALIDAD_PROGRAMA,
  NIVEL_PROGRAMA,
  TIPO_CUPOS,
} from './dominio'
import type {
  ModalidadPrograma,
  NivelPrograma,
  ProgramaUdesDetalleRow,
  TipoCupos,
} from '@/types/database'

/** Vigencia habitual de un registro calificado en Colombia. */
const ANOS_VIGENCIA_RC = 7

const VACIO = {
  registro_unico: '',
  snies: '',
  facultad: '',
  nivel: 'profesional' as NivelPrograma,
  nombre: '',
  campus: '',
  modalidad: 'presencial' as ModalidadPrograma,
  rc_resolucion: '',
  rc_fecha_registro: '',
  rc_fecha_vencimiento: '',
  ac_resolucion: '',
  ac_fecha_resolucion: '',
  cupos_aprobados: '',
  tipo_cupos: '' as TipoCupos | '',
  ano_creacion: '',
  cumple_ci_para_ac: false,
}

type Formulario = typeof VACIO

/** Clave de Storage segura: sin tildes, espacios ni caracteres de ruta. */
function nombreSeguro(nombre: string) {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function DialogoPrograma({
  programa,
  onCerrar,
}: {
  /** Nulo: alta. Con programa: edición. */
  programa: ProgramaUdesDetalleRow | null
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const [f, setF] = useState<Formulario>(VACIO)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [tocado, setTocado] = useState(false)

  useEffect(() => {
    if (!programa) return
    setF({
      registro_unico: programa.registro_unico ?? '',
      snies: programa.snies,
      facultad: programa.facultad,
      nivel: programa.nivel,
      nombre: programa.nombre,
      campus: programa.campus,
      modalidad: programa.modalidad,
      rc_resolucion: programa.rc_resolucion ?? '',
      rc_fecha_registro: programa.rc_fecha_registro ?? '',
      rc_fecha_vencimiento: programa.rc_fecha_vencimiento ?? '',
      ac_resolucion: programa.ac_resolucion ?? '',
      ac_fecha_resolucion: programa.ac_fecha_resolucion ?? '',
      cupos_aprobados: programa.cupos_aprobados?.toString() ?? '',
      tipo_cupos: programa.tipo_cupos ?? '',
      ano_creacion: programa.ano_creacion?.toString() ?? '',
      cumple_ci_para_ac: programa.cumple_ci_para_ac,
    })
  }, [programa])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const set = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) =>
    setF((prev) => ({ ...prev, [campo]: valor }))

  /**
   * Al escribir la fecha de registro se propone el vencimiento a siete años.
   *
   * Se PROPONE, no se impone: el plazo habitual es ése, pero una resolución
   * puede decir otra cosa y el dato que manda es el de la resolución. Sólo se
   * rellena si el campo está vacío, para no pisar lo que alguien ya escribió.
   */
  function alCambiarFechaRegistro(valor: string) {
    setF((prev) => {
      if (!valor || prev.rc_fecha_vencimiento) return { ...prev, rc_fecha_registro: valor }
      const d = new Date(`${valor}T00:00:00`)
      if (Number.isNaN(d.getTime())) return { ...prev, rc_fecha_registro: valor }
      d.setFullYear(d.getFullYear() + ANOS_VIGENCIA_RC)
      return {
        ...prev,
        rc_fecha_registro: valor,
        rc_fecha_vencimiento: d.toISOString().slice(0, 10),
      }
    })
  }

  const errores: Record<string, string> = {}
  // El SNIES es lo que identifica al programa frente al Ministerio y lo que
  // empareja las filas al importar; el registro único es interno y puede no
  // existir todavía.
  if (f.snies.trim().length < 3) errores.snies = 'El código SNIES es obligatorio.'
  if (f.nombre.trim().length < 4) errores.nombre = 'Escribe el nombre completo del programa.'
  if (!f.facultad.trim()) errores.facultad = 'Indica la facultad.'
  if (!f.campus.trim()) errores.campus = 'Indica el campus.'
  if (
    f.rc_fecha_registro &&
    f.rc_fecha_vencimiento &&
    f.rc_fecha_vencimiento <= f.rc_fecha_registro
  ) {
    errores.rc_fecha_vencimiento = 'El vencimiento tiene que ser posterior al registro.'
  }
  const valido = Object.keys(errores).length === 0
  const ver = (campo: string) => (tocado ? errores[campo] ?? null : null)

  const guardar = useMutation({
    mutationFn: async () => {
      // El archivo primero. Si la subida falla, no queremos una fila que diga
      // que tiene resolución adjunta y un bucket que no la tenga.
      let ruta = programa?.rc_archivo_ruta ?? null
      let nombreArchivo = programa?.rc_archivo_nombre ?? null

      if (archivo) {
        const clave = `${nombreSeguro(f.registro_unico || f.snies) || 'programa'}/${Date.now()}-${nombreSeguro(
          archivo.name,
        )}`
        const { error } = await supabase.storage
          .from(BUCKET_REGISTROS)
          .upload(clave, archivo, { upsert: false, contentType: archivo.type })
        if (error) throw error
        ruta = clave
        nombreArchivo = archivo.name
      }

      const fila = {
        registro_unico: f.registro_unico.trim() || null,
        snies: f.snies.trim(),
        facultad: f.facultad.trim(),
        nivel: f.nivel,
        nombre: f.nombre.trim(),
        campus: f.campus.trim(),
        modalidad: f.modalidad,
        rc_resolucion: f.rc_resolucion.trim() || null,
        rc_fecha_registro: f.rc_fecha_registro || null,
        rc_fecha_vencimiento: f.rc_fecha_vencimiento || null,
        rc_archivo_ruta: ruta,
        rc_archivo_nombre: nombreArchivo,
        ac_resolucion: f.ac_resolucion.trim() || null,
        ac_fecha_resolucion: f.ac_fecha_resolucion || null,
        cupos_aprobados: f.cupos_aprobados ? Number(f.cupos_aprobados) : null,
        tipo_cupos: f.tipo_cupos || null,
        ano_creacion: f.ano_creacion ? Number(f.ano_creacion) : null,
        cumple_ci_para_ac: f.cumple_ci_para_ac,
      }

      if (programa) {
        const { error } = await supabase
          .from('programas_udes')
          .update(fila)
          .eq('id', programa.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('programas_udes').insert(fila)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(programa ? 'Programa actualizado' : 'Programa registrado')
      void qc.invalidateQueries({ queryKey: ['programas'] })
      onCerrar()
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (valido) guardar.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onCerrar}
        aria-hidden
      />

      <form
        onSubmit={onSubmit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-label={programa ? `Editar ${programa.nombre}` : 'Nuevo programa'}
        className={cn(
          'relative my-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface shadow-overlay',
          'motion-safe:animate-[fade-rise_220ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-title text-fg">
              {programa ? 'Editar programa' : 'Nuevo programa'}
            </h2>
            <p className="mt-0.5 text-body-sm text-fg-muted">
              Los datos del registro calificado alimentan la cuenta atrás y el preaviso de
              vencimiento.
            </p>
          </div>
          <Button
            variante="fantasma"
            tamano="sm"
            soloIcono
            aria-label="Cerrar"
            onClick={onCerrar}
            iconoIzq={<X className="size-4" />}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas p-4">
          <div className="flex flex-col gap-4">
            {/* Identificación ------------------------------------------- */}
            <Card className="grid gap-4 p-4 sm:grid-cols-6">
              <Campo
                etiqueta="Código SNIES"
                requerido
                error={ver('snies')}
                className="sm:col-span-2"
                pista="Lo asigna el Ministerio. Identifica al programa."
              >
                {({ id, describedBy, invalido }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalido}
                    inputMode="numeric"
                    placeholder="105432"
                    value={f.snies}
                    onChange={(e) => set('snies', e.target.value)}
                  />
                )}
              </Campo>

              <Campo
                etiqueta="Registro único"
                className="sm:col-span-2"
                pista="Opcional. Identificador interno de la Universidad."
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    placeholder="PRG-0142"
                    value={f.registro_unico}
                    onChange={(e) => set('registro_unico', e.target.value)}
                  />
                )}
              </Campo>

              <Campo etiqueta="Año de creación" className="sm:col-span-2">
                {({ id }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    placeholder="2014"
                    value={f.ano_creacion}
                    onChange={(e) => set('ano_creacion', e.target.value.replace(/\D/g, ''))}
                  />
                )}
              </Campo>

              <Campo etiqueta="Nombre del programa" requerido error={ver('nombre')} className="sm:col-span-6">
                {({ id, describedBy, invalido }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalido}
                    placeholder="Ingeniería de Sistemas"
                    value={f.nombre}
                    onChange={(e) => set('nombre', e.target.value)}
                  />
                )}
              </Campo>

              <Campo etiqueta="Facultad" requerido error={ver('facultad')} className="sm:col-span-3">
                {({ id, describedBy, invalido }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalido}
                    placeholder="Facultad de Ingenierías"
                    value={f.facultad}
                    onChange={(e) => set('facultad', e.target.value)}
                  />
                )}
              </Campo>

              <Campo etiqueta="Campus" requerido error={ver('campus')} className="sm:col-span-3">
                {({ id, describedBy, invalido }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalido}
                    placeholder="Bucaramanga"
                    value={f.campus}
                    onChange={(e) => set('campus', e.target.value)}
                  />
                )}
              </Campo>

              <Campo etiqueta="Nivel" requerido className="sm:col-span-3">
                {({ id }) => (
                  <Select
                    id={id}
                    value={f.nivel}
                    onChange={(e) => set('nivel', e.target.value as NivelPrograma)}
                  >
                    {Object.entries(NIVEL_PROGRAMA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
              </Campo>

              <Campo etiqueta="Modalidad" requerido className="sm:col-span-3">
                {({ id }) => (
                  <Select
                    id={id}
                    value={f.modalidad}
                    onChange={(e) => set('modalidad', e.target.value as ModalidadPrograma)}
                  >
                    {Object.entries(MODALIDAD_PROGRAMA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
              </Campo>
            </Card>

            {/* Registro calificado -------------------------------------- */}
            <Card>
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-label text-fg">Registro calificado vigente</h3>
                <p className="mt-0.5 text-body-sm text-fg-subtle">
                  De estas fechas sale la cuenta atrás y el preaviso de los tres meses.
                </p>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                <Campo etiqueta="N.º de resolución">
                  {({ id }) => (
                    <Input
                      id={id}
                      placeholder="012345 de 2019"
                      value={f.rc_resolucion}
                      onChange={(e) => set('rc_resolucion', e.target.value)}
                    />
                  )}
                </Campo>

                <Campo etiqueta="Fecha de registro">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="date"
                      value={f.rc_fecha_registro}
                      onChange={(e) => alCambiarFechaRegistro(e.target.value)}
                    />
                  )}
                </Campo>

                <Campo
                  etiqueta="Fecha de vencimiento"
                  error={ver('rc_fecha_vencimiento')}
                  pista={`Se propone a ${ANOS_VIGENCIA_RC} años; manda la resolución.`}
                >
                  {({ id, describedBy, invalido }) => (
                    <Input
                      id={id}
                      type="date"
                      aria-describedby={describedBy}
                      aria-invalid={invalido}
                      value={f.rc_fecha_vencimiento}
                      onChange={(e) => set('rc_fecha_vencimiento', e.target.value)}
                    />
                  )}
                </Campo>

                <Campo
                  etiqueta="Resolución escaneada"
                  className="sm:col-span-3"
                  pista="PDF o imagen, hasta 20 MB. Se guarda en un almacén privado y sólo se abre con enlace firmado."
                >
                  {({ id, describedBy }) => (
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        id={id}
                        aria-describedby={describedBy}
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                        className={cn(
                          'block w-full max-w-md text-body-sm text-fg-muted',
                          'file:mr-3 file:rounded-md file:border file:border-line file:bg-surface',
                          'file:px-3 file:py-1.5 file:text-body-sm file:text-fg',
                          'file:transition-colors file:duration-fast hover:file:bg-surface-muted',
                        )}
                      />
                      {archivo ? (
                        <span className="flex items-center gap-1.5 text-body-sm text-success">
                          <FileUp aria-hidden className="size-4" />
                          {archivo.name}
                        </span>
                      ) : (
                        programa?.rc_archivo_nombre && (
                          <span className="flex items-center gap-1.5 text-body-sm text-fg-subtle">
                            <Paperclip aria-hidden className="size-4" />
                            Ya tiene: {programa.rc_archivo_nombre}
                          </span>
                        )
                      )}
                    </div>
                  )}
                </Campo>
              </div>
            </Card>

            {/* Acreditación y cupos ------------------------------------- */}
            <Card>
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-label text-fg">Acreditación y cupos</h3>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-4">
                <Campo etiqueta="Resolución de acreditación" className="sm:col-span-2">
                  {({ id }) => (
                    <Input
                      id={id}
                      placeholder="006789 de 2022"
                      value={f.ac_resolucion}
                      onChange={(e) => set('ac_resolucion', e.target.value)}
                    />
                  )}
                </Campo>

                <Campo etiqueta="Fecha de la resolución" className="sm:col-span-2">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="date"
                      value={f.ac_fecha_resolucion}
                      onChange={(e) => set('ac_fecha_resolucion', e.target.value)}
                    />
                  )}
                </Campo>

                <Campo etiqueta="Cupos aprobados" className="sm:col-span-2">
                  {({ id }) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      placeholder="120"
                      value={f.cupos_aprobados}
                      onChange={(e) => set('cupos_aprobados', e.target.value.replace(/\D/g, ''))}
                    />
                  )}
                </Campo>

                <Campo etiqueta="Tipo de cupos" className="sm:col-span-2">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={f.tipo_cupos}
                      onChange={(e) => set('tipo_cupos', e.target.value as TipoCupos | '')}
                    >
                      <option value="">Sin definir</option>
                      {Object.entries(TIPO_CUPOS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  )}
                </Campo>

                <div className="sm:col-span-4">
                  <Checkbox
                    etiqueta="Cumple las Condiciones Iniciales para Acreditación en Alta Calidad"
                    descripcion="Marca lo que ya se verificó, no lo que se espera cumplir."
                    checked={f.cumple_ci_para_ac}
                    onChange={(e) => set('cumple_ci_para_ac', e.target.checked)}
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line p-4">
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button
            type="submit"
            variante="primario"
            cargando={guardar.isPending}
            iconoIzq={<Save className="size-4" />}
          >
            {programa ? 'Guardar cambios' : 'Registrar programa'}
          </Button>
        </footer>
      </form>
    </div>
  )
}
