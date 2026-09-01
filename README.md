# Rua

Portal de Inteligencia de Negocios y Gestión Académica.
SPA en React + TypeScript sobre Supabase.

---

## Arranque

```bash
npm install
cp .env.example .env.local     # rellena URL y anon key de tu proyecto
npm run dev
```

> La aplicación **falla en el arranque** si faltan `VITE_SUPABASE_URL` o
> `VITE_SUPABASE_ANON_KEY`. Es deliberado: un error claro al inicio ahorra
> media hora persiguiendo un 401 sin contexto.

| Comando            | Qué hace                                     |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Servidor de desarrollo en `:5173`            |
| `npm run build`    | Compilación de producción a `dist/`          |
| `npm run typecheck`| Verificación de tipos sin emitir             |
| `npm run lint`     | ESLint                                       |
| `npm run db:types` | Regenera `src/types/database.ts` desde el esquema |
| `npm run check:contraste` | Verifica WCAG AA en cada paleta y modo |
| `npm run gen:tokens` | Regenera `src/styles/tokens.css` desde el derivador |

---

## Base de datos

Las migraciones viven en `supabase/migrations/` y se aplican **en orden**:

| Archivo                              | Contenido                                              |
| ------------------------------------ | ------------------------------------------------------ |
| `…000100_extensiones_y_enums.sql`    | Extensiones, enumeraciones del dominio, utilidades      |
| `…000200_identidad_y_permisos.sql`   | Vicerrectorías, permisos, roles, perfiles               |
| `…000300_periodos_y_actividades.sql` | Periodos, árbol de actividades, ejecución por periodo   |
| `…000400_solicitudes_y_auditoria.sql`| Solicitudes, revisiones, notificaciones, bitácora       |
| `…000500_rls.sql`                    | Row Level Security y guardias de integridad             |
| `…000600_semilla.sql`                | Catálogos y roles de sistema                            |
| `…000700_importacion_masiva.sql`     | Importación por CSV, borrado en cascada, cambio en lote |
| `…000800_apariencia.sql`             | Preferencia de tema por usuario y por institución       |
| `…000900_documento_identidad.sql`    | Documento de identidad en `perfiles`                    |
| `…001000_gestion_periodos.sql`       | Apertura y cierre de periodos, validación de solapes    |
| `…001100_guardia_autoedicion.sql`    | Nadie cambia su propio rol ni su propio estado          |
| `…001200_codigo_actividad_dos_digitos.sql` | Código de actividad desde 2 caracteres            |
| `…001300_flujo_validacion.sql`       | Cadena de validaciones, firmas y justificación          |
| `…001400_flujo_configurable.sql`     | Flujo editable, y la firma que crea la actividad         |

`supabase/seed.sql` es aparte: **datos de demostración**, sólo para desarrollo.

### Aplicarlas

**Contra un proyecto en la nube** — desde el SQL Editor del dashboard, pegando
cada archivo en orden; o con la CLI:

```bash
npx supabase link --project-ref <tu-ref>
npx supabase db push
```

**En local, con Docker:**

```bash
npx supabase init
npx supabase start
npx supabase db reset      # migraciones + seed.sql
```

Cuentas de demostración (sólo tras `seed.sql`), contraseña `Rua.2026`:

| Correo                     | Rol                       |
| -------------------------- | ------------------------- |
| `admin@institucion.edu`    | Administrador del Sistema |
| `r.reyes@institucion.edu`  | Decano de Facultad        |
| `v.valdes@institucion.edu` | Coordinador Académico     |
| `g.garza@institucion.edu`  | Auditor Externo           |

---

## Despliegue en Vercel

El preset de Vite funciona tal cual, pero hay **dos cosas** que hay que
configurar o la aplicación falla de formas poco evidentes. Ambas están
resueltas en el repositorio.

### 1 · Las rutas profundas necesitan un rewrite

