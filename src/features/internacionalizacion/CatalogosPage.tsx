import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Lock, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensajeDeError } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input, Switch } from '@/components/ui/Field'
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/primitives'
import { useCatalogo } from './useCatalogos'
import { aCodigoCatalogo } from './dominio'
import type { ContactoCatalogoRow, TipoCatalogoContacto } from '@/types/database'

function Fila({ entrada }: { entrada: ContactoCatalogoRow }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [etiqueta, setEtiqueta] = useState(entrada.etiqueta)

  const invalidar = () => qc.invalidateQueries({ queryKey: ['contacto-catalogo'] })

  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('contacto_catalogo')
        .update({ etiqueta: etiqueta.trim() })
        .eq('id', entrada.id)
      if (error) throw error
    },
    onSuccess: () => {
      void invalidar()
      // La libreta muestra la etiqueta: si cambia, la tabla tiene que enterarse.
      void qc.invalidateQueries({ queryKey: ['contactos'] })
      setEditando(false)
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const alternarActivo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('contacto_catalogo')
        .update({ activo: !entrada.activo })
        .eq('id', entrada.id)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (e) => toast.error(mensajeDeError(e)),
  })

  const eliminar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('contacto_catalogo').delete().eq('id', entrada.id)
      if (error) throw error
    },
    onSuccess: () => {
      void invalidar()
      toast.success('Valor eliminado.')
    },
    onError: (e) => {
      const err = e as { code?: string }
      if (err.code === '23503') {
        toast.error('Hay contactos usando este valor. Desactívalo en vez de borrarlo.')
        return
      }
      toast.error(mensajeDeError(e))
    },
  })

  return (
    <li
      className={cn(
        'flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0',
        !entrada.activo && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        {editando ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              aria-label="Nombre del valor"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') guardar.mutate()
                if (e.key === 'Escape') {
                  setEtiqueta(entrada.etiqueta)
                  setEditando(false)
                }
              }}
            />
            <Button
              tamano="sm"
              soloIcono
              aria-label="Guardar"
              variante="primario"
              cargando={guardar.isPending}
              disabled={etiqueta.trim().length < 2}
              onClick={() => guardar.mutate()}
              iconoIzq={<Check className="size-4" />}
            />
            <Button
              tamano="sm"
              soloIcono
              aria-label="Cancelar"
              variante="fantasma"
              onClick={() => {
                setEtiqueta(entrada.etiqueta)
                setEditando(false)
              }}
              iconoIzq={<X className="size-4" />}
            />
          </div>
        ) : (
          <button
            onClick={() => setEditando(true)}
            className="block w-full min-w-0 text-left"
            title="Pulsa para renombrar"
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate text-body text-fg">{entrada.etiqueta}</span>
              {entrada.es_sistema && (
                <Lock aria-label="Valor de fábrica: se renombra, pero no se borra" className="size-3 shrink-0 text-fg-subtle" />
              )}
              {!entrada.activo && <Badge tono="neutro">Retirado</Badge>}
            </span>
            {entrada.descripcion && (
              <span className="block truncate text-body-sm text-fg-subtle">
                {entrada.descripcion}
              </span>
            )}
          </button>
        )}
      </div>

      {!editando && (
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            etiqueta=""
            aria-label={entrada.activo ? 'Retirar del uso' : 'Volver a ofrecer'}
            checked={entrada.activo}
            onChange={() => alternarActivo.mutate()}
          />
          {/* Los de fábrica no se borran: hay contactos apuntando a ellos y se
              quedarían sin clasificar. Retirarlos, que es lo que de verdad se
              quiere, sigue estando a un clic. */}
          {!entrada.es_sistema && (
            <Button
              tamano="sm"
              soloIcono
              variante="fantasma"
              aria-label={`Eliminar ${entrada.etiqueta}`}
              cargando={eliminar.isPending}
              onClick={() => eliminar.mutate()}
              iconoIzq={<Trash2 className="size-4" />}
            />
          )}
        </div>
      )}
    </li>
  )
}

function Catalogo({
  tipo,
  titulo,
  descripcion,
}: {
  tipo: TipoCatalogoContacto
  titulo: string
  descripcion: string
}) {
  const qc = useQueryClient()
  const { data, isPending } = useCatalogo(tipo, true)
  const [nuevo, setNuevo] = useState('')

  const crear = useMutation({
    mutationFn: async () => {
      const etiqueta = nuevo.trim()
      const codigo = aCodigoCatalogo(etiqueta)
      if (codigo.length < 2) {
        throw new Error('El nombre tiene que llevar al menos dos letras o números.')
      }

      const { error } = await supabase.from('contacto_catalogo').insert({
        tipo,
        codigo,
        etiqueta,
        // Al final de la lista: lo nuevo no se cuela por delante de lo que ya
        // estaba ordenado a mano.
        orden: (data?.length ?? 0) + 1,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setNuevo('')
      void qc.invalidateQueries({ queryKey: ['contacto-catalogo'] })
      toast.success('Valor añadido.')
    },
    onError: (e) => {
      const err = e as { code?: string }
      if (err.code === '23505') {
        toast.error('Ya existe un valor con ese nombre.')
        return
      }
      toast.error(mensajeDeError(e))
    },
  })

  return (
    <Card className="overflow-hidden">
      <CardHeader titulo={titulo} descripcion={descripcion} />

      {isPending ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      ) : (
        <ul>
          {(data ?? []).map((e) => (
            <Fila key={e.id} entrada={e} />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t border-line p-3">
        <Input
          aria-label={`Añadir a ${titulo}`}
          placeholder="Añadir un valor nuevo…"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && nuevo.trim().length >= 2) crear.mutate()
          }}
        />
        <Button
          variante="primario"
          disabled={nuevo.trim().length < 2}
          cargando={crear.isPending}
          onClick={() => crear.mutate()}
          iconoIzq={<Plus className="size-4" />}
        >
          Añadir
        </Button>
      </div>
    </Card>
  )
}

export function CatalogosPage() {
  return (
    <>
      <PageHeader
        titulo="Roles y sectores"
        descripcion="Los valores con los que se clasifica cada contacto. La importación sólo acepta los que estén aquí, y por eso conviene añadirlos ANTES de subir una hoja nueva."
        volver={{ a: '/internacionalizacion/contactos', etiqueta: 'Volver a Contactos' }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Catalogo
          tipo="rol"
          titulo="Roles"
          descripcion="Qué papel tiene la persona en la relación."
        />
        <Catalogo
          tipo="sector"
          titulo="Sectores"
          descripcion="A qué clase de organización pertenece."
        />
      </div>

      <p className="mt-4 max-w-2xl text-body-sm text-fg-subtle">
        Retirar un valor lo quita de los formularios y de la importación, pero los contactos que ya
        lo tenían lo conservan: un sector retirado sigue explicando cómo se clasificó a alguien en su
        momento. Borrarlo del todo sólo es posible mientras nadie lo use.
      </p>
    </>
  )
}
