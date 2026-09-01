import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/inter'
import './index.css'

import { configuracionIncompleta } from '@/lib/entorno'
import { PantallaConfiguracion } from './PantallaConfiguracion'

const contenedor = document.getElementById('root')
if (!contenedor) throw new Error('No se encontró el elemento #root')

const raiz = createRoot(contenedor)

if (configuracionIncompleta.length > 0) {
  // Sin credenciales no se puede ni construir el cliente de Supabase. Si se
  // importara la aplicación, el fallo reventaría el grafo de módulos entero y
  // el usuario vería una página en blanco: se pinta el diagnóstico y se para.
  raiz.render(
    <StrictMode>
      <PantallaConfiguracion />
    </StrictMode>,
  )
} else {
  // Importación dinámica a propósito: es lo que permite decidir ANTES de
  // cargar Supabase, el enrutador y todo lo que depende de ellos.
  void import('./Aplicacion').then(({ Aplicacion }) => {
    raiz.render(
      <StrictMode>
        <Aplicacion />
      </StrictMode>,
    )
  })
}