Rua usa `BrowserRouter`: `/solicitudes/<id>` no existe como archivo. Al
recargar la página o abrir un enlace directo, el servidor busca ese fichero,
no lo encuentra y devuelve **404**. `vercel.json` reenvía todo a
`index.html`; los rewrites se evalúan después del sistema de archivos, así que
los assets reales se siguen sirviendo con normalidad.

### 2 · Las variables se incrustan al COMPILAR

Vite sustituye `import.meta.env.VITE_*` por literales durante el build. Si no
están definidas en ese momento, el bundle sale con `undefined` dentro y **no
hay forma de arreglarlo desde el servidor**: hay que volver a compilar.

Es la trampa clásica — se añaden las variables en Vercel después del primer
despliegue y nadie entiende por qué la página sigue rota. Por eso, cuando
faltan, la aplicación **no arranca en blanco**: `main.tsx` lo detecta antes de
importar Supabase y pinta una pantalla que dice qué falta y que hay que
redesplegar.

```
Settings → Environment Variables
  VITE_SUPABASE_URL       = https://<tu-proyecto>.supabase.co
  VITE_SUPABASE_ANON_KEY  = eyJ...
```

### Lo que Vercel NO despliega

Sólo aloja el frontend. Estas dos cosas viven en Supabase y se despliegan
aparte:

```bash
supabase db push                                  # las 14 migraciones
supabase functions deploy crear-usuario
supabase functions deploy restablecer-contrasena
```

Conviene además añadir el dominio de Vercel en Supabase →
Authentication → URL Configuration, o los enlaces de recuperación de
contraseña apuntarán a `localhost`.

### Caché

Los assets llevan hash en el nombre, así que se cachean un año como
`immutable`. El `index.html` **no** se cachea: es lo que apunta a esos assets,
y si se quedara guardado un despliegue nuevo seguiría pidiendo los ficheros
antiguos.
---

## Modelo de datos

```
vicerrectorias ─┬─< actividad_vicerrectorias >─┐
                └─< perfiles                   │
                                               │
permisos >─ rol_permisos ─< roles ─< perfiles  │
                             │                 │
                             └─< rol_actividades >─┐
                                                   │
periodos ─< actividad_periodo >── actividades ─────┴── (padre_id → sí misma)
                                        │
                                        └─< solicitudes ─< solicitud_revisiones

notificaciones · auditoria   (transversales)
```

Puntos que no son obvios al mirar las tablas:

- **`actividades` es un árbol autorreferencial.** `nivel` y `ruta` los deriva un
  trigger a partir de `padre_id`; nunca se escriben a mano. El mismo trigger
  detecta ciclos y propaga la ruta a los descendientes cuando cambia un código.
- **La definición de una actividad es estable; su ejecución no.** Por eso
  `actividad_periodo` separa "esta actividad existe" de "esta actividad, en este
  periodo, va por aquí".
- **Nada muta la estructura sin pasar por `solicitudes`.** El folio (`REQ-2026-0001`)
  lo genera un trigger, igual que el registro en `solicitud_revisiones` de cada
  cambio de estado: no depende de que el cliente se acuerde de escribirlo.
- **Sólo puede haber un periodo `abierto`**, garantizado por un índice único
  parcial. Es el que la interfaz asume por defecto en todas las pantallas.

---

## Importación masiva de actividades

`/actividades/importar` — tres pasos: cargar, revisar, aplicar. Acepta **Excel
(.xlsx)** y **CSV**, o pegar celdas directamente desde la hoja.

Hay plantilla descargable en ambos formatos. La de Excel trae dos hojas: la de
datos y una de **Instrucciones** con los valores admitidos en cada columna —
separadas a propósito, porque meter la ayuda en la misma hoja obligaría a
borrarla antes de subir el archivo y alguien se olvidaría.

El archivo lleva estas columnas (los nombres se normalizan, así que `Código`,
`codigo` y `CODIGO` son la misma):

