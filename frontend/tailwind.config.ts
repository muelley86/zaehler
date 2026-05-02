import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
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
      },
      colors: {
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
      },
      borderRadius: {
        card: '20px',
        sheet: '28px',
        pill: '10px',
        badge: '6px',
      },
      boxShadow: {
        glass:
          '0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(60,40,20,0.04), 0 8px 24px rgba(60,40,20,0.06)',
        'glass-dark':
          '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)',
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
