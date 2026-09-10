import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Briefcase, GraduationCap, Table2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Campo, Input, Select, Textarea } from '@/components/ui/Field'
import { useCatalogo, usePaises, paisesPorRegion } from './useCatalogos'
import { ORIGEN_CONTACTO } from './dominio'
import type { ContactoDetalleRow, TipoContactoInternacional } from '@/types/database'

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

/**
 * A qué lista reporta el contacto, y qué campos trae cada una.
 *
 * El formulario no es uno con campos de más: es el reflejo de la plantilla que
 * corresponde. Un contacto académico tiene departamento y área de conocimiento;
 * uno de empleador tiene sector, y su sector viene de la columna «Industry». Al
 * académico no se le pregunta el sector porque su plantilla no lo trae — todo el
 * que está en ella trabaja en educación superior, y preguntarlo sería pedir un
 * dato que ya se sabe.
 *
 * Las etiquetas llevan al lado el nombre de la columna en la plantilla. Quien
 * rellena esto suele tener el archivo delante, y así no tiene que traducir.
 */
const LISTAS: {
  tipo: TipoContactoInternacional
  nombre: string
  detalle: string
  icono: typeof GraduationCap
}[] = [
  {
    tipo: 'academico',
    nombre: 'Académicos',
    detalle: 'Docentes e investigadores de instituciones socias.',
    icono: GraduationCap,
  },
  {
    tipo: 'empleador',
    nombre: 'Empleadores',
    detalle: 'Empresas y organizaciones que contratan egresados.',
    icono: Briefcase,
  },
  {
    tipo: 'general',
    nombre: 'Ninguna de las dos',
    detalle: 'Un contacto de la libreta que no va a ninguna encuesta de reputación.',
    icono: Table2,
  },
]

/** El sector que se da por supuesto en la lista académica. */
const SECTOR_ACADEMICO = 'Educación superior'

interface Formulario {
  tratamiento: string
  nombres: string
  apellidos: string
  cargo: string
  correo: string
  pais_codigo: string
  rol: string
  sector: string
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
  rol: '',
  sector: '',
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

  // Al crear se pregunta primero a qué lista reporta: de eso dependen los campos
  // que se piden. Al editar ya está decidido, así que se entra directo.
  const [paso, setPaso] = useState<'lista' | 'datos'>(editando ? 'datos' : 'lista')
  const [tipo, setTipo] = useState<TipoContactoInternacional>(
    contacto?.tipo_contacto ?? 'academico',
  )