```csv
codigo,nomenclatura,tipo,padre_codigo,estado,descripcion
ACT-010,Vinculación Empresarial,principal,,activa,Convenios y prácticas
SUB-010A,Gestión de Convenios,directa,ACT-010,activa,
AP-010A,Seguimiento en Práctica,apoyo,SUB-010A,activa,
```

Decisiones que conviene no deshacer:

- **La validación la hace el servidor, no el cliente.** `fn_validar_importacion`
  consulta el estado real de la base: sólo ahí se sabe si un código ya existe o
  si el padre referenciado está en el sistema. Una previsualización calculada en
  el navegador mentiría en cuanto otro usuario tocara el árbol.
- **Todo o nada.** `fn_importar_actividades` aborta si queda una sola fila con
  error. Importar "lo que se pueda" deja un árbol a medias que nadie sabe cómo
  quedó.
- **El orden de las filas da igual.** La importación se resuelve en pasadas
  sucesivas: en cada vuelta procesa las filas cuyo padre ya existe. Un hijo
  puede venir antes que su padre, a cualquier profundidad.
- **Round-trip completo.** *Exportar CSV* en la pantalla del árbol produce
  exactamente el formato que acepta la importación: exportar → editar en Excel →
  reimportar es el flujo de edición masiva.
- **RLS sigue aplicando.** Las funciones son `SECURITY INVOKER`: crear filas
  exige `actividades.crear` y actualizarlas `actividades.editar`. Importar no
  es un atajo para saltarse permisos.

El lector de CSV acepta comas, punto y coma y tabuladores (Excel en español usa
punto y coma; al pegar celdas directamente llegan tabuladores), campos entre
comillas con separadores o saltos de línea dentro, CRLF y el BOM de Excel.

### Sobre Excel

Se usan `read-excel-file` y `write-excel-file`, no SheetJS: el paquete `xlsx`
publicado en npm está congelado en 0.18.5 con advisories abiertos (prototype
pollution y ReDoS). Estos dos son de navegador, más pequeños y mantenidos.

Se cargan con `import()` **dinámico**: sólo hacen falta al importar o exportar,
y en el bundle principal cargarían ~170 kB a todo el que abre el panel sin
intención de tocar un archivo.

Dos detalles que Excel provoca y hay que conocer:

- **`.xls` de Excel 97-2003 no es compatible.** Es BIFF8, un formato binario
  distinto, no un `.xlsx` con otro nombre. Se detecta por extensión para poder
  explicarlo («guárdalo como .xlsx») en vez de fallar con un error de ZIP
  corrupto.
- **Los ceros a la izquierda se pierden.** Un código escrito como `0012` lo
  guarda Excel como el número 12 y ya no hay forma de recuperarlo al leer. La
  hoja de instrucciones pide formatear esa columna como Texto.

Las filas vacías que Excel arrastra hasta donde alguien puso el cursor alguna
vez se descartan antes de validar, para que no lleguen como errores.

La exportación produce **el mismo formato** que acepta la importación, en Excel
y en CSV. Es lo que convierte a Excel en el editor masivo: exportar, corregir
en la hoja, volver a subir.

### Editor de rama

`/actividades/nueva` y `/actividades/:id/editar` son **la misma pantalla**:
la actividad principal arriba y una tabla en línea con todas sus actividades
relacionadas debajo. Se crean, se editan y se quitan ahí mismo, sin abrir
paneles ni navegar entre registros sueltos.

La columna **«depende de»** permite el tercer nivel sin salir de la tabla: una
actividad de apoyo puede colgar de una directa en vez de la principal. Apunta
a la *clave* de la fila y no a su código, porque el código lo está escribiendo
el usuario y cambia con cada pulsación.

Al guardar, el editor llama a **`fn_importar_actividades`** — la misma función
que usa la carga por CSV. Editor e importador comparten camino de escritura,
así que no hay dos formas distintas de que la estructura acabe mal, y toda la
rama entra en una única transacción.

