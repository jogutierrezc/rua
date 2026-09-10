import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RutaProtegida, RutaPublica, RequierePermiso } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { SolicitudesPage } from '@/features/solicitudes/SolicitudesPage'
import { NuevaSolicitudPage } from '@/features/solicitudes/NuevaSolicitudPage'
import { SeguimientoPage } from '@/features/solicitudes/SeguimientoPage'
import { ActividadesPage } from '@/features/actividades/ActividadesPage'
import { EditorRamaPage } from '@/features/actividades/EditorRamaPage'
import { ImportarActividadesPage } from '@/features/actividades/ImportarPage'
import { PeriodoPage } from '@/features/actividades/PeriodoPage'
import { UsuariosPage } from '@/features/usuarios/UsuariosPage'
import { RolesPage } from '@/features/roles/RolesPage'
import { AuditoriaPage } from '@/features/auditoria/AuditoriaPage'
import { AparienciaPage } from '@/features/apariencia/AparienciaPage'
import { PeriodosPage } from '@/features/periodos/PeriodosPage'
import { FlujoPage } from '@/features/flujo/FlujoPage'
import { CorreoPage } from '@/features/correo/CorreoPage'
import { MenuPage } from '@/features/menu/MenuPage'
import { ProgramasUdesPage } from '@/features/planeacion/ProgramasUdesPage'
import { ImportarProgramasPage } from '@/features/planeacion/ImportarProgramasPage'
import {
  OtraInformacionPage,
  ProgramasSniesPage,
  ProyeccionCuposPage,
} from '@/features/planeacion/EnDesarrollo'
import { ContactosPage } from '@/features/internacionalizacion/ContactosPage'
import { ImportarContactosPage } from '@/features/internacionalizacion/ImportarContactosPage'
import { VerificacionPage } from '@/features/internacionalizacion/VerificacionPage'
import { CatalogosPage } from '@/features/internacionalizacion/CatalogosPage'
import { EmptyState } from '@/components/ui/primitives'
import { LinkButton } from '@/components/ui/LinkButton'

/**
 * El tutorial se carga aparte.
 *
 * Es una página larga —tres juegos de maquetas dibujadas— que la mayoría de las
 * sesiones no abre nunca: quien entra a trabajar va a Solicitudes, no al
 * recorrido de bienvenida. Manteniéndola en el paquete principal, todo el mundo
 * pagaba su peso en cada carga del portal para no verla.
 *
 * Sin pantalla de espera visible: llega en un parpadeo desde el mismo servidor
 * que sirvió la página, y un destello de medio segundo molesta más que un lienzo
 * tranquilo. Es el mismo criterio que usan las guardas de ruta.
 */
const TutorialPage = lazy(() =>
  import('@/features/tutorial/TutorialPage').then((m) => ({ default: m.TutorialPage })),
)

