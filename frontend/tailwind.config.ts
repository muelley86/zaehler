import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        rounded: ['ui-rounded', '"SF Pro Rounded"', 'system-ui', 'sans-serif'],
      },
      colors: {
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
        ios: '0.625rem',
        'ios-lg': '0.875rem',
        'ios-xl': '1.25rem',
      },
      boxShadow: {
        'ios-card': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'ios-elevated': '0 8px 24px rgba(0, 0, 0, 0.10)',
      },
      fontSize: {
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