### Selección y borrado

En el árbol, cada fila tiene acciones al pasar el cursor —editar, agregar hija,
eliminar— y las casillas permiten operar en lote. **Marcar una rama marca su
descendencia**, que es lo que se espera al seleccionar una carpeta y evita el
caso de "archivé el padre pero los hijos siguieron activos".

El borrado es en cascada por FK, así que el diálogo lista **fila por fila** todo
lo que desaparecería (`fn_previsualizar_eliminacion`), avisa de las solicitudes
que quedarían huérfanas, pide escribir `ELIMINAR` y ofrece **archivar** como
primera salida, que es la operación reversible.

---

## Seguridad

**RLS es la capa de autorización.** En una SPA el cliente es público —
cualquiera puede llamar a la API con la anon key — así que las políticas de
`…000500_rls.sql` son las que mandan. Lo que hace la interfaz (ocultar botones
con `<Si puede="…">`) es sólo honestidad: no mostrar algo que va a fallar.

Reglas que conviene tener presentes al añadir pantallas:

- Los permisos se comprueban **por capacidad, no por nombre de rol**
  (`fn_tengo_permiso('solicitudes.revisar')`). Renombrar un rol no rompe nada.
- Las funciones auxiliares son `SECURITY DEFINER` con `search_path` fijo. Es
  necesario: si una política sobre `perfiles` consultara `perfiles` con los
  permisos del invocador, la evaluación se volvería recursiva.
- **Nadie resuelve su propia solicitud**, y **nadie se asciende a sí mismo**:
  lo primero es una política, lo segundo un trigger guardia
  (`fn_guardia_perfiles`) que revierte en silencio los campos de privilegio.
- Un **rol de sistema** no se puede renombrar, desmarcar ni borrar. Es lo que
  impide dejar la instalación sin administrador posible.
- La **bitácora no se escribe desde la aplicación**: la llena el trigger
  `fn_auditar`, que al ser definer no pasa por las políticas.

---

## Periodos académicos

`/periodos`, bajo el permiso `periodos.administrar`. Se crean como
**planificados**; abrirlos es un paso aparte y deliberado.

### Abrir no es cambiar una columna

El índice `periodos_uno_abierto` garantiza que sólo haya un periodo abierto a la
vez. Un `UPDATE` ingenuo desde el cliente chocaría contra una violación de
unicidad y el usuario recibiría un «ya existe un registro con esos datos» que no
explica nada.

Abrir es en realidad una **transición**: cerrar el vigente y abrir el nuevo, en
una sola transacción. Eso vive en `fn_abrir_periodo`, no en un formulario. El
diálogo avisa de qué periodo se va a cerrar **antes** de confirmar, y menciona
las solicitudes que quedan sin resolver en él.

### Un periodo vacío no le sirve a nadie

Al abrir, la función arrastra las actividades en estado `activa` que aún no
estén dentro (`on conflict do nothing`, así que reabrir no duplica). Sin eso,
«Actividades del Periodo» saldría sin una sola fila.

`fn_poblar_periodo` hace lo mismo sobre un periodo **ya abierto**: sirve para
incorporar actividades creadas después de la apertura, sin cerrarlo y volver a
abrirlo. Es idempotente.

### Solapamiento de fechas

Dos periodos no cerrados no pueden pisarse en el calendario — una actividad no
pertenece a dos semestres a la vez. Lo comprueba un trigger y no un constraint
`EXCLUDE`, porque hay correcciones legítimas (prorrogar un cierre) que no deben
quedar bloqueadas de raíz.

> Si no hay ningún periodo abierto, la aplicación **sigue funcionando**: las
> solicitudes se crean sin periodo asociado y el panel BI muestra el total
> histórico. La pantalla lo avisa en vez de fallar en silencio.
---

## Flujo de validación y Rua Tracker

