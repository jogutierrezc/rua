import { normalizarCabecera } from './csv'
import { CODIGO_MAX, CODIGO_MIN } from './codigos'
import type { DefinicionPlantilla } from './plantillasContactos'

/**
 * Lectura y escritura de libros de Excel.
 *
 * Las dos librerías se cargan con `import()` dinámico y no en el arranque:
 * sólo hacen falta en la pantalla de importación, y meterlas en el bundle
 * principal cargaría ~200 kB a todo el que abre el panel sin intención de
 * importar nada.
 *
 * Se usan `read-excel-file` y `write-excel-file` en lugar de SheetJS porque el
 * paquete `xlsx` publicado en npm está congelado en 0.18.5 con advisories
 * abiertos (prototype pollution y ReDoS); estos son de navegador, más pequeños
 * y están mantenidos.
 */

export const COLUMNAS_ACTIVIDADES = [
  'codigo',
  'nomenclatura',
  'tipo',
  'padre_codigo',
  'estado',
  'descripcion',
] as const

/** Formatos que el importador reconoce por extensión. */
export type FormatoArchivo = 'xlsx' | 'csv' | 'xls-antiguo' | 'desconocido'

export function detectarFormato(nombre: string): FormatoArchivo {
  const ext = nombre.toLowerCase().split('.').pop() ?? ''
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx'
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return 'csv'
  // El .xls de Excel 97-2003 es BIFF8: un formato binario distinto, no un
  // .xlsx con otro nombre. Se detecta para poder explicarlo en vez de fallar
  // con un error de ZIP corrupto.
  if (ext === 'xls') return 'xls-antiguo'
  return 'desconocido'
}

export const MENSAJE_XLS_ANTIGUO =
  'Los archivos .xls de Excel 97-2003 no son compatibles. Ábrelo en Excel y usa ' +
  'Archivo → Guardar como → Libro de Excel (.xlsx).'

/**
 * Convierte una celda de Excel al texto que espera el importador.
 *
 * Excel decide los tipos por su cuenta: un código como `2026` llega como número
 * y una fecha como `Date`. Todo se normaliza a cadena, porque el validador del
 * servidor trabaja con texto.
 */
function celdaATexto(valor: unknown): string {
  if (valor == null) return ''
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  // Ojo: si alguien escribe un código como 0012, Excel lo guarda como el
  // NÚMERO 12 y aquí ya no hay forma de recuperar el cero. Por eso la hoja de
  // instrucciones pide formatear esa columna como texto.
  if (typeof valor === 'number') return String(valor)
  if (typeof valor === 'boolean') return valor ? 'true' : 'false'
  return String(valor).trim()
}

/**
 * Lee la primera hoja de un .xlsx y devuelve objetos usando la fila 1 como
 * cabecera, con los mismos nombres normalizados que el lector de CSV.
 */
export async function leerExcel(archivo: File): Promise<Record<string, string>[]> {
  const { default: readXlsxFile } = await import('read-excel-file')

  let filas: unknown[][]
  try {
    filas = (await readXlsxFile(archivo)) as unknown[][]
  } catch (e) {
    console.error('Error al leer el libro de Excel:', e)
    throw new Error(
      'No se pudo leer el archivo. Comprueba que sea un .xlsx válido y que no esté protegido con contraseña.',
    )
  }

  if (filas.length < 2) {
    throw new Error(
      'La hoja no tiene datos. La primera fila debe ser la cabecera y la segunda en adelante, las actividades.',
    )
  }

  const cabecera = filas[0].map((c) => normalizarCabecera(celdaATexto(c)))

  const objetos = filas.slice(1).map((fila) => {
    const obj: Record<string, string> = {}
    cabecera.forEach((clave, i) => {
      if (clave) obj[clave] = celdaATexto(fila[i])
    })
    return obj
  })

  // Excel arrastra filas vacías hasta donde alguien alguna vez puso el cursor;
  // se descartan aquí para que no lleguen al validador como errores.
  return objetos.filter((o) => Object.values(o).some((v) => v !== ''))
}

