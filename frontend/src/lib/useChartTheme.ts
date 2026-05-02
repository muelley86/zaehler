/**
 * Liest die Liquid-Glass-CSS-Variablen aus und gibt sie als Recharts-Farben
 * zurück. Reagiert auf Theme-Wechsel (sowohl System-Setting als auch
 * manueller .light/.dark-Toggle), damit Charts in beiden Modi passende
 * Achsen-, Grid- und Tooltip-Farben nutzen.
 *
 * Typ-Palette folgt der Mockup-Reihenfolge: primary, electricity, water,
 * gas, oil, green — eine harmonische OKLCH-Reihe.
 */

import { useEffect, useState } from 'react';

interface ChartTheme {
  axis: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  label: string;
  palette: string[];
}

function v(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readTheme(): ChartTheme {
  return {
    axis: v('--tertiary') || 'oklch(0.62 0.012 60)',
    grid: v('--separator') || 'oklch(0.85 0.008 60 / 0.4)',
    tooltipBg: v('--surface-solid') || 'oklch(0.99 0.004 70)',
    tooltipBorder: v('--border') || 'oklch(0.88 0.008 60 / 0.5)',
    label: v('--label') || 'oklch(0.18 0.01 60)',
    palette: [
      v('--primary') || 'oklch(0.72 0.17 55)',
      v('--electricity') || 'oklch(0.78 0.16 80)',
      v('--water') || 'oklch(0.70 0.13 220)',
      v('--gas') || 'oklch(0.72 0.14 35)',
      v('--oil') || 'oklch(0.55 0.10 40)',
      v('--green') || 'oklch(0.72 0.15 150)',
    ],
  };
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => readTheme());

  useEffect(() => {
    const reread = () => setTheme(readTheme());

    // System-Theme-Wechsel
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', reread);

    // Manuelle Class-Toggle (.light/.dark) auf <html> beobachten
    const observer = new MutationObserver(reread);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mq.removeEventListener('change', reread);
      observer.disconnect();
    };
  }, []);

  return theme;
}
