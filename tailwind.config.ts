import type { Config } from 'tailwindcss'

/**
 * Rua — Design System
 *
 * Tokens SEMÁNTICOS (qué hace un color), no literales (qué color es).
 * Todos resuelven a CSS custom properties definidas en src/styles/tokens.css,
 * de modo que el tema claro/oscuro se cambia en un solo sitio y ningún
 * componente conoce un hex.
 */
const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Lienzo y superficies — de más hundido a más elevado
        canvas: withAlpha('--c-canvas'),
        sunken: withAlpha('--c-sunken'),
        surface: {
          DEFAULT: withAlpha('--c-surface'),
          muted: withAlpha('--c-surface-muted'),
          raised: withAlpha('--c-surface-raised'),
        },

        // Texto
        fg: {
          DEFAULT: withAlpha('--c-fg'),
          muted: withAlpha('--c-fg-muted'),
          subtle: withAlpha('--c-fg-subtle'),
          onDark: withAlpha('--c-fg-on-dark'),
        },

        // Bordes
        line: {
          DEFAULT: withAlpha('--c-line'),
          strong: withAlpha('--c-line-strong'),
        },

        // Marca
        primary: {
          DEFAULT: withAlpha('--c-primary'),
          hover: withAlpha('--c-primary-hover'),
          active: withAlpha('--c-primary-active'),
          fg: withAlpha('--c-primary-fg'),
          soft: withAlpha('--c-primary-soft'),
          softFg: withAlpha('--c-primary-soft-fg'),
        },
        accent: {
          DEFAULT: withAlpha('--c-accent'),
          fg: withAlpha('--c-accent-fg'),
          soft: withAlpha('--c-accent-soft'),
          softFg: withAlpha('--c-accent-soft-fg'),
        },

        // Estados — cada uno con par sólido + suave, ambos validados en claro y oscuro
        success: {
          DEFAULT: withAlpha('--c-success'),
          soft: withAlpha('--c-success-soft'),
          softFg: withAlpha('--c-success-soft-fg'),
        },
        warning: {
          DEFAULT: withAlpha('--c-warning'),
          soft: withAlpha('--c-warning-soft'),
          softFg: withAlpha('--c-warning-soft-fg'),
        },
        danger: {
          DEFAULT: withAlpha('--c-danger'),
          soft: withAlpha('--c-danger-soft'),
          softFg: withAlpha('--c-danger-soft-fg'),
        },

        focus: withAlpha('--c-focus'),
      },

      /**
       * Escala tipográfica. El tracking es específico por tamaño:
       * los títulos grandes se aprietan, el texto pequeño se abre.
       * Un letter-spacing único para todo es incorrecto en algún lado.
       */
      fontSize: {
        'display': ['2.125rem', { lineHeight: '2.5rem', letterSpacing: '-0.022em', fontWeight: '700' }],
        'title-lg': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.014em', fontWeight: '650' }],
        'title':    ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.008em', fontWeight: '620' }],
        'title-sm': ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.003em', fontWeight: '600' }],
        'body-lg':  ['1rem', { lineHeight: '1.5rem', letterSpacing: '0', fontWeight: '400' }],
        'body':     ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0', fontWeight: '400' }],
        'body-sm':  ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0.004em', fontWeight: '400' }],
        'label':    ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em', fontWeight: '560' }],
        'overline': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em', fontWeight: '620' }],
        // Cifras y celdas de tabla: tabular, un pelo más pesado para densidad
        'data':     ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0', fontWeight: '450' }],
        'metric':   ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '660' }],
      },

      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },

      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },

      /** Sombras suaves y en capas — nunca una sola sombra dura */
      boxShadow: {
        xs: '0 1px 2px 0 rgb(var(--c-shadow) / 0.05)',
        sm: '0 1px 2px 0 rgb(var(--c-shadow) / 0.06), 0 1px 3px 0 rgb(var(--c-shadow) / 0.05)',
        md: '0 2px 4px -1px rgb(var(--c-shadow) / 0.06), 0 4px 12px -2px rgb(var(--c-shadow) / 0.08)',
        lg: '0 4px 8px -2px rgb(var(--c-shadow) / 0.07), 0 12px 28px -6px rgb(var(--c-shadow) / 0.12)',
        // Superficies grandes leen como más gruesas: más difuminado, más profundidad
        overlay: '0 8px 16px -4px rgb(var(--c-shadow) / 0.10), 0 24px 56px -12px rgb(var(--c-shadow) / 0.20)',
      },

      /**
       * Las curvas nativas de CSS son demasiado débiles.
       * Estas tienen el "punch" que hace que una animación se sienta intencional.
       */
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      transitionDuration: {
        press: '120ms',
        fast: '160ms',
        DEFAULT: '200ms',
        panel: '260ms',
      },

      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 260ms cubic-bezier(0.23, 1, 0.32, 1) both',
      },

      spacing: {
        sidebar: '17rem',
        topbar: '3.5rem',
      },
    },
  },
  plugins: [],
} satisfies Config
