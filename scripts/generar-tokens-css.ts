/**
 * Regenera src/styles/tokens.css desde el derivador.
 *
 * Ese archivo es sólo el RESPALDO del primer pintado en un navegador sin caché:
 * en cuanto React monta, TemaProvider escribe los tokens en línea. Aun así debe
 * coincidir con la paleta por defecto, o el primer frame mostrará otra cosa.
 *
 *   npm run gen:tokens
 */
import { writeFileSync } from 'node:fs'
import { PALETA_POR_DEFECTO, buscarPaleta, derivarTokens } from '../src/styles/paletas'

const paleta = buscarPaleta(PALETA_POR_DEFECTO)
const claro = derivarTokens(paleta, 'claro')
const oscuro = derivarTokens(paleta, 'oscuro')

const bloque = (tokens: Record<string, string>, sangria = '  ') =>
  Object.entries(tokens)
    .map(([k, v]) => `${sangria}${k}: ${v};`)
    .join('\n')

const css = `/**
 * Rua — Tokens de color. GENERADO: no editar a mano.
 *
 *   npm run gen:tokens
 *
 * Es el respaldo del PRIMER PINTADO, para un navegador que aún no tiene el
 * tema en caché. En cuanto la aplicación monta, TemaProvider deriva la paleta
 * elegida y escribe estas mismas propiedades en línea, que ganan por
 * especificidad. Para cambiar los colores se edita src/styles/paletas.ts.
 *
 * Paleta por defecto: ${paleta.nombre} — ${paleta.descripcion}
 *
 * Formato: canales RGB separados por espacio, para que Tailwind pueda aplicar
 * opacidad (\`bg-primary/10\`).
 */

:root {
  color-scheme: light;

${bloque(claro)}
}

:root[data-theme='dark'] {
  color-scheme: dark;

${bloque(oscuro)}
}

/* Sin preferencia explícita, seguimos al sistema. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;

${bloque(oscuro, '    ')}
  }
}
`

writeFileSync('src/styles/tokens.css', css, 'utf8')
console.log(
  `tokens.css regenerado desde "${paleta.nombre}" ` +
    `(${Object.keys(claro).length} tokens × 2 modos)`,
)
