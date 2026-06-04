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

/**
 * Kompakte Darstellung für enge Container (Sidebar): zeigt IMMER beide Daten,
 * Jahre 2-stellig (YY). Bei gleichem Jahr wird das (redundante) Start-Jahr
 * weggelassen — „01.01.–31.12.26"; jahresübergreifend beide Jahre —
 * „15.03.25–20.08.27". Offene Endpunkte fallen aufs volle Format zurück.
 */
export function formatRangeShort(range: DateRange): string {
  const { from, to } = range;
  if (!from || !to) return formatRangeDe(range);
  const f = from.split('-');
  const t = to.split('-');
  const y1 = Number(f[0]);
  const m1 = Number(f[1]);
  const d1 = Number(f[2]);
  const y2 = Number(t[0]);
  const m2 = Number(t[1]);
  const d2 = Number(t[2]);
  if (y1 === y2) return `${pad(d1)}.${pad(m1)}.–${pad(d2)}.${pad(m2)}.${pad(y1 % 100)}`;
  return `${pad(d1)}.${pad(m1)}.${pad(y1 % 100)}–${pad(d2)}.${pad(m2)}.${pad(y2 % 100)}`;
}
