import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Aparición al entrar en pantalla.
 *
 * Se usa `IntersectionObserver` y no un listener de scroll: el observador
 * notifica desde el hilo del compositor y no dispara cientos de veces por
 * segundo mientras alguien recorre la página.
 *
 * El elemento se desconecta en cuanto aparece. Un tutorial se lee de arriba
 * abajo; volver a animar al subir es un efecto que sólo entretiene al autor.
 */
export function Revelar({
  children,
  retraso = 0,
  className,
  como: Como = 'div',
}: {
  children: ReactNode
  /** Milisegundos de espera. Para escalonar elementos hermanos. */
  retraso?: number
  className?: string
  como?: 'div' | 'section' | 'li' | 'article'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return

    // Sin soporte —o con movimiento reducido— se muestra sin más.
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setVisible(true)
      return
    }

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisible(true)
          observador.disconnect()
        }
      },
      // Se dispara un poco antes del borde inferior: al llegar con la vista,
      // el elemento ya terminó de aparecer en lugar de moverse bajo la mirada.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    )

    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  return (
    <Como
      ref={ref as never}
      data-motion="transform"
      style={{ transitionDelay: `${retraso}ms` }}
      className={cn(
        'transition-[opacity,transform] duration-panel ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        className,
      )}
    >
      {children}
    </Como>
  )
}
