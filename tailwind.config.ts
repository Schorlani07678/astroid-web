import type { Config } from 'tailwindcss';

/**
 * Astroid design tokens (PRD Doc 9).
 *
 * Colors are defined as CSS custom properties in `src/styles/tokens.css` so the
 * light / dark / high-contrast themes can swap a single source of truth. Tailwind
 * references those variables here via `rgb(var(--token) / <alpha-value>)` so every
 * utility supports opacity modifiers while staying theme-aware.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
    './src/providers/**/*.{ts,tsx}',
  ],
  theme: {
    // Spacing scale — never arbitrary (PRD: 4,8,12,16,24,32,40,48,64,80,120).
    spacing: {
      px: '1px',
      0: '0px',
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      5: '24px',
      6: '32px',
      7: '40px',
      8: '48px',
      9: '64px',
      10: '80px',
      11: '120px',
      // Named aliases mirroring the token names for readability.
      'space-4': '4px',
      'space-8': '8px',
      'space-12': '12px',
      'space-16': '16px',
      'space-24': '24px',
      'space-32': '32px',
      'space-40': '40px',
      'space-48': '48px',
      'space-64': '64px',
      'space-80': '80px',
      'space-120': '120px',
    },
    extend: {
      // Chart and skeleton boxes need heights above the small spacing steps.
      // `spacing` stops at 120px, so Recharts parents that use `h-72`/`h-96`
      // were collapsing to height 0; these follow the same 8px grid.
      height: {
        64: '256px',
        72: '288px',
        80: '320px',
        96: '384px',
      },
      minHeight: {
        64: '256px',
      },
      maxHeight: {
        64: '256px',
        72: '288px',
        96: '384px',
      },
      colors: {
        background: {
          DEFAULT: 'rgb(var(--background-primary) / <alpha-value>)',
          primary: 'rgb(var(--background-primary) / <alpha-value>)',
          secondary: 'rgb(var(--background-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--background-tertiary, var(--surface-secondary)) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface-primary) / <alpha-value>)',
          primary: 'rgb(var(--surface-primary) / <alpha-value>)',
          secondary: 'rgb(var(--surface-secondary) / <alpha-value>)',
        },
        foreground: {
          DEFAULT: 'rgb(var(--text-primary) / <alpha-value>)',
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        // Signature accent — Astroid Gold. Used sparingly.
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          soft: 'rgb(var(--gold-soft) / <alpha-value>)',
          strong: 'rgb(var(--gold-strong) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          foreground: 'rgb(var(--gold-foreground) / <alpha-value>)',
        },
        // Functional colors — never compete with the gold accent.
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          soft: 'rgb(var(--success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          soft: 'rgb(var(--warning-soft) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          soft: 'rgb(var(--danger-soft) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          soft: 'rgb(var(--info-soft) / <alpha-value>)',
        },
        ring: 'rgb(var(--ring) / <alpha-value>)',
      },
      fontFamily: {
        // Brand faces first (used if the org self-hosts them), then the loaded
        // next/font substitute variable, then robust system fallbacks.
        display: [
          'Clash Display',
          'var(--font-display)',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          'Satoshi',
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      fontSize: {
        // Editorial type scale (PRD: 96..12). Large numbers dominate.
        '2xs': ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        xs: ['14px', { lineHeight: '20px' }],
        sm: ['16px', { lineHeight: '24px' }],
        base: ['18px', { lineHeight: '28px' }],
        lg: ['20px', { lineHeight: '30px' }],
        xl: ['24px', { lineHeight: '32px', letterSpacing: '-0.01em' }],
        '2xl': ['28px', { lineHeight: '36px', letterSpacing: '-0.01em' }],
        '3xl': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em' }],
        '4xl': ['40px', { lineHeight: '46px', letterSpacing: '-0.02em' }],
        '5xl': ['48px', { lineHeight: '52px', letterSpacing: '-0.02em' }],
        '6xl': ['64px', { lineHeight: '66px', letterSpacing: '-0.03em' }],
        '7xl': ['72px', { lineHeight: '74px', letterSpacing: '-0.03em' }],
        '8xl': ['96px', { lineHeight: '96px', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        xs: '6px',
        sm: '10px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        button: '10px',
        card: '16px',
        dialog: '24px',
        hero: '32px',
      },
      boxShadow: {
        // Layered, very soft (PRD).
        'soft-1': '0 2px 6px -1px rgb(var(--shadow-color) / 0.08)',
        'soft-2':
          '0 8px 20px -4px rgb(var(--shadow-color) / 0.10), 0 2px 6px -2px rgb(var(--shadow-color) / 0.06)',
        'soft-3':
          '0 24px 48px -12px rgb(var(--shadow-color) / 0.16), 0 8px 20px -8px rgb(var(--shadow-color) / 0.08)',
        gold: '0 8px 28px -6px rgb(var(--gold) / 0.34)',
        'focus-ring': '0 0 0 2px rgb(var(--surface-primary)), 0 0 0 4px rgb(var(--ring))',
      },
      transitionTimingFunction: {
        // Soft, confident, never bouncy.
        astroid: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        slow: '250ms',
        slower: '400ms',
      },
      backgroundImage: {
        'accent-gradient':
          'linear-gradient(135deg, #5B50D6 0%, #7266E3 52%, #8B7FFF 100%)',
        'gold-sheen':
          'linear-gradient(120deg, rgb(var(--gold) / 0.16) 0%, rgb(var(--gold) / 0) 60%)',
      },
      maxWidth: {
        shell: '1600px',
        prose: '68ch',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--gold) / 0.35)' },
          '70%': { boxShadow: '0 0 0 8px rgb(var(--gold) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--gold) / 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms cubic-bezier(0.22,1,0.36,1)',
        'fade-up': 'fade-up 250ms cubic-bezier(0.22,1,0.36,1)',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.22,1,0.36,1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