Una solicitud ya no la resuelve una persona con un clic. Pasa por una **cadena
de firmas**, definida en `etapas_flujo` y ligada a permisos, no a nombres de rol:

**Coordinación Académica solicita** la creación de los códigos: no firma nada.
Su petición atraviesa esta cadena, configurable desde `/flujo`:

| # | Etapa | Permiso | |
| - | ----- | ------- | - |
| 1 | Vicerrectoría Administrativa y Financiera | `solicitudes.validar_financiera` | valida |
| 2 | Auditoría | `solicitudes.validar_auditoria` | valida |
| 3 | Creación en la plataforma | `actividades.crear` | **materializa** |

La última etapa no sólo aprueba: **crea la actividad** en la estructura
maestra. Es lo que cierra el hueco que existía antes, cuando aprobar dejaba
la solicitud en verde pero alguien tenía que dar de alta la actividad a mano
y nadie sabía si se había hecho.

La materialización va **antes** de marcar la etapa como aprobada: si el alta
falla —código repetido, padre inexistente— la excepción revierte todo y el
expediente queda como estaba, en vez de figurar aprobado sin actividad detrás.
Un `eliminar` **archiva**, no borra: el borrado arrastraría en cascada las
subactividades y las referencias de otros expedientes.

Al enviar una solicitud, un trigger instancia la cadena en `solicitud_etapas`:
la primera queda `pendiente` y el resto `bloqueada`. Cada aprobación desbloquea
la siguiente; una denegación marca las restantes como `omitida` y cierra el
expediente.

### Configurar el flujo

`/flujo`, bajo `roles.administrar`. El administrador añade, reordena y
desactiva etapas, y elige **qué roles firman cada una**.

Esa última parte traduce entre dos modelos a propósito: el administrador
razona en roles («¿quién valida lo financiero?»), pero la autorización real
sigue siendo por capacidad — marcar un rol concede el permiso de la etapa a ese
rol, y eso es lo que comprueban RLS y `fn_decidir_etapa`. Así la pantalla habla
el idioma del usuario sin que el modelo pierda su primitiva.

Crear una etapa nueva estrena su propio permiso `solicitudes.validar_<slug>`.
La política RLS de `permisos` sólo admite altas **con ese prefijo**: el resto
del catálogo sigue cerrado, porque un permiso inventado que nadie comprueba es
una puerta abierta que parece cerrada.

Reordenar no reasigna `orden` fila a fila —es único y chocaría a mitad—: se
desplaza todo fuera de rango y se renumera desde 1.

> Una etapa sin ningún rol asignado deja los expedientes atascados. La pantalla
> lo avisa en rojo en vez de dejar que se descubra cuando ya hay solicitudes
> esperando.
### Toda decisión lleva justificación — aprobar incluido

Es la regla que motivó la migración. Un expediente aprobado sin motivo escrito
no se puede auditar después, así que el mínimo de 20 caracteres lo impone un
`CHECK` en `solicitud_etapas`, no el formulario.

### Firmar es una transacción, no dos llamadas

`fn_decidir_etapa` valida permiso, orden de la cadena y que no seas el
solicitante; firma la etapa; desbloquea la siguiente o cierra la solicitud; y
anota la traza. Todo junto. Partirlo desde el cliente dejaría solicitudes con
una etapa aprobada y ninguna siguiente.

Es `SECURITY DEFINER` **a propósito**: `solicitud_etapas` no tiene política de
escritura, así que ésta es la única vía para firmar. Un `UPDATE` directo desde
el navegador queda bloqueado por RLS.

### Rua Tracker

Dos entradas al **mismo** expediente:

- **Revisor** — botón *Revisar* en la bandeja: vista ampliada en diálogo con lo
  que se pide, la actividad y subactividades afectadas, la cadena de firmas y el
  campo de justificación. Sustituye al `window.prompt` anterior, que era lo
  contrario de lo que pide un expediente.
