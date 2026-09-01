import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, open: true },
  build: {
    // Separar los vendors del código de la aplicación: Supabase y React
    // cambian una vez al trimestre, la app cambia a diario. Con un chunk
    // único, cada despliegue invalidaría también los 400 kB de librerías.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          datos: ['@tanstack/react-query'],
        },
      },
    },
  },
})
