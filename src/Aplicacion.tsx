import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import { App } from './App'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { TemaProvider } from '@/features/apariencia/TemaProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos siguen siendo válidos medio minuto: evita un refetch en
      // cada vuelta atrás del navegador sin llegar a servir datos rancios.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Árbol de proveedores de la aplicación.
 *
 * Vive aparte de `main.tsx` porque éste lo carga de forma DINÁMICA: sin
 * credenciales de Supabase no se puede ni construir el cliente, así que hay
 * que poder decidir antes de importar nada de esto.
 */
export function Aplicacion() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TemaProvider>
            <App />
            <Toaster
              position="bottom-right"
              // Los avisos heredan los tokens de la aplicación en vez de traer
              // su propio blanco: en tema oscuro, un toast claro deslumbra.
              toastOptions={{
                classNames: {
                  toast:
                    'rounded-md border border-line bg-surface-raised text-fg shadow-overlay text-body',
                  description: 'text-fg-muted',
                  success: 'text-success-softFg',
                  error: 'text-danger-softFg',
                },
              }}
            />
          </TemaProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
