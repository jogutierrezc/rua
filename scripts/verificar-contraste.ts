/**
 * Verifica el contraste de cada paleta en modo claro y oscuro.
 *
 * Se ejecuta con `npm run check:contraste` y sale con código 1 si algún par
 * incumple. Está pensado para correr en CI: si alguien ajusta una semilla y
 * un botón deja de leerse, la compilación lo dice, no un usuario.
 */
import { PALETAS, derivarTokens, verificar, type ModoTema } from '../src/styles/paletas'

const MODOS: ModoTema[] = ['claro', 'oscuro']

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`
const rojo = (s: string) => `\x1b[31m${s}\x1b[0m`
const gris = (s: string) => `\x1b[90m${s}\x1b[0m`
const negrita = (s: string) => `\x1b[1m${s}\x1b[0m`

let fallos = 0
let total = 0

for (const paleta of PALETAS) {
  for (const modo of MODOS) {
    const resultados = verificar(derivarTokens(paleta, modo))
    const rotos = resultados.filter((r) => !r.pasa)
    total += resultados.length
    fallos += rotos.length

    const encabezado = `${paleta.nombre} · ${modo}`
    console.log(
      rotos.length === 0
        ? `${verde('✓')} ${negrita(encabezado)} ${gris(`(${resultados.length} comprobaciones)`)}`
        : `${rojo('✗')} ${negrita(encabezado)} ${rojo(`${rotos.length} de ${resultados.length} fallan`)}`,
    )

    for (const r of rotos) {
      console.log(
        `    ${rojo('·')} ${r.descripcion}: ${r.ratio.toFixed(2)}:1 ` +
          gris(`(mínimo ${r.minimo}:1 — ${r.frente} sobre ${r.fondo})`),
      )
    }

    // El par más justo de los que pasan: avisa de lo que está al borde y se
    // rompería con un retoque pequeño de las semillas.
    const masJusto = resultados
      .filter((r) => r.pasa)
      .sort((a, b) => a.ratio / a.minimo - b.ratio / b.minimo)[0]
    if (masJusto && rotos.length === 0) {
      console.log(
        gris(`    margen mínimo: ${masJusto.descripcion} — ${masJusto.ratio.toFixed(2)}:1`),
      )
    }
  }
}

console.log()
if (fallos === 0) {
  console.log(verde(`${total} comprobaciones superadas en ${PALETAS.length} paletas × 2 modos.`))
} else {
  console.log(rojo(`${fallos} de ${total} comprobaciones fallan.`))
  process.exit(1)
}