- **Solicitante** — botón *Seguimiento*: `/solicitudes/:id`, el Tracker a
  pantalla completa con fases, plazo en días hábiles y línea de tiempo.

Ambas montan el mismo componente sobre el mismo hook (`useExpediente`). Dos
consultas distintas para el mismo trámite acabarían mostrando cosas distintas,
y ahí nacen las discusiones sobre quién tiene razón.

La barra de fases usa `clip-path` para los galones: es sólo pintura, no afecta
al layout ni al área de foco. El pulso de la fase activa y la entrada escalonada
de la línea de tiempo van tras `motion-safe:`, así que desaparecen con
`prefers-reduced-motion`.

> `fn_dias_habiles` no conoce los festivos institucionales: descuenta sábados y
> domingos y nada más. Si el plazo normativo debe respetarlos, hace falta una
> tabla de calendario.
---

## Usuarios

### Alta

En `/usuarios` → **Crear usuario**. Pide nombre completo, número de documento,
rol, correo y contraseña; cargo y vicerrectoría quedan como opcionales bajo un
desplegable, para que los cinco campos que importan no compitan con ellos.

### Por qué es una Edge Function y no una llamada normal

Crear una cuenta en `auth.users` con contraseña exige la **`service_role` key**,
que salta toda la seguridad del proyecto. Esa clave no puede vivir en un bundle
de JavaScript: cualquiera abriría las herramientas de desarrollo y tendría
acceso total a la base.

`supabase.auth.signUp()` desde el cliente tampoco sirve: crea una sesión para la
cuenta nueva y **expulsaría al administrador de la suya**.

Por eso `supabase/functions/crear-usuario` hace tres cosas en orden:

1. Verifica quién llama **con su propio token**, nunca con el de servicio.
2. Comprueba `usuarios.administrar` llamando a `fn_tengo_permiso` — la misma
   función que evalúan las políticas RLS, así que la regla vive en un solo sitio.
3. Sólo entonces, y sólo para el alta, usa la clave de servicio.

Si el perfil no se puede completar tras crear la cuenta, la función **deshace el
alta**: una cuenta a medias sería inservible y bloquearía ese correo y ese
documento para siempre.

### Despliegue