  const [f, setF] = useState<Formulario>(() =>
    contacto
      ? {
          tratamiento: contacto.tratamiento ?? '',
          nombres: contacto.nombres ?? '',
          apellidos: contacto.apellidos ?? '',
          cargo: contacto.cargo,
          correo: contacto.correo,
          pais_codigo: contacto.pais_codigo ?? '',
          rol: contacto.rol_etiqueta ?? '',
          sector: contacto.sector_etiqueta ?? '',
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

  const esAcademico = tipo === 'academico'
  const esEmpleador = tipo === 'empleador'

  /**
   * El nombre se captura partido y el completo se compone.
   *
   * Las plantillas de nominación exigen las dos columnas por separado, así que
   * guardar sólo el nombre entero obligaría a adivinar dónde parte cada vez que
   * se exporta. Adivinarlo al importar una hoja que no venía partida es
   * inevitable; adivinarlo también cuando alguien lo teclea aquí sería elegir
   * hacerlo mal a sabiendas.
   */
  const nombreCompleto = `${f.nombres} ${f.apellidos}`.trim().replace(/\s+/g, ' ')

  const errores = {
    nombres: problemaNombre(f.nombres),
    apellidos: problemaNombre(f.apellidos),
    cargo: problemaCargo(f.cargo),
    correo: problemaCorreo(f.correo),
  }
  const valido = Object.values(errores).every((e) => e === null)

  const perderaVerificacion =
    editando &&
    contacto!.verificacion_estado !== 'sin_verificar' &&
    f.correo.trim().toLowerCase() !== contacto!.correo.toLowerCase()

  const guardar = useMutation({
    mutationFn: async () => {
      const limpio = (v: string) => v.trim().replace(/\s+/g, ' ') || null

      /**
       * El rol y el sector se resuelven en la BASE, no aquí.
       *
       * `fn_asegurar_catalogo` busca el que ya existe —comparando sin tildes ni
       * mayúsculas—, acepta el casi idéntico si hubo una errata, y sólo crea uno
       * nuevo cuando de verdad no hay ninguno. Es exactamente lo que hace la
       * importación, así que escribir «Banking» aquí y traerlo en una hoja
       * acaban en el mismo sector y no en dos.
       */
      const resolver = async (tipoCatalogo: 'rol' | 'sector', texto: string | null) => {
        if (!texto) return null
        const { data, error } = await supabase.rpc('fn_asegurar_catalogo', {
          p_tipo: tipoCatalogo,
          p_texto: texto,
        })
        if (error) throw error
        return data
      }

      // El académico no elige sector: su plantilla no lo trae porque se da por
      // supuesto. Se aplica el mismo que aplica la importación.
      const sectorTexto = esAcademico ? SECTOR_ACADEMICO : limpio(f.sector)

      const valores = {
        nombre_completo: nombreCompleto,
        nombres: limpio(f.nombres),
        apellidos: limpio(f.apellidos),
        tratamiento: limpio(f.tratamiento),
        cargo: f.cargo.trim().replace(/\s+/g, ' '),
        correo: f.correo.trim().toLowerCase(),
        pais_codigo: f.pais_codigo || null,
        rol_id: await resolver('rol', limpio(f.rol)),
        sector_id: await resolver('sector', sectorTexto),
        organizacion: limpio(f.organizacion),
        // Los campos que la otra plantilla no tiene se dejan como estaban en vez
        // de vaciarlos: cambiar un contacto de lista no debería borrar lo que se
        // sabía de él.
        departamento: esEmpleador ? (contacto?.departamento ?? null) : limpio(f.departamento),
        area_conocimiento: esEmpleador
          ? (contacto?.area_conocimiento ?? null)
          : limpio(f.area_conocimiento),
        fuente: limpio(f.fuente),
        telefono: f.telefono.trim() || null,
        notas: f.notas.trim() || null,
        tipo_contacto: tipo,
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
      // El catálogo puede haber estrenado un valor: los desplegables tienen que
      // enterarse antes de que alguien vuelva a abrir este formulario.
      void qc.invalidateQueries({ queryKey: ['contacto-catalogo'] })
      toast.success(editando ? 'Contacto actualizado.' : 'Contacto creado.')
      onCerrar()
    },
    onError: (e) => {
      const err = e as { code?: string }
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
  const nombreLista = LISTAS.find((l) => l.tipo === tipo)?.nombre ?? ORIGEN_CONTACTO[tipo]

  // ---------------------------------------------------------------------------
  // Paso 1 · A qué lista reporta
  // ---------------------------------------------------------------------------
  if (paso === 'lista') {
    return (
      <Marco etiqueta="Nuevo contacto" onCerrar={onCerrar}>
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-title-sm text-fg">¿A qué lista reporta este contacto?</h2>
            <p className="mt-0.5 text-body-sm text-fg-subtle">
              De esto dependen los datos que se piden: cada lista tiene su propia plantilla.
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

        <div className="flex flex-col gap-2 overflow-y-auto p-4">
          {LISTAS.map((l) => {
            const Icono = l.icono
            return (
              <button
                key={l.tipo}
                onClick={() => {
                  setTipo(l.tipo)
                  setPaso('datos')
                }}
                className={cn(
                  'flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-left',
                  'transition-[border-color,background-color] duration-fast ease-out',
                  'hover:border-primary hover:bg-primary-soft',
                )}
              >
                <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                <span className="min-w-0">
                  <span className="block text-label text-fg">{l.nombre}</span>
                  <span className="block text-body-sm text-fg-subtle">{l.detalle}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Marco>
    )
  }

  // ---------------------------------------------------------------------------
  // Paso 2 · Los datos de esa lista
  // ---------------------------------------------------------------------------
  return (
    <Marco etiqueta={editando ? 'Editar contacto' : 'Nuevo contacto'} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-title-sm text-fg">
              {editando ? 'Editar contacto' : `Nuevo contacto · ${nombreLista}`}
            </h2>
            <p className="mt-0.5 text-body-sm text-fg-subtle">
              {esAcademico && 'Los campos son los de la plantilla académica.'}
              {esEmpleador && 'Los campos son los de la plantilla de empleadores.'}
              {tipo === 'general' && 'Todos los campos de la libreta.'}{' '}
              El correo es la identidad: es con lo que se empareja al importar.
            </p>
          </div>

          {!editando && (
            <Button
              variante="fantasma"
              tamano="sm"
              onClick={() => setPaso('lista')}
              iconoIzq={<ArrowLeft className="size-4" />}
            >
              Cambiar lista
            </Button>
          )}
          <Button
            variante="fantasma"
            soloIcono
            aria-label="Cerrar"
            onClick={onCerrar}
            iconoIzq={<X className="size-4" />}
          />
        </header>

        <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-6">
          {editando && (
            <Campo
              etiqueta="Lista a la que reporta"
              className="sm:col-span-6"
              pista="Cambiarla no borra nada: los datos que la otra plantilla no usa se conservan."
            >
              {({ id }) => (
                <Select
                  id={id}
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoContactoInternacional)}
                >
                  {LISTAS.map((l) => (
                    <option key={l.tipo} value={l.tipo}>
                      {l.nombre}
                    </option>
                  ))}
                </Select>
              )}
            </Campo>
          )}

          <Campo etiqueta="Tratamiento (Title)" className="sm:col-span-1">
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
            etiqueta="Nombres (First Name)"
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
            etiqueta="Apellidos (Last Name)"
            requerido
            error={campo('apellidos')}
            className="sm:col-span-3"
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

          <Campo
            etiqueta={esEmpleador ? 'Cargo (Position)' : 'Cargo (Job Title)'}
            requerido
            error={campo('cargo')}
            className="sm:col-span-3"
          >
            {({ id, describedBy, invalido }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalido}
                value={f.cargo}
                onChange={(e) => setF({ ...f, cargo: e.target.value })}
                placeholder={
                  esEmpleador ? 'Gerente de Talento Humano' : 'Directora de Relaciones Internacionales'
                }
              />
            )}
          </Campo>

          <Campo
            etiqueta="Correo (Email)"
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

          <Campo
            etiqueta={esEmpleador ? 'Empresa (Company Name)' : 'Institución (Institution)'}
            className="sm:col-span-3"
          >
            {({ id }) => (
              <Input
                id={id}
                value={f.organizacion}
                onChange={(e) => setF({ ...f, organizacion: e.target.value })}
                placeholder={
                  esEmpleador ? 'Tecnologías Andinas S.A.S.' : 'Universidad Nacional Autónoma de México'
                }
              />
            )}
          </Campo>

          <Campo etiqueta="País (Country or Territory)" className="sm:col-span-3">
            {({ id }) => (
              <Select
                id={id}
                value={f.pais_codigo}
                onChange={(e) => setF({ ...f, pais_codigo: e.target.value })}
              >
                <option value="">Sin país</option>
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

          {/* Rol y sector se escriben, no se eligen de una lista cerrada.

              Si el que hace falta ya existe, el desplegable del navegador lo
              ofrece al teclear; si no, se escribe y se crea al guardar. Es la
              misma regla que aplica la importación —el vocabulario lo pone quien
              reporta—, y obligar a ir antes a la pantalla del catálogo para dar
              de alta un sector sería fricción por nada. */}
          <Campo
            etiqueta="Rol"
            className="sm:col-span-3"
            pista="Escríbelo aunque no esté en la lista: si es nuevo, se añade al catálogo."
          >
            {({ id }) => (
              <>
                <Input
                  id={id}
                  list={`${id}-roles`}
                  value={f.rol}
                  onChange={(e) => setF({ ...f, rol: e.target.value })}
                  placeholder="Docente, Investigador…"
                />
                <datalist id={`${id}-roles`}>
                  {(roles ?? []).map((r) => (
                    <option key={r.id} value={r.etiqueta} />
                  ))}
                </datalist>
              </>
            )}
          </Campo>

          {esAcademico ? (
            <Campo
              etiqueta="Sector"
              className="sm:col-span-3"
              pista="La plantilla académica no pregunta el sector porque lo da por supuesto."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  value={SECTOR_ACADEMICO}
                  readOnly
                  disabled
                  aria-describedby={describedBy}
                />
              )}
            </Campo>
          ) : (
            <Campo
              etiqueta={esEmpleador ? 'Sector (Industry)' : 'Sector'}
              className="sm:col-span-3"
              pista="Escríbelo aunque no esté en la lista: si es nuevo, se añade al catálogo."
            >
              {({ id }) => (
                <>
                  <Input
                    id={id}
                    list={`${id}-sectores`}
                    value={f.sector}
                    onChange={(e) => setF({ ...f, sector: e.target.value })}
                    placeholder="Banking, Educación superior…"
                  />
                  <datalist id={`${id}-sectores`}>
                    {(sectores ?? []).map((s) => (
                      <option key={s.id} value={s.etiqueta} />
                    ))}
                  </datalist>
                </>
              )}
            </Campo>
          )}

          {!esEmpleador && (
            <>
              <Campo etiqueta="Departamento o unidad (Department)" className="sm:col-span-3">
                {({ id }) => (
                  <Input
                    id={id}
                    value={f.departamento}
                    onChange={(e) => setF({ ...f, departamento: e.target.value })}
                    placeholder="Facultad de Ingeniería"
                  />
                )}
              </Campo>

              <Campo etiqueta="Área de conocimiento (Subject)" className="sm:col-span-3">
                {({ id }) => (
                  <Input
                    id={id}
                    value={f.area_conocimiento}
                    onChange={(e) => setF({ ...f, area_conocimiento: e.target.value })}
                    placeholder="Ingeniería de Sistemas"
                  />
                )}
              </Campo>
            </>
          )}

          <Campo etiqueta="Teléfono (Phone)" className="sm:col-span-3">
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
            etiqueta="Origen de la nominación (Source)"
            className="sm:col-span-3"
            pista="De dónde salió: el convenio, el congreso o quien lo propuso."
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
                rows={2}
                value={f.notas}
                onChange={(e) => setF({ ...f, notas: e.target.value })}
                placeholder="Contexto para quien lea esta ficha más adelante."
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
    </Marco>
  )
}

/** El marco del diálogo. Lo comparten los dos pasos para que no parpadee al pasar. */
function Marco({
  etiqueta,
  onCerrar,
  children,
}: {
  etiqueta: string
  onCerrar: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onCerrar}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        className={cn(
          'relative my-auto flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl',
          'border border-line bg-surface shadow-overlay',
          'motion-safe:animate-[fade-rise_220ms_cubic-bezier(0.23,1,0.32,1)_both]',
        )}
      >
        {children}
      </div>
    </div>
  )
}