export function App() {
  return (
    <Routes>
      {/* Abierto a todo el mundo, con sesión o sin ella: es material de
          divulgación, y quien ya entró también querrá consultarlo. */}
      <Route
        path="/tutorial"
        element={
          <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
            <TutorialPage />
          </Suspense>
        }
      />

      <Route element={<RutaPublica />}>
        <Route path="/entrar" element={<LoginPage />} />
      </Route>

      <Route element={<RutaProtegida />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />

          <Route path="solicitudes">
            <Route index element={<SolicitudesPage />} />
            <Route
              path="nueva"
              element={
                <RequierePermiso permiso="solicitudes.crear">
                  <NuevaSolicitudPage />
                </RequierePermiso>
              }
            />
            {/* Rua Tracker: la vista del solicitante sobre su expediente.
                Sin guardia extra — RLS ya decide qué solicitudes se ven. */}
            <Route path=":id" element={<SeguimientoPage />} />
          </Route>

          <Route path="actividades">
            <Route
              index
              element={
                <RequierePermiso permiso="actividades.ver">
                  <ActividadesPage />
                </RequierePermiso>
              }
            />
            {/* El editor es el mismo para crear y para editar: una rama con
                todas sus actividades relacionadas, en una sola pantalla. */}
            <Route
              path="nueva"
              element={
                <RequierePermiso permiso="actividades.crear">
                  <EditorRamaPage />
                </RequierePermiso>
              }
            />
            <Route
              path=":id/editar"
              element={
                <RequierePermiso permiso="actividades.editar">
                  <EditorRamaPage />
                </RequierePermiso>
              }
            />
            <Route
              path="importar"
              element={
                <RequierePermiso permiso="actividades.crear">
                  <ImportarActividadesPage />
                </RequierePermiso>
              }
            />
          </Route>

          <Route
            path="periodo"
            element={
              <RequierePermiso permiso="actividades.ver">
                <PeriodoPage />
              </RequierePermiso>
            }
          />

          {/* Planeación Estratégica. Los tres submódulos vacíos están
              declarados a propósito: el módulo tiene su forma final desde el
              principio y lo único que cambia es que se van llenando. */}
          <Route path="planeacion">
            <Route
              path="snies"
              element={
                <RequierePermiso permiso="planeacion.ver">
                  <ProgramasSniesPage />
                </RequierePermiso>
              }
            />
            <Route
              path="programas"
              element={
                <RequierePermiso permiso="planeacion.ver">
                  <ProgramasUdesPage />
                </RequierePermiso>
              }
            />
            <Route
              path="importar"
              element={
                <RequierePermiso permiso="planeacion.administrar">
                  <ImportarProgramasPage />
                </RequierePermiso>
              }
            />
            <Route
              path="otra"
              element={
                <RequierePermiso permiso="planeacion.ver">
                  <OtraInformacionPage />
                </RequierePermiso>
              }
            />
            <Route
              path="cupos"
              element={
                <RequierePermiso permiso="planeacion.ver">
                  <ProyeccionCuposPage />
                </RequierePermiso>
              }
            />
          </Route>

          {/* Internacionalización. La lista la puede ver cualquiera con el
              permiso de lectura —que llevan todos los roles de sistema—; lo que
              se reserva es escribir, importar y gastar créditos verificando. */}
          <Route path="internacionalizacion">
            <Route
              path="contactos"
              element={
                <RequierePermiso permiso="internacionalizacion.ver">
                  <ContactosPage />
                </RequierePermiso>
              }
            />
            <Route
              path="importar"
              element={
                <RequierePermiso permiso="internacionalizacion.administrar">
                  <ImportarContactosPage />
                </RequierePermiso>
              }
            />
            <Route
              path="verificacion"
              element={
                <RequierePermiso permiso="internacionalizacion.verificar">
                  <VerificacionPage />
                </RequierePermiso>
              }
            />
            <Route
              path="catalogos"
              element={
                <RequierePermiso permiso="internacionalizacion.administrar">
                  <CatalogosPage />
                </RequierePermiso>
              }
            />
          </Route>

          <Route
            path="usuarios"
            element={
              <RequierePermiso permiso="usuarios.ver">
                <UsuariosPage />
              </RequierePermiso>
            }
          />

          <Route
            path="roles"
            element={
              <RequierePermiso permiso="roles.administrar">
                <RolesPage />
              </RequierePermiso>
            }
          />

          <Route
            path="periodos"
            element={
              <RequierePermiso permiso="periodos.administrar">
                <PeriodosPage />
              </RequierePermiso>
            }
          />

          {/* Configurar el flujo es reconfigurar quién puede firmar qué:
              va con el permiso de administración de roles, no con uno propio. */}
          <Route
            path="flujo"
            element={
              <RequierePermiso permiso="roles.administrar">
                <FlujoPage />
              </RequierePermiso>
            }
          />

          <Route
            path="correo"
            element={
              <RequierePermiso permiso="roles.administrar">
                <CorreoPage />
              </RequierePermiso>
            }
          />

          {/* Reorganizar el menú es decidir qué se ofrece y cómo se llama, no
              quién puede entrar: va con el permiso de administración. */}
          <Route
            path="menu"
            element={
              <RequierePermiso permiso="roles.administrar">
                <MenuPage />
              </RequierePermiso>
            }
          />

          {/* Sin guardia de permiso: la apariencia es una preferencia
              personal, y todo usuario con sesión puede ajustarla. */}
          <Route path="apariencia" element={<AparienciaPage />} />

          <Route
            path="auditoria"
            element={
              <RequierePermiso permiso="auditoria.consultar">
                <AuditoriaPage />
              </RequierePermiso>
            }
          />

          <Route
            path="*"
            element={
              <EmptyState
                titulo="Esta página no existe"
                descripcion="Puede que el enlace esté desactualizado o que la sección se haya movido."
                accion={
                  <LinkButton to="/" variante="primario">
                    Volver al panel
                  </LinkButton>
                }
              />
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