```bash
supabase functions deploy crear-usuario
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta
la plataforma automáticamente. Para probar en local:

```bash
supabase functions serve crear-usuario
```

### Edición

El botón ✏️ de cada fila abre el editor: nombre, documento, rol, cargo,
vicerrectoría y estado de la cuenta. Va por PostgREST — las políticas RLS de
`usuarios.administrar` ya lo cubren, no hace falta función.

El **correo es de sólo lectura**: es la identidad de acceso, vive en
`auth.users` y `fn_guardia_perfiles` lo revierte siempre. Para cambiarlo hay
que crear una cuenta nueva y desactivar la anterior.

### Nadie se degrada a sí mismo

Abrir la edición destapó un agujero que antes no existía: un administrador
editándose a sí mismo podía **cambiar su propio rol**. Bastaba quitarse
`roles.administrar` sin querer para dejar la instalación sin nadie capaz de
administrarla, y sin forma de revertirlo desde la interfaz.

La regla ahora es que el rol y el estado **propios** no se tocan desde la
aplicación, se tenga el permiso que se tenga. Quien necesite cambiar el suyo
se lo pide a otro administrador. Lo impone `fn_guardia_perfiles` en la base —
la interfaz sólo desactiva los campos y explica por qué.

### Restablecer contraseña

Sección plegada dentro del editor, con **su propio botón**. No forma parte de
«Guardar cambios» a propósito: va por otro camino (Edge Function con la clave
de servicio) y falla de otra manera. Mezclarlas dejaría la duda de si el nombre
llegó a guardarse cuando la contraseña falla.

```bash
supabase functions deploy restablecer-contrasena
```

La función verifica `usuarios.administrar` con el token de quien llama antes de
tocar la clave de servicio, y deja constancia en `auditoria` — quién
restableció la contraseña de quién y cuándo. Hace falta porque la escritura
ocurre en `auth.users`, fuera de las tablas que audita `fn_auditar`. Nunca se
guarda la contraseña, sólo el hecho.
### Sobre las contraseñas

El formulario incluye un generador (`crypto.getRandomValues`, no `Math.random`,
y sin caracteres ambiguos como `I/l/1` u `O/0`, que se confunden al dictarlas)
y un medidor de fuerza de cuatro segmentos.

> **Ten presente**: que un administrador teclee la contraseña significa que la
> conoce. Es lo que se pidió y así está implementado, pero la alternativa
> habitual es invitar por correo y que el titular la establezca. Si interesa,
> se puede añadir junto a un «debe cambiarla en el primer acceso».

### Documento de identidad

Acepta cédula, cédula de extranjería y pasaporte (alfanumérico, 5–20). Es único
entre quienes lo tienen, mediante un **índice parcial**: los perfiles anteriores
a la migración no lo llevan, y un índice único normal trataría esos nulos como
colisión. Se comprueba **antes** de crear la cuenta, para no dejar un usuario en
`auth` sin perfil utilizable.

Nadie cambia su propio documento: lo impide `fn_guardia_perfiles`, la misma
guardia que evita que alguien se ascienda a sí mismo. Es la identidad con la que
una persona figura en actas y nóminas.
---

## Apariencia y color

Cualquier usuario elige paleta y modo en **`/apariencia`**. La preferencia se
guarda en `perfiles.preferencias`, así que viaja con la persona a cualquier
equipo; `configuracion.apariencia` fija el valor institucional que ve quien
todavía no ha elegido, y sólo lo cambia un administrador.

Paletas: **UDES Blue** (por defecto), **Indigo UDES**, **Soft Sand** y
**Rua clásico**.

### Cinco colores no son un sistema

Una paleta de cinco muestras no dice cuál es el fondo de una fila al pasar el
cursor, ni qué azul aguanta texto blanco encima. `src/styles/paletas.ts`
declara cinco **semillas** —marca, tinta, neutro, matiz y claro— y deriva de
ellas los ~34 tokens que usa la aplicación, en claro y en oscuro.

La parte que importa: **los colores de los botones no se eligen, se calculan.**
`haciaContraste()` busca por bisección la luminosidad que alcanza el ratio
pedido, conservando tono y saturación. En la práctica:

- El azul acero `#4d7ea8` sólo llega a **4.3:1** con texto blanco — insuficiente
  para las etiquetas de 12 px de los botones. En modo claro se oscurece hasta
  pasar AA; en oscuro se aclara y el texto del botón pasa a ser tinta.
- El *hover* del botón primario aclara, pero vuelve a comprobarse: aclarar sin
  medir es exactamente cómo un botón deja de leerse justo al apuntarlo.
- El texto secundario se deriva contra la superficie **más desfavorable** en la
  que puede acabar (la cabecera de tabla en claro, la fila resaltada en oscuro),
  no contra la tarjeta blanca.
- Los tonos de estado (verde, ámbar, rojo) son **fijos entre paletas**: un error
  debe verse rojo siempre. Sólo su luminosidad se adapta al modo.

### Verificación

```bash
npm run check:contraste
```

22 pares críticos × 4 paletas × 2 modos = **176 comprobaciones**, y el proceso
sale con código 1 si alguna falla. Está pensado para CI: si alguien ajusta una
semilla y un botón deja de leerse, lo dice la compilación y no un usuario. La
misma lista se muestra en vivo en `/apariencia`, para que quien elija una
paleta pueda comprobarlo en lugar de fiarse.

> Al escribirlo, el verificador encontró tres fallos reales del diseño
> anterior — entre ellos los bordes de campo a **1.7:1**, muy por debajo del
> 3:1 que exige WCAG 1.4.11 para controles de interfaz.

