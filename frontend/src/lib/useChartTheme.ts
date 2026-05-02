/**
 * Liest die iOS-CSS-Variablen aus und gibt sie als Recharts-Farben zurück.
 *
 * Reagiert auf System-Theme-Wechsel (`prefers-color-scheme`), damit Charts
 * im Light- und Dark-Mode passende Achsen-, Grid- und Tooltip-Farben nutzen.
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

function readTheme(): ChartTheme {
  const styles = getComputedStyle(document.documentElement);
  const tertiary = styles.getPropertyValue('--ios-tertiary').trim();
  const separator = styles.getPropertyValue('--ios-separator').trim();
  const surface = styles.getPropertyValue('--ios-surface').trim();
  const label = styles.getPropertyValue('--ios-label').trim();
  return {
    axis: `rgb(${tertiary})`,
    grid: `rgb(${separator})`,
    tooltipBg: `rgb(${surface})`,
    tooltipBorder: `rgb(${separator})`,
    label: `rgb(${label})`,
    palette: ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#5e5ce6'],
  };
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => readTheme());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setTheme(readTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return theme;
}
