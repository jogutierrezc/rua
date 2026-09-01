import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileClock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fechaRelativa } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Select } from '@/components/ui/Field'
import {
  Badge,
  Card,
  EmptyState,
  Pagination,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives'
import type { AccionAuditoria, AuditoriaRow, PerfilRow } from '@/types/database'
import type { TonoBadge } from '@/components/ui/primitives'

const POR_PAGINA = 25

const ACCION: Record<AccionAuditoria, { etiqueta: string; tono: TonoBadge }> = {
  insert: { etiqueta: 'Alta', tono: 'exito' },
  update: { etiqueta: 'Modificación', tono: 'primario' },
  delete: { etiqueta: 'Baja', tono: 'peligro' },
  login: { etiqueta: 'Acceso', tono: 'neutro' },
  aprobar: { etiqueta: 'Aprobación', tono: 'exito' },
  denegar: { etiqueta: 'Denegación', tono: 'peligro' },
}

const TABLAS = ['roles', 'perfiles', 'actividades', 'solicitudes'] as const

type Fila = AuditoriaRow & { actor: Pick<PerfilRow, 'nombre_completo'> | null }

export function AuditoriaPage() {
  const [tabla, setTabla] = useState<string>('todas')
  const [pagina, setPagina] = useState(0)

  const { data, isPending } = useQuery({
    queryKey: ['auditoria', tabla, pagina],
    queryFn: async () => {
      let q = supabase
        .from('auditoria')
        .select('*, actor:perfiles(nombre_completo)', { count: 'exact' })
        .order('creado_en', { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)

      if (tabla !== 'todas') q = q.eq('tabla', tabla)

      const { data, error, count } = await q
      if (error) throw error
      return { filas: (data ?? []) as unknown as Fila[], total: count ?? 0 }
    },
    placeholderData: (prev) => prev,
  })

  return (
    <>
      <PageHeader
        titulo="Bitácora"
        descripcion="Registro inmutable de cada cambio realizado sobre los datos del sistema."
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <Select
            aria-label="Filtrar por tabla"
            className="w-auto"
            value={tabla}
            onChange={(e) => {
              setTabla(e.target.value)
              setPagina(0)
            }}
          >
            <option value="todas">Todos los registros</option>
            {TABLAS.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </Select>
          {data && (
            <p className="ml-auto text-body-sm text-fg-subtle">
              <span className="tabular text-fg">{data.total}</span> eventos
            </p>
          )}
        </div>

        {isPending ? (
          <TableSkeleton filas={10} columnas={4} />
        ) : !data?.filas.length ? (
          <EmptyState
            icono={<FileClock className="size-5" />}
            titulo="Sin eventos registrados"
            descripcion="La bitácora se llena automáticamente conforme se usa el sistema."
          />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th className="w-36">Momento</Th>
                  <Th className="w-32">Acción</Th>
                  <Th className="w-32">Entidad</Th>
                  <Th>Registro</Th>
                  <Th className="w-48">Autor</Th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-fg-muted">{fechaRelativa(e.creado_en)}</Td>
                    <Td>
                      <Badge tono={ACCION[e.accion].tono} punto>
                        {ACCION[e.accion].etiqueta}
                      </Badge>
                    </Td>
                    <Td className="text-fg-muted">{e.tabla}</Td>
                    <Td className="truncate font-mono text-body-sm text-fg-subtle">
                      {e.registro_id}
                    </Td>
                    <Td className="truncate text-fg">
                      {e.actor?.nombre_completo ?? (
                        <span className="text-fg-subtle">Sistema</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>

            <Pagination
              pagina={pagina}
              porPagina={POR_PAGINA}
              total={data.total}
              onPagina={setPagina}
            />
          </>
        )}
      </Card>
    </>
  )
}