### Cómo se aplica

`TemaProvider` escribe los tokens como custom properties **en línea** sobre el
elemento raíz: ganan a `tokens.css` sin depender del orden de la cascada, y
cambiar una propiedad personalizada sólo dispara recálculo de estilo — sin
layout ni repintado de estructura, así que cambiar de paleta es instantáneo.

`src/styles/tokens.css` es **generado** (`npm run gen:tokens`) y sirve sólo de
respaldo para el primer pintado. Para cambiar colores se edita
`src/styles/paletas.ts`, nunca el CSS.

Un script en `index.html` aplica el tema cacheado antes del primer frame, así
que no hay fogonazo claro al recargar en modo oscuro.
---

## Diseño

El sistema visual vive en dos archivos y ningún componente conoce un hex:

- `src/styles/paletas.ts` — la fuente del color: semillas por paleta y el
  derivador que produce los tokens semánticos (`--c-surface`, `--c-fg-muted`)
  para claro y oscuro. `tokens.css` se genera desde aquí.
- `tailwind.config.ts` — escala tipográfica, radios, sombras y curvas de easing.

Decisiones que conviene respetar al añadir componentes:

**Movimiento.** Las curvas nativas de CSS son demasiado débiles; se usan
`ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) para entradas y `ease-in-out`
para movimiento en pantalla. Nunca `ease-in` en interfaz: retrasa el arranque,
justo el instante que el usuario mira. Duraciones bajo 300 ms, y la navegación
lateral —que se usa decenas de veces al día— no anima nada más que el color.

**Feedback.** Todo elemento pulsable escala a `0.97` en `:active`, con 120 ms.
El feedback vive en el *pointer-down*, no en el click.

**Transiciones explícitas.** Siempre `transition-[transform,background-color]`,
nunca `transition-all`: nombrar las propiedades evita animar por accidente el
ancho o la sombra cuando cambia el contenido.

**Accesibilidad.** `prefers-reduced-motion` sustituye el desplazamiento por
fundidos en vez de eliminar el feedback; `prefers-reduced-transparency`
solidifica la cabecera translúcida; `prefers-contrast` endurece los bordes.
El hover va detrás de `[@media(hover:hover)]` para que no se quede pegado tras
un tap en táctil.

**Estados del dominio en un solo sitio.** `src/lib/estados.ts` mapea cada
enumeración a etiqueta y tono. Un estado se ve idéntico en la bandeja, en el
detalle y en el reporte; en cuanto cada pantalla elige su color, el usuario
deja de poder confiar en él. El color nunca es el único portador de significado:
siempre acompaña a texto.

---

## Estructura

```
src/
  components/
    layout/      AppShell, Marca, PageHeader
    ui/          Button, LinkButton, Field, primitives (Card, Badge, Table…)
  features/
    auth/        AuthProvider, guards, LoginPage
    dashboard/   Panel BI
    solicitudes/ Bandeja, alta, expediente y Rua Tracker
    actividades/ Árbol, editor de rama, importación CSV, periodo
    apariencia/  Paletas, modo claro/oscuro, auditoría de contraste
    flujo/       Configuración de la cadena de validación
    periodos/    Alta, apertura y cierre de periodos
    usuarios/    Directorio, alta, edición y restablecimiento de clave
    roles/       Roles y permisos
    auditoria/   Bitácora
  lib/           supabase, cn, format, estados, color, csv, contrasena
  styles/        tokens.css (generado), paletas.ts (fuente del color)
  types/         database.ts (generado por `npm run db:types`)
scripts/
  verificar-contraste.ts   WCAG AA en cada paleta y modo
  generar-tokens-css.ts    regenera tokens.css desde paletas.ts
supabase/
  migrations/    esquema versionado
  functions/     crear-usuario · restablecer-contrasena (Edge Functions)
  seed.sql       datos de demostración
```
