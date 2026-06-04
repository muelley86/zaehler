/**
 * Reine Helfer für den globalen Datumsbereich. Arbeiten auf `YYYY-MM-DD`-Strings
 * in lokaler Zeit (kein `new Date(str)`-UTC-Parsing) — konsistent mit
 * `reportUtils.resolvePeriod`/`defaultGranularity`.
 */

import { formatDateDe } from './format';

export interface DateRange {
  from: string;
  to: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function currentYearRange(today: Date): DateRange {
  const y = today.getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function shiftIsoByYears(iso: string, delta: number): string {
  if (!iso) return iso; // offene Endpunkte unverändert lassen
  const parts = iso.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  let d = Number(parts[2]);
  const ny = y + delta;
  // 29. Februar im Nicht-Schaltjahr auf den 28. clampen.
  if (m === 2 && d === 29 && !isLeapYear(ny)) d = 28;
  return `${ny}-${pad(m)}-${pad(d)}`;
}

export function shiftRangeByYears(range: DateRange, delta: number): DateRange {
  return {
    from: shiftIsoByYears(range.from, delta),
    to: shiftIsoByYears(range.to, delta),
  };
}

export function formatRangeDe(range: DateRange): string {
  return `${formatDateDe(range.from)} – ${formatDateDe(range.to)}`;
}
