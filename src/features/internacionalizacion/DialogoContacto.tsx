import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Campo, Input, Select, Textarea } from '@/components/ui/Field'
import { useCatalogo, usePaises, paisesPorRegion } from './useCatalogos'
import type { ContactoDetalleRow } from '@/types/database'

/**
 * Las mismas reglas que aplica la importación, aquí.
 *
 * No es duplicación por descuido: la base las impone igual —hay constraints y
 * funciones que las repiten—, y lo que se gana en el formulario es decirlo ANTES
 * de enviar, junto al campo. Descubrir que el nombre no vale porque el servidor
 * devolvió un 23514 es la peor forma de enterarse.
 */
const RE_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/

function problemaNombre(v: string): string | null {
  const t = v.trim().replace(/\s+/g, ' ')
  if (!t) return 'Falta el nombre.'
  if (/[0-9]/.test(t)) return 'El nombre no puede contener números.'
  if (/[@!#$%^&*_=+<>{}()[\]\\/|"]/.test(t)) return 'Contiene símbolos que no corresponden.'
  return null
}

function problemaCargo(v: string): string | null {
  const t = v.trim()
  if (!t) return 'Falta el cargo.'
  if (t.length < 2) return 'Demasiado corto.'
  if (t.includes('@')) return 'Parece un correo, no un cargo.'
  return null
}

function problemaCorreo(v: string): string | null {
  const t = v.trim()
  if (!t) return 'Falta el correo.'
  if (/\s/.test(t)) return 'No puede contener espacios.'
  if (!RE_CORREO.test(t)) return 'No tiene una estructura de correo válida.'
  return null
}

interface Formulario {
  tratamiento: string
  nombres: string
  apellidos: string
  cargo: string
  correo: string
  pais_codigo: string
  rol_id: string
  sector_id: string
  organizacion: string
  departamento: string
  area_conocimiento: string
  fuente: string
  telefono: string
  notas: string
}

const VACIO: Formulario = {
  tratamiento: '',
  nombres: '',
  apellidos: '',
  cargo: '',
  correo: '',
  pais_codigo: '',
  rol_id: '',
  sector_id: '',
  organizacion: '',
  departamento: '',
  area_conocimiento: '',
  fuente: '',
  telefono: '',
  notas: '',
}

export function DialogoContacto({
  contacto,
  onCerrar,
}: {
  contacto: ContactoDetalleRow | null
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const editando = Boolean(contacto)

  const [f, setF] = useState<Formulario>(() =>
    contacto
      ? {
          tratamiento: contacto.tratamiento ?? '',
          nombres: contacto.nombres ?? '',
          apellidos: contacto.apellidos ?? '',
          cargo: contacto.cargo,
          correo: contacto.correo,
          pais_codigo: contacto.pais_codigo ?? '',
          rol_id: contacto.rol_id ?? '',
          sector_id: contacto.sector_id ?? '',
          organizacion: contacto.organizacion ?? '',
          departamento: contacto.departamento ?? '',
          area_conocimiento: contacto.area_conocimiento ?? '',
          fuente: contacto.fuente ?? '',
          telefono: contacto.telefono ?? '',
          notas: contacto.notas ?? '',
        }
      : VACIO,
  )
  const [tocado, setTocado] = useState(false)

  const { data: paises } = usePaises()
  const { data: roles } = useCatalogo('rol')
  const { data: sectores } = useCatalogo('sector')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  /**
   * El nombre se captura partido y el completo se compone.
   *
   * Al revés que antes, y a propósito: las plantillas de nominación exigen las
   * dos columnas por separado, así que si se guardara sólo el nombre entero
   * habría que adivinar dónde parte cada vez que se exporta. Adivinarlo una vez,
   * al importar una hoja que no venía partida, es inevitable; adivinarlo también
   * cuando alguien lo teclea aquí sería elegir hacerlo mal a sabiendas.
   */
  const nombreCompleto = `${f.nombres} ${f.apellidos}`.trim().replace(/\s+/g, ' ')

  const errores = {
    nombres: problemaNombre(f.nombres),
    apellidos: problemaNombre(f.apellidos),
    cargo: problemaCargo(f.cargo),
    correo: problemaCorreo(f.correo),
    pais_codigo: f.pais_codigo ? null : 'Elige un país.',
    rol_id: f.rol_id ? null : 'Elige un rol.',
    sector_id: f.sector_id ? null : 'Elige un sector.',
  }
  const valido = Object.values(errores).every((e) => e === null)

  /**
   * Cambiar el correo de un contacto ya verificado borra su veredicto — lo hace
   * un trigger en la base—. Se avisa antes, porque no es obvio y porque la
   * alternativa sería que el usuario descubriera solo que perdió una
   * verificación al guardar una errata corregida.
   */
  const perderaVerificacion =
    editando &&
    contacto!.verificacion_estado !== 'sin_verificar' &&
    f.correo.trim().toLowerCase() !== contacto!.correo.toLowerCase()

  const guardar = useMutation({
    mutationFn: async () => {
      const limpio = (v: string) => v.trim().replace(/\s+/g, ' ') || null

      const valores = {
        nombre_completo: nombreCompleto,
        nombres: limpio(f.nombres),
        apellidos: limpio(f.apellidos),
        tratamiento: limpio(f.tratamiento),
        cargo: f.cargo.trim().replace(/\s+/g, ' '),
        correo: f.correo.trim().toLowerCase(),
        pais_codigo: f.pais_codigo,
        rol_id: f.rol_id,
        sector_id: f.sector_id,
        organizacion: limpio(f.organizacion),
        departamento: limpio(f.departamento),
        area_conocimiento: limpio(f.area_conocimiento),
        fuente: limpio(f.fuente),
        telefono: f.telefono.trim() || null,
        notas: f.notas.trim() || null,
      }

      if (contacto) {
        const { error } = await supabase
          .from('contactos_internacionales')
          .update(valores)
          .eq('id', contacto.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('contactos_internacionales').insert(valores)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contactos'] })
      toast.success(editando ? 'Contacto actualizado.' : 'Contacto creado.')
      onCerrar()
    },
    onError: (e) => {
      const err = e as { code?: string }
      // El único choque probable es el correo: es la identidad del contacto.
      if (err.code === '23505') {
        toast.error('Ya existe un contacto con ese correo.')
        return
      }
      toast.error(mensajeDeError(e))
    },
  })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTocado(true)
    if (valido) guardar.mutate()
  }

  const campo = (clave: keyof typeof errores) => (tocado ? errores[clave] : null)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onCerrar}
        aria-hidden
      />

      <form
        onSubmit={enviar}
        role="dialog"
        aria-modal="true"
        aria-label={editando ? 'Editar contacto' : 'Nuevo contacto'}
        className={cn(
          'relative my-auto flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface shadow-overlay',
          'motion-safe:animate-[fade-rise_220ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-title-sm text-fg">
              {editando ? 'Editar contacto' : 'Nuevo contacto'}
            </h2>
            <p className="mt-0.5 text-body-sm text-fg-subtle">
              El correo es la identidad del contacto: es con lo que se empareja al importar.
            </p>
          </div>
          <Button
            variante="fantasma"
            soloIcono
            aria-label="Cerrar"
            onClick={onCerrar}
            iconoIzq={<X className="size-4" />}
          />
        </header>

        <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-6">
          <Campo etiqueta="Tratamiento" className="sm:col-span-1">
            {({ id }) => (
              <Input
                id={id}
                maxLength={20}
                value={f.tratamiento}
                onChange={(e) => setF({ ...f, tratamiento: e.target.value })}
                placeholder="Dr."
              />
            )}
          </Campo>

          <Campo
            etiqueta="Nombres"
            requerido
            error={campo('nombres')}
            className="sm:col-span-2"
          >
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                autoFocus
                aria-describedby={describedBy}
                aria-invalid={invalido}
                value={f.nombres}
                onChange={(e) => setF({ ...f, nombres: e.target.value })}
                placeholder="María Fernanda"
              />
            )}
          </Campo>

          <Campo
            etiqueta="Apellidos"
            requerido
            error={campo('apellidos')}
            className="sm:col-span-3"
            pista="Se guardan por separado porque las plantillas de nominación los piden en su propia columna."
          >
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                value={f.apellidos}
                onChange={(e) => setF({ ...f, apellidos: e.target.value })}
                placeholder="Ruiz Gómez"
              />
            )}
          </Campo>

          <Campo etiqueta="Cargo" requerido error={campo('cargo')} className="sm:col-span-3">
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                value={f.cargo}
                onChange={(e) => setF({ ...f, cargo: e.target.value })}
                placeholder="Directora de Relaciones Internacionales"
              />
            )}
          </Campo>

          <Campo
            etiqueta="Correo"
            requerido
            error={campo('correo')}
            className="sm:col-span-3"
            pista={
              perderaVerificacion
                ? undefined
                : 'Al guardar sólo se comprueba su estructura; que el buzón exista se verifica aparte.'
            }
          >
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                aria-describedby={describedBy}
                aria-invalid={invalido}
                value={f.correo}
                onChange={(e) => setF({ ...f, correo: e.target.value })}
                placeholder="mf.ruiz@universidad.mx"
              />
            )}
          </Campo>

          <Campo etiqueta="País" requerido error={campo('pais_codigo')} className="sm:col-span-2">
            {({ id, describedBy, invalido }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                value={f.pais_codigo}
                onChange={(e) => setF({ ...f, pais_codigo: e.target.value })}
              >
                <option value="">Elige un país…</option>
                {paisesPorRegion(paises ?? []).map(([region, lista]) => (
                  <optgroup key={region} label={region}>
                    {lista.map((p) => (
                      <option key={p.codigo} value={p.codigo}>
                        {p.nombre}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Campo>

          <Campo etiqueta="Rol" requerido error={campo('rol_id')} className="sm:col-span-2">
            {({ id, describedBy, invalido }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                value={f.rol_id}
                onChange={(e) => setF({ ...f, rol_id: e.target.value })}
              >
                <option value="">Elige un rol…</option>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.etiqueta}
                  </option>
                ))}
              </Select>
            )}
          </Campo>

          <Campo etiqueta="Sector" requerido error={campo('sector_id')} className="sm:col-span-2">
            {({ id, describedBy, invalido }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                value={f.sector_id}
                onChange={(e) => setF({ ...f, sector_id: e.target.value })}
              >
                <option value="">Elige un sector…</option>
                {(sectores ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.etiqueta}
                  </option>
                ))}
              </Select>
            )}
          </Campo>

          <Campo etiqueta="Organización" className="sm:col-span-3">
            {({ id }) => (
              <Input
                id={id}
                value={f.organizacion}
                onChange={(e) => setF({ ...f, organizacion: e.target.value })}
                placeholder="Universidad Nacional Autónoma de México"
              />
            )}
          </Campo>

          <Campo etiqueta="Departamento o unidad" className="sm:col-span-3">
            {({ id }) => (
              <Input
                id={id}
                value={f.departamento}
                onChange={(e) => setF({ ...f, departamento: e.target.value })}
                placeholder="Facultad de Ingeniería"
              />
            )}
          </Campo>

          <Campo etiqueta="Área de conocimiento" className="sm:col-span-3">
            {({ id }) => (
              <Input
                id={id}
                value={f.area_conocimiento}
                onChange={(e) => setF({ ...f, area_conocimiento: e.target.value })}
                placeholder="Ingeniería de Sistemas"
              />
            )}
          </Campo>

          <Campo etiqueta="Teléfono" className="sm:col-span-3">
            {({ id }) => (
              <Input
                id={id}
                value={f.telefono}
                onChange={(e) => setF({ ...f, telefono: e.target.value })}
                placeholder="+52 55 1234 5678"
              />
            )}
          </Campo>

          <Campo
            etiqueta="Origen de la nominación"
            className="sm:col-span-6"
            pista="De dónde salió este contacto: el convenio, el congreso o quien lo propuso. Es lo que permite rendir cuentas de una lista meses después."
          >
            {({ id }) => (
              <Input
                id={id}
                value={f.fuente}
                onChange={(e) => setF({ ...f, fuente: e.target.value })}
                placeholder="Convenio de movilidad 2026"
              />
            )}
          </Campo>

          <Campo etiqueta="Notas" className="sm:col-span-6">
            {({ id }) => (
              <Textarea
                id={id}
                rows={3}
                value={f.notas}
                onChange={(e) => setF({ ...f, notas: e.target.value })}
                placeholder="Contexto para quien lea esta ficha más adelante: de qué convenio viene, con quién se habló."
              />
            )}
          </Campo>

          {perderaVerificacion && (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning-softFg sm:col-span-6">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              Al cambiar el correo se borrará su verificación: el veredicto actual es de la
              dirección anterior, no de la nueva. Habrá que verificarlo otra vez.
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line p-4">
          <p className="min-w-0 truncate text-body-sm text-fg-subtle">
            {nombreCompleto && <>Se guardará como «{nombreCompleto}».</>}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" variante="primario" cargando={guardar.isPending}>
              {editando ? 'Guardar cambios' : 'Crear contacto'}
            </Button>
          </div>
        </footer>
      </form>
    </div>
  )
}