// -----------------------------------------------------------------------------
// Plantilla
// -----------------------------------------------------------------------------

const AZUL = '#1F4F8F'
const GRIS = '#F0F3F7'

type Celda = {
  value?: string
  fontWeight?: 'bold'
  color?: string
  backgroundColor?: string
  align?: 'left' | 'center' | 'right'
  wrap?: boolean
  borderColor?: string
  bottomBorderColor?: string
}

const cabecera = (texto: string): Celda => ({
  value: texto,
  fontWeight: 'bold',
  color: '#FFFFFF',
  backgroundColor: AZUL,
  align: 'left',
})

/** Celda de texto. Una cadena vacía se omite: la librería espera ausencia, no null. */
const texto = (valor: string | null | undefined): Celda =>
  valor ? { value: valor } : {}

const titulo = (valor: string): Celda => ({ value: valor, fontWeight: 'bold' })

/**
 * Genera y descarga la plantilla .xlsx.
 *
 * Dos hojas: la de datos —que es la que se rellena y se vuelve a subir— y una
 * de instrucciones con los valores admitidos. Meter la ayuda en la misma hoja
 * obligaría a borrarla antes de importar, y alguien se olvidaría.
 */
export async function descargarPlantillaExcel() {
  const { default: writeXlsxFile } = await import('write-excel-file')

  const datos: Celda[][] = [
    COLUMNAS_ACTIVIDADES.map((c) => cabecera(c)),
    [
      texto('ACT-010'),
      texto('Vinculación Empresarial'),
      texto('principal'),
      texto(null),
      texto('activa'),
      texto('Convenios y prácticas profesionales'),
    ],
    [
      texto('SUB-010A'),
      texto('Gestión de Convenios'),
      texto('directa'),
      texto('ACT-010'),
      texto('activa'),
      texto(null),
    ],
    [
      texto('AP-010A'),
      texto('Seguimiento de Estudiantes en Práctica'),
      texto('apoyo'),
      texto('SUB-010A'),
      texto('activa'),
      texto(null),
    ],
  ]

  const instrucciones: Celda[][] = [
    [
      { value: 'Columna', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: '¿Obligatoria?', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: 'Valores admitidos', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: 'Notas', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
    ],
    [
      titulo('codigo'),
      texto('Sí'),
      texto(`Mayúsculas, números y guiones (${CODIGO_MIN} a ${CODIGO_MAX})`),
      {
        value:
          'Único en todo el sistema. Ej.: ACT-010, SUB-010A. Si tus códigos empiezan por cero, formatea la columna como Texto: Excel convierte 0012 en 12.',
        wrap: true,
      },
    ],
    [
      titulo('nomenclatura'),
      texto('Sí'),
      texto('Texto libre, mínimo 3 caracteres'),
      { value: 'El nombre oficial de la actividad.', wrap: true },
    ],
    [
      titulo('tipo'),
      texto('Sí'),
      texto('principal · directa · apoyo'),
      { value: 'Una principal es raíz; las demás cuelgan de otra.', wrap: true },
    ],
    [
      titulo('padre_codigo'),
      texto('Depende'),
      texto('Un código de esta misma hoja o ya existente'),
      {
        value:
          'Vacío en las principales, obligatorio en directa y apoyo. Puede apuntar a una fila posterior: el orden no importa.',
        wrap: true,
      },
    ],
    [
      titulo('estado'),
      texto('No'),
      texto('borrador · activa · revision · archivada'),
      { value: 'Si se deja vacío, se asume "activa".', wrap: true },
    ],
    [
      titulo('descripcion'),
      texto('No'),
      texto('Texto libre'),
      { value: 'Contexto para quien consulte la rama más adelante.', wrap: true },
    ],
    [texto(null), texto(null), texto(null), texto(null)],
    [
      { value: 'Cómo se usa', fontWeight: 'bold', backgroundColor: GRIS },
      { backgroundColor: GRIS },
      { backgroundColor: GRIS },
      { backgroundColor: GRIS },
    ],
    [
      {
        value:
          '1. Rellena la hoja "Actividades" — borra las tres filas de ejemplo antes de subirla.',
        wrap: true,
      },
    ],
    [{ value: '2. Guarda el archivo en formato .xlsx.', wrap: true }],
    [
      {
        value:
          '3. Súbelo en Estructura de Actividades → Importar. Verás una previsualización antes de aplicar nada.',
        wrap: true,
      },
    ],
    [
      {
        value:
          'Un código que ya exista se ACTUALIZA en vez de duplicarse. Si una fila tiene errores, no se importa nada: la carga es todo o nada.',
        wrap: true,
      },
    ],
  ]

  await writeXlsxFile([datos, instrucciones], {
    sheets: ['Actividades', 'Instrucciones'],
    columns: [
      [
        { width: 16 },
        { width: 42 },
        { width: 14 },
        { width: 16 },
        { width: 14 },
        { width: 46 },
      ],
      [{ width: 18 }, { width: 14 }, { width: 42 }, { width: 58 }],
    ],
    fileName: 'plantilla-actividades.xlsx',
  })
}

/**
 * Exporta la estructura a .xlsx con el MISMO formato que acepta la importación.
 *
 * Es lo que cierra el ciclo: exportar, editar en Excel y volver a subir. Un
 * formato de salida distinto al de entrada rompería ese flujo.
 */
export async function exportarActividadesExcel(
  filas: Record<(typeof COLUMNAS_ACTIVIDADES)[number], string>[],
  nombreArchivo: string,
) {
  const { default: writeXlsxFile } = await import('write-excel-file')

  const datos: Celda[][] = [
    COLUMNAS_ACTIVIDADES.map((c) => cabecera(c)),
    ...filas.map((f) => COLUMNAS_ACTIVIDADES.map((c) => texto(f[c] || null))),
  ]

  await writeXlsxFile(datos, {
    sheet: 'Actividades',
    columns: [
      { width: 16 },
      { width: 42 },
      { width: 14 },
      { width: 16 },
      { width: 14 },
      { width: 46 },
    ],
    fileName: nombreArchivo,
  })
}

// -----------------------------------------------------------------------------
// Programas UDES
// -----------------------------------------------------------------------------

/**
 * Estructura recomendada de la hoja de programas.
 *
 * El servidor acepta además otros nombres para la misma columna —«codigo_snies»
 * por «snies», «nombre_del_programa» por «nombre»—, porque la hoja viene de una
 * oficina que la lleva escribiendo años y obligarla a renombrar cabeceras para
 * poder importar es la fricción que hace que la gente vuelva a teclear a mano.
 * Ésta es la forma canónica, la que se descarga y la que se documenta.
 */
export const COLUMNAS_PROGRAMAS = [
  'registro_unico',
  'snies',
  'facultad',
  'nivel',
  'nombre',
  'campus',
  'modalidad',
  'rc_resolucion',
  'rc_fecha_registro',
  'rc_fecha_vencimiento',
  'ac_resolucion',
  'ac_fecha_resolucion',
  'cupos_aprobados',
  'tipo_cupos',
  'ano_creacion',
  'cumple_ci_para_ac',
] as const

const ANCHOS_PROGRAMAS = [
  { width: 16 }, { width: 12 }, { width: 30 }, { width: 22 }, { width: 44 },
  { width: 18 }, { width: 14 }, { width: 20 }, { width: 18 }, { width: 20 },
  { width: 20 }, { width: 18 }, { width: 14 }, { width: 22 }, { width: 14 },
  { width: 18 },
]

export async function descargarPlantillaProgramas() {
  const { default: writeXlsxFile } = await import('write-excel-file')

  const datos: Celda[][] = [
    COLUMNAS_PROGRAMAS.map((c) => cabecera(c)),
    [
      texto('PRG-0142'),
      texto('105432'),
      texto('Facultad de Ingenierías'),
      texto('Profesional'),
      texto('Ingeniería de Sistemas'),
      texto('Bucaramanga'),
      texto('Presencial'),
      texto('012345 de 2019'),
      texto('2019-08-14'),
      texto('2026-08-14'),
      texto('006789 de 2022'),
      texto('2022-03-02'),
      texto('120'),
      texto('Semestral'),
      texto('2014'),
      texto('Sí'),
    ],
    [
      // Sin registro único: es opcional a propósito, y el ejemplo lo enseña.
      texto(null),
      texto('109877'),
      texto('Facultad de Ciencias de la Salud'),
      texto('Maestría'),
      texto('Maestría en Salud Pública'),
      texto('Valledupar'),
      texto('Virtual'),
      texto('004321 de 2021'),
      texto('15/06/2021'),
      texto('15/06/2028'),
      texto(null),
      texto(null),
      texto('40'),
      texto('Cohorte'),
      texto('2020'),
      texto('No'),
    ],
  ]

  const fila = (
    columna: string,
    obligatoria: string,
    admitidos: string,
    nota: string,
  ): Celda[] => [titulo(columna), texto(obligatoria), texto(admitidos), { value: nota, wrap: true }]

  const instrucciones: Celda[][] = [
    [
      { value: 'Columna', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: '¿Obligatoria?', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: 'Valores admitidos', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: 'Notas', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
    ],
    fila(
      'registro_unico',
      'No',
      'Texto libre',
      'Identificador interno de la Universidad. Puede quedar vacío: en la tabla aparecerá como N/A. Si lo pones, no puede estar ya en otro programa.',
    ),
    fila(
      'snies',
      'Sí',
      'Código del Ministerio',
      'Es la columna que empareja: si el SNIES ya existe, el programa se ACTUALIZA; si no, se crea. Formatea la columna como Texto para que Excel no se coma los ceros a la izquierda.',
    ),
    fila('facultad', 'Sí', 'Texto libre', 'Tal como se nombra oficialmente.'),
    fila(
      'nivel',
      'Sí',
      'Técnico Profesional · Tecnológico · Profesional · Especialización · Especialización médico-quirúrgica · Maestría · Doctorado',
      'Se admite con o sin tildes. «Pregrado» y «Universitario» se entienden como Profesional.',
    ),
    fila('nombre', 'Sí', 'Texto libre', 'El nombre oficial del programa.'),
    fila('campus', 'No', 'Texto libre', 'Si se deja vacío al crear, queda como «Sin campus».'),
    fila(
      'modalidad',
      'Sí',
      'Presencial · A distancia · Virtual · Dual',
      'Se admite con o sin tildes.',
    ),
    fila('rc_resolucion', 'No', 'Texto libre', 'N.º de resolución del registro calificado.'),
    fila(
      'rc_fecha_registro',
      'No',
      'AAAA-MM-DD o DD/MM/AAAA',
      'Sólo esos dos formatos. Adivinar entre 03/04 y 04/03 sería inventarse la fecha.',
    ),
    fila(
      'rc_fecha_vencimiento',
      'No',
      'AAAA-MM-DD o DD/MM/AAAA',
      'De aquí sale la cuenta atrás y el preaviso de los tres meses. Sin ella, el programa se guarda pero queda fuera de la vigilancia.',
    ),
    fila('ac_resolucion', 'No', 'Texto libre', 'N.º de resolución de acreditación.'),
    fila('ac_fecha_resolucion', 'No', 'AAAA-MM-DD o DD/MM/AAAA', ''),
    fila('cupos_aprobados', 'No', 'Número entero', 'Cupos de estudiantes aprobados.'),
    fila(
      'tipo_cupos',
      'No',
      'Trimestral · Semestral · Anual · Cohorte · Variación por cohortes',
      '',
    ),
    fila('ano_creacion', 'No', 'Año de cuatro cifras', ''),
    fila(
      'cumple_ci_para_ac',
      'No',
      'Sí / No',
      'Condiciones Iniciales para Acreditación en Alta Calidad. Se admite Sí, X, 1 o true.',
    ),
    [],
    [
      {
        value:
          'Una celda vacía en una fila que actualiza significa «no lo sé», no «bórralo»: nunca borra un dato que ya estuviera guardado.',
        wrap: true,
      },
    ],
  ]

  await writeXlsxFile([datos, instrucciones], {
    sheets: ['Programas', 'Instrucciones'],
    columns: [ANCHOS_PROGRAMAS, [{ width: 22 }, { width: 14 }, { width: 46 }, { width: 62 }]],
    fileName: 'plantilla-programas.xlsx',
  })
}

// -----------------------------------------------------------------------------
// Contactos internacionales
// -----------------------------------------------------------------------------

/**
 * Estructura recomendada de la hoja de contactos.
 *
 * El servidor acepta además otros nombres para la misma columna —y también en
 * inglés: «email» por «correo», «country» por «país», «position» por «cargo»—,
 * porque una libreta internacional se alimenta de listas de asistentes a
 * congresos y de directorios de universidades socias, que llegan en inglés tan a
 * menudo como en español. Ésta es la forma canónica: la que se descarga y la que
 * se documenta.
 */
export const COLUMNAS_CONTACTOS = [
  'nombre_completo',
  'cargo',
  'pais',
  'correo',
  'rol',
  'sector',
  'organizacion',
  'telefono',
  'notas',
] as const

const ANCHOS_CONTACTOS = [
  { width: 32 },
  { width: 34 },
  { width: 18 },
  { width: 34 },
  { width: 30 },
  { width: 26 },
  { width: 38 },
  { width: 20 },
  { width: 44 },
]

export async function descargarPlantillaContactos() {
  const { default: writeXlsxFile } = await import('write-excel-file')

  const datos: Celda[][] = [
    COLUMNAS_CONTACTOS.map((c) => cabecera(c)),
    [
      texto('María Fernanda Ruiz'),
      texto('Directora de Relaciones Internacionales'),
      texto('México'),
      texto('mf.ruiz@universidad.mx'),
      texto('Coordinador de Internacionalización'),
      texto('Educación superior'),
      texto('Universidad Nacional Autónoma de México'),
      texto('+52 55 1234 5678'),
      texto('Contacto del convenio de movilidad docente 2026.'),
    ],
    [
      // Sin los tres últimos: son opcionales a propósito, y el ejemplo lo enseña.
      texto('John Carter'),
      texto('Research Coordinator'),
      texto('United States'),
      texto('j.carter@stateuniv.edu'),
      texto('Investigador'),
      texto('Investigación y ciencia'),
      texto(null),
      texto(null),
      texto(null),
    ],
  ]

  const fila = (
    columna: string,
    obligatoria: string,
    admitidos: string,
    nota: string,
  ): Celda[] => [titulo(columna), texto(obligatoria), texto(admitidos), { value: nota, wrap: true }]

  const instrucciones: Celda[][] = [
    [
      { value: 'Columna', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: '¿Obligatoria?', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: 'Valores admitidos', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: 'Notas', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
    ],
    fila(
      'nombre_completo',
      'Sí',
      'Nombre y apellido, sin números ni símbolos',
      'Si viene TODO EN MAYÚSCULAS o todo en minúsculas se corrige la escritura al importar, y la previsualización te enseña cómo quedará. Si ya está bien escrito, no se toca.',
    ),
    fila(
      'cargo',
      'Sí',
      'Texto libre, de 2 a 120 caracteres',
      'El cargo tal como lo usa la persona. Se corrige la escritura igual que el nombre.',
    ),
    fila(
      'pais',
      'Recomendada',
      'Nombre del país, su código ISO de dos letras, o su nombre en inglés',
      'Se admiten Colombia, CO, «Estados Unidos», USA y United States. Si la columna no viene, el contacto se importa sin país; si viene y no se reconoce, la fila da error y se te ofrece el más parecido.',
    ),
    fila(
      'correo',
      'Sí',
      'Una dirección de correo válida',
      'Es la columna que EMPAREJA: si el correo ya existe, el contacto se actualiza; si no, se crea. Al importar sólo se comprueba la estructura; que el buzón exista se verifica después, desde Verificación de Correos.',
    ),
    fila(
      'rol',
      'Recomendada',
      'Un valor del catálogo de roles',
      'Directivo, Coordinador de Internacionalización, Docente, Investigador, Gestor de proyectos, Administrativo, Estudiante, Egresado, Consultor u Otro. Si necesitas uno nuevo, créalo antes en Roles y Sectores. Sin la columna, el contacto entra sin clasificar y puede clasificarse después.',
    ),
    fila(
      'sector',
      'Recomendada',
      'Un valor del catálogo de sectores',
      'Educación superior, Investigación y ciencia, Gobierno, Cooperación internacional, Empresa privada, ONG y tercer sector, Salud, Cultura, Organismo multilateral u Otro.',
    ),
    fila('organizacion', 'No', 'Texto libre', 'La institución o empresa a la que pertenece.'),
    fila('telefono', 'No', 'Texto libre', 'Con indicativo del país, si lo sabes.'),
    fila('notas', 'No', 'Texto libre', 'Contexto para quien lea la ficha más adelante.'),
    [],
    [
      { value: 'Si tu hoja ya viene de otro sitio', fontWeight: 'bold', backgroundColor: GRIS },
      { backgroundColor: GRIS },
      { backgroundColor: GRIS },
      { backgroundColor: GRIS },
    ],
    [
      {
        value:
          'No hace falta renombrar las cabeceras. Se reconocen también en inglés y en las formas que usan las plantillas de nominación: First Name y Last Name se unen en el nombre completo, y valen Job Title, Position, Country or Territory, Email, Industry, Institution, Company Name y Phone (Optional).',
        wrap: true,
      },
    ],
    [
      {
        value:
          'Department y Subject no tienen columna propia: se guardan en las notas, que es donde alguien los va a buscar.',
        wrap: true,
      },
    ],
    [],
    [
      {
        value:
          'Un correo repetido DENTRO de la misma hoja se marca como error en la segunda aparición: sin eso, la segunda fila pisaría a la primera en silencio.',
        wrap: true,
      },
    ],
    [
      {
        value:
          'Una celda vacía en una fila que actualiza nunca borra un dato que ya estuviera guardado.',
        wrap: true,
      },
    ],
  ]

  await writeXlsxFile([datos, instrucciones], {
    sheets: ['Contactos', 'Instrucciones'],
    columns: [ANCHOS_CONTACTOS, [{ width: 22 }, { width: 14 }, { width: 46 }, { width: 68 }]],
    fileName: 'plantilla-contactos.xlsx',
  })
}

/**
 * Exporta la libreta a .xlsx con el MISMO formato que acepta la importación.
 *
 * Es lo que cierra el ciclo: exportar, corregir en Excel y volver a subir. Un
 * formato de salida distinto al de entrada rompería ese flujo. Se añaden al
 * final las columnas de la verificación, que son de sólo lectura —la
 * importación las ignora— pero son justo lo que se quiere mirar fuera del
 * portal para decidir a quién se escribe.
 */
export async function exportarContactosExcel(
  filas: Record<string, string>[],
  nombreArchivo: string,
) {
  const { default: writeXlsxFile } = await import('write-excel-file')

  const columnas = [...COLUMNAS_CONTACTOS, 'verificacion', 'verificado_en', 'diagnostico']

  const datos: Celda[][] = [
    columnas.map((c) => cabecera(c)),
    ...filas.map((f) => columnas.map((c) => texto(f[c] || null))),
  ]

  await writeXlsxFile(datos, {
    sheet: 'Contactos',
    columns: [...ANCHOS_CONTACTOS, { width: 16 }, { width: 18 }, { width: 60 }],
    fileName: nombreArchivo,
  })
}

// -----------------------------------------------------------------------------
// Plantillas de nominación (académica y de empleadores)
// -----------------------------------------------------------------------------

/**
 * Genera el .xlsx de una plantilla de nominación.
 *
 * La primera hoja es la plantilla TAL CUAL: sus cabeceras, en su orden, con su
 * grafía original —«Phone (Optional)» incluido— y nada más. Ni una fila de
 * ejemplo, ni una columna de ayuda. Es un formato ajeno que alguien va a
 * rellenar y a devolver a quien se lo pidió, y cualquier añadido nuestro sería
 * algo que esa persona tendría que acordarse de borrar.
 *
 * Los ejemplos y las explicaciones van en una SEGUNDA hoja. Ahí no estorban, y
 * al subir el archivo el importador lee sólo la primera.
 */
export async function descargarPlantillaNominacion(plantilla: DefinicionPlantilla) {
  const { default: writeXlsxFile } = await import('write-excel-file')

  const columnas = [...plantilla.columnas]

  // La hoja de datos: sólo la fila de cabecera.
  const datos: Celda[][] = [columnas.map((c) => cabecera(c))]

  const instrucciones: Celda[][] = [
    [
      { value: 'Columna', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: '¿Obligatoria?', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: 'Ejemplo', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
      { value: 'Qué se espera', fontWeight: 'bold', color: '#FFFFFF', backgroundColor: AZUL },
    ],
    ...plantilla.ayuda.map((a): Celda[] => [
      titulo(a.columna),
      texto(a.obligatoria),
      texto(plantilla.ejemplo[a.columna] ?? null),
      { value: a.nota, wrap: true },
    ]),
    [],
    [
      { value: 'Cómo se usa', fontWeight: 'bold', backgroundColor: GRIS },
      { backgroundColor: GRIS },
      { backgroundColor: GRIS },
      { backgroundColor: GRIS },
    ],
    [
      {
        value: `1. Rellena la hoja «${plantilla.hoja}» debajo de la fila de cabecera. No cambies los nombres de las columnas ni su orden.`,
        wrap: true,
      },
    ],
    [
      {
        value:
          '2. Guarda el archivo en .xlsx o expórtalo a .csv. El importador admite los dos, y también pegar las celdas directamente desde Excel.',
        wrap: true,
      },
    ],
    [
      {
        value: `3. Súbelo en Internacionalización → Importar Contactos, eligiendo «${plantilla.nombre}». Verás una previsualización antes de que se escriba nada.`,
        wrap: true,
      },
    ],
    [],
    [
      {
        value:
          'Un correo repetido dentro de la misma hoja se marca como error en la segunda aparición: sin eso, la segunda fila pisaría a la primera en silencio.',
        wrap: true,
      },
    ],
    [
      {
        value:
          'Una celda vacía en una fila que actualiza significa «no lo sé», nunca «bórralo»: no borra un dato que ya estuviera guardado.',
        wrap: true,
      },
    ],
  ]

  await writeXlsxFile([datos, instrucciones], {
    sheets: [plantilla.hoja, 'Instrucciones'],
    columns: [
      plantilla.anchos.map((width) => ({ width })),
      [{ width: 24 }, { width: 14 }, { width: 36 }, { width: 66 }],
    ],
    fileName: `${plantilla.archivo}.xlsx`,
  })
}

/**
 * Exporta contactos con la estructura de una plantilla, en Excel.
 *
 * Misma forma que el .csv de la plantilla, pero en libro: es lo que se manda a
 * alguien para que lo LEA. El .csv es para devolverlo al sistema del que salió;
 * este archivo es para revisarlo sin que Excel se pelee con las tildes.
 */
export async function exportarPlantillaExcel(
  plantilla: DefinicionPlantilla,
  filas: Record<string, string>[],
  nombreArchivo: string,
) {
  const { default: writeXlsxFile } = await import('write-excel-file')
  const columnas = [...plantilla.columnas]

  const datos: Celda[][] = [
    columnas.map((c) => cabecera(c)),
    ...filas.map((f) => columnas.map((c) => texto(f[c] || null))),
  ]

  await writeXlsxFile(datos, {
    sheet: plantilla.hoja,
    columns: plantilla.anchos.map((width) => ({ width })),
    fileName: nombreArchivo,
  })
}
