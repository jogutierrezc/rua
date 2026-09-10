import type { ContactoDetalleRow, TipoContactoInternacional } from '@/types/database'

/**
 * Las plantillas de nominación, definidas UNA vez.
 *
 * De aquí salen las tres cosas que tienen que coincidir sí o sí:
 *
 *   · El .xlsx que se descarga para rellenar.
 *   · El .csv que se exporta con los datos ya cargados.
 *   · Los nombres de columna que el importador espera reconocer.
 *
 * Si vivieran en tres sitios, bastaría con añadir una columna en uno para que el
 * archivo exportado dejara de poder volver a subirse — y el fallo aparecería
 * meses después, en la oficina que reporta, no aquí.
 *
 * Las cabeceras se escriben EXACTAMENTE como vienen en los archivos originales,
 * con sus mayúsculas y su «(Optional)» incluido. No es descuido: es un formato
 * ajeno, y traducirlo o «arreglarlo» rompería el archivo para quien lo recibe.
 */
export type CodigoPlantilla = 'academica' | 'empleadores'

export interface DefinicionPlantilla {
  codigo: CodigoPlantilla
  /** Cómo se llama en la interfaz, en castellano. */
  nombre: string
  descripcion: string
  /** Con qué tipo se marcan los contactos que entran por ella. */
  tipoContacto: Exclude<TipoContactoInternacional, 'general'>
  /** Nombre base del archivo, sin extensión. */
  archivo: string
  /** La hoja del libro. Excel no admite más de 31 caracteres. */
  hoja: string
  /** Las cabeceras, en su orden y con su grafía original. */
  columnas: readonly string[]
  anchos: number[]
  /** Una fila de muestra para la hoja de instrucciones. */
  ejemplo: Record<string, string>
  /** Qué es cada columna y de dónde sale. */
  ayuda: { columna: string; obligatoria: string; nota: string }[]
}

const ACADEMICA: DefinicionPlantilla = {
  codigo: 'academica',
  nombre: 'Contactos académicos',
  descripcion:
    'La plantilla de nominación académica: docentes e investigadores de instituciones socias.',
  tipoContacto: 'academico',
  archivo: 'academic_template_V3',
  hoja: 'Academic Template V3',
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
  anchos: [22, 10, 20, 22, 34, 30, 40, 24, 34, 30, 20],
  ejemplo: {
    Source: 'Convenio de movilidad 2026',
    Title: 'Dr.',
    'First Name': 'María Fernanda',
    'Last Name': 'Ruiz Gómez',
    'Job Title': 'Directora de Relaciones Internacionales',
    Department: 'Facultad de Ingeniería',
    Institution: 'Universidad Nacional Autónoma de México',
    'Country or Territory': 'México',
    Email: 'mf.ruiz@universidad.mx',
    Subject: 'Ingeniería de Sistemas',
    'Phone (Optional)': '+52 55 1234 5678',
  },
  ayuda: [
    {
      columna: 'Source',
      obligatoria: 'No',
      nota: 'De dónde salió la nominación: el convenio, el congreso o la persona que la propuso. Es lo que permite rendir cuentas de una lista meses después.',
    },
    {
      columna: 'Title',
      obligatoria: 'No',
      nota: 'El tratamiento: Dr., Prof., Mr., Ms. Va aparte del nombre y no dentro de él.',
    },
    {
      columna: 'First Name',
      obligatoria: 'Sí',
      nota: 'Nombre de pila. Junto con Last Name forma el nombre completo del contacto.',
    },
    {
      columna: 'Last Name',
      obligatoria: 'Sí',
      nota: 'Apellidos. Si la columna viene vacía, el nombre queda incompleto y la fila da error.',
    },
    { columna: 'Job Title', obligatoria: 'Sí', nota: 'El cargo tal como lo usa la persona.' },
    {
      columna: 'Department',
      obligatoria: 'No',
      nota: 'Facultad, escuela o unidad dentro de la institución.',
    },
    { columna: 'Institution', obligatoria: 'No', nota: 'La universidad o centro al que pertenece.' },
    {
      columna: 'Country or Territory',
      obligatoria: 'No',
      nota: 'Se admite en español o en inglés, y también el código ISO de dos letras: México, MX, Mexico. Si no se reconoce, la fila da error y se te ofrece el más parecido.',
    },
    {
      columna: 'Email',
      obligatoria: 'Sí',
      nota: 'Es la columna que EMPAREJA: si el correo ya existe, el contacto se actualiza; si no, se crea. Al cargar sólo se comprueba su estructura.',
    },
    {
      columna: 'Subject',
      obligatoria: 'No',
      nota: 'El área de conocimiento sobre la que se le nomina.',
    },
    { columna: 'Phone (Optional)', obligatoria: 'No', nota: 'Con indicativo del país, si lo sabes.' },
  ],
}

