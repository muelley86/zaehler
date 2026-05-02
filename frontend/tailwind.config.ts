import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Liquid-Glass Standard-Schriften
        sans: [
          '"Inter Tight"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
        // Legacy-Alias — wird in Schritt 9 entfernt
        rounded: ['ui-rounded', '"SF Pro Rounded"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ---- Liquid-Glass-Tokens (DESIGN_TOKENS.md) ----
        bg: 'var(--bg)',
        'bg-wash': 'var(--bg-wash)',
        surface: 'var(--surface)',
        'surface-solid': 'var(--surface-solid)',
        'surface-high': 'var(--surface-high)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        label: 'var(--label)',
        secondary: 'var(--secondary)',
        tertiary: 'var(--tertiary)',
        quaternary: 'var(--quaternary)',
        fill: 'var(--fill)',
        'fill-strong': 'var(--fill-strong)',
        separator: 'var(--separator)',

        primary: 'var(--primary)',
        'primary-deep': 'var(--primary-deep)',
        'primary-soft': 'var(--primary-soft)',

        electricity: 'var(--electricity)',
        gas: 'var(--gas)',
        water: 'var(--water)',
        oil: 'var(--oil)',
        success: 'var(--green)',
        danger: 'var(--red)',

        // ---- Legacy iOS-Tokens (werden in Schritt 9 entfernt) ----
        ios: {
          bg: 'rgb(var(--ios-bg) / <alpha-value>)',
          surface: 'rgb(var(--ios-surface) / <alpha-value>)',
          elevated: 'rgb(var(--ios-elev) / <alpha-value>)',
          fill: 'rgb(var(--ios-fill) / <alpha-value>)',
          label: 'rgb(var(--ios-label) / <alpha-value>)',
          secondary: 'rgb(var(--ios-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--ios-tertiary) / <alpha-value>)',
          separator: 'rgb(var(--ios-separator) / <alpha-value>)',
          blue: '#0a84ff',
          green: '#30d158',
          red: '#ff453a',
          orange: '#ff9f0a',
          yellow: '#ffd60a',
          purple: '#bf5af2',
          pink: '#ff375f',
          gray: '#8e8e93',
        },
      },
      borderRadius: {
        // ---- Liquid-Glass ----
        card: '20px',
        sheet: '28px',
        pill: '10px',
        badge: '6px',
        // ---- Legacy iOS ----
        ios: '0.625rem',
        'ios-lg': '0.875rem',
        'ios-xl': '1.25rem',
      },
      boxShadow: {
        // ---- Liquid-Glass ----
        glass:
          '0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(60,40,20,0.04), 0 8px 24px rgba(60,40,20,0.06)',
        'glass-dark':
          '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)',
        // ---- Legacy iOS ----
        'ios-card': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'ios-elevated': '0 8px 24px rgba(0, 0, 0, 0.10)',
      },
      backdropBlur: {
        glass: '40px',
      },
      backdropSaturate: {
        glass: '180%',
      },
      borderWidth: {
        hairline: '0.5px',
      },
      fontSize: {
        // ---- Liquid-Glass Type-Scale ----
        display: [
          '2.25rem',
          { lineHeight: '2.5rem', fontWeight: '700', letterSpacing: '-0.025em' },
        ],
        'title-1': [
          '2rem',
          { lineHeight: '2.375rem', fontWeight: '700', letterSpacing: '-0.025em' },
        ],
        'title-2': [
          '1.75rem',
          { lineHeight: '2.125rem', fontWeight: '700', letterSpacing: '-0.025em' },
        ],
        'title-3': [
          '1.375rem',
          { lineHeight: '1.75rem', fontWeight: '700', letterSpacing: '-0.02em' },
        ],
        headline: [
          '1.125rem',
          { lineHeight: '1.5rem', fontWeight: '700', letterSpacing: '-0.02em' },
        ],
        body: [
          '0.875rem',
          { lineHeight: '1.25rem', fontWeight: '500', letterSpacing: '-0.005em' },
        ],
        'body-sm': ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '500' }],
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        'caption-bold': [
          '0.75rem',
          { lineHeight: '1rem', fontWeight: '600', letterSpacing: '0.08em' },
        ],
        micro: [
          '0.6875rem',
          { lineHeight: '0.875rem', fontWeight: '600', letterSpacing: '0.08em' },
        ],
        // ---- Legacy iOS-Sizes (werden in Schritt 9 entfernt) ----
        'ios-largetitle': ['2.125rem', { lineHeight: '2.5rem', fontWeight: '700' }],
        'ios-title': ['1.75rem', { lineHeight: '2.125rem', fontWeight: '700' }],
        'ios-title2': ['1.375rem', { lineHeight: '1.75rem', fontWeight: '700' }],
        'ios-headline': ['1.0625rem', { lineHeight: '1.375rem', fontWeight: '600' }],
        'ios-body': ['1.0625rem', { lineHeight: '1.375rem' }],
        'ios-callout': ['1rem', { lineHeight: '1.3125rem' }],
        'ios-subhead': ['0.9375rem', { lineHeight: '1.25rem' }],
        'ios-footnote': ['0.8125rem', { lineHeight: '1.125rem' }],
        'ios-caption': ['0.75rem', { lineHeight: '1rem' }],
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
    },
  },
  plugins: [],
};

export default config;
