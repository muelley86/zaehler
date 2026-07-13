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

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Standard-Bereich: 1. Tag des Vormonats bis letzter Tag des laufenden Monats. */
export function currentAndLastMonthRange(today: Date): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  return { from: isoLocal(new Date(y, m - 1, 1)), to: isoLocal(new Date(y, m + 1, 0)) };
}

function shiftIsoByMonths(iso: string, delta: number): string {
  if (!iso) return iso; // offene Endpunkte unverändert lassen
  const parts = iso.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]); // 1-basiert
  const d = Number(parts[2]);
  // Monatsende bleibt Monatsende (30.06. +1 → 31.07.) — sonst wäre das
  // Pfeil-Stepping für Monats-Bereiche nicht invertierbar; andere Tage werden
  // nur auf den letzten Tag des Zielmonats geclampt (31.03. −1 → 28./29.02.).
  const lastDaySource = new Date(y, m, 0).getDate();
  const lastDayTarget = new Date(y, m + delta, 0).getDate();
  const day = d === lastDaySource ? lastDayTarget : Math.min(d, lastDayTarget);
  return isoLocal(new Date(y, m - 1 + delta, day));
}

export function shiftRangeByMonths(range: DateRange, delta: number): DateRange {
  return {
    from: shiftIsoByMonths(range.from, delta),
    to: shiftIsoByMonths(range.to, delta),
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