const EMPLEADORES: DefinicionPlantilla = {
  codigo: 'empleadores',
  nombre: 'Contactos de empleadores',
  descripcion:
    'La plantilla de nominación de empleadores: empresas y organizaciones que contratan egresados.',
  tipoContacto: 'empleador',
  archivo: 'employer_template_2024_V1',
  hoja: 'Employer Template 2024',
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
  anchos: [22, 10, 20, 22, 34, 28, 40, 24, 34, 20],
  ejemplo: {
    Source: 'Feria de empleo 2026',
    Title: 'Ms.',
    'First Name': 'Laura',
    'Last Name': 'Restrepo Díaz',
    Position: 'Gerente de Talento Humano',
    Industry: 'Empresa privada',
    'Company Name': 'Tecnologías Andinas S.A.S.',
    'Country or Territory': 'Colombia',
    Email: 'l.restrepo@tecandinas.com',
    'Phone (Optional)': '+57 300 123 4567',
  },
  ayuda: [
    {
      columna: 'Source',
      obligatoria: 'No',
      nota: 'De dónde salió la nominación: la feria, el convenio o quien la propuso.',
    },
    { columna: 'Title', obligatoria: 'No', nota: 'El tratamiento: Dr., Mr., Ms. Va aparte del nombre.' },
    { columna: 'First Name', obligatoria: 'Sí', nota: 'Nombre de pila.' },
    { columna: 'Last Name', obligatoria: 'Sí', nota: 'Apellidos.' },
    { columna: 'Position', obligatoria: 'Sí', nota: 'El cargo dentro de la empresa.' },
    {
      columna: 'Industry',
      obligatoria: 'No',
      nota: 'Se valida contra el catálogo de sectores. Si traes uno que no existe, la fila da error: créalo antes en Roles y Sectores.',
    },
    { columna: 'Company Name', obligatoria: 'No', nota: 'La empresa u organización.' },
    {
      columna: 'Country or Territory',
      obligatoria: 'No',
      nota: 'En español o en inglés, o el código ISO de dos letras: Colombia, CO.',
    },
    {
      columna: 'Email',
      obligatoria: 'Sí',
      nota: 'Es la columna que EMPAREJA: si el correo ya existe, el contacto se actualiza; si no, se crea.',
    },
    { columna: 'Phone (Optional)', obligatoria: 'No', nota: 'Con indicativo del país, si lo sabes.' },
  ],
}

export const PLANTILLAS: Record<CodigoPlantilla, DefinicionPlantilla> = {
  academica: ACADEMICA,
  empleadores: EMPLEADORES,
}

export const LISTA_PLANTILLAS: DefinicionPlantilla[] = [ACADEMICA, EMPLEADORES]

/**
 * Convierte un contacto en una fila de la plantilla.
 *
 * `nombres` y `apellidos` salen tal como se guardaron: si la hoja los trajo
 * partidos, se devuelven exactamente igual. Sólo cuando el contacto se creó a
 * mano con el nombre entero, la base los derivó al guardarlo — y esa derivación
 * ya ocurrió antes de llegar aquí, así que la exportación nunca inventa.
 */
export function filaDesdeContacto(
  c: ContactoDetalleRow,
  plantilla: DefinicionPlantilla,
): Record<string, string> {
  const comun = {
    Source: c.fuente ?? '',
    Title: c.tratamiento ?? '',
    'First Name': c.nombres ?? '',
    'Last Name': c.apellidos ?? '',
    'Country or Territory': c.pais_nombre ?? '',
    Email: c.correo,
    'Phone (Optional)': c.telefono ?? '',
  }

  if (plantilla.codigo === 'academica') {
    return {
      ...comun,
      'Job Title': c.cargo,
      Department: c.departamento ?? '',
      Institution: c.organizacion ?? '',
      Subject: c.area_conocimiento ?? '',
    }
  }

  return {
    ...comun,
    Position: c.cargo,
    Industry: c.sector_etiqueta ?? '',
    'Company Name': c.organizacion ?? '',
  }
}
