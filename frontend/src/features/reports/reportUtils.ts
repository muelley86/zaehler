/**
 * Reine Helfer für die Auswertungen-Seite: Auflösung relativer Zeiträume in
 * konkrete (lokale) Daten, Vergleichs-Diff zweier Perioden und der Query-Builder
 * für `/reports/aggregate`. Alles ohne Seiteneffekte → unit-testbar.
 */

import type {
  MeterType,
  ReportDimension,
  ReportGranularity,
  ReportPeriodKind,
  ReportRow,
} from '@/lib/types';

export const DIMENSION_LABELS: Record<ReportDimension, string> = {
  measuring_point: 'Messstelle',
  kostenstelle: 'Kostenstelle',
  owner: 'Eigentümer',
  location: 'Standort',
  main_location: 'Hauptstandort',
  meter_type: 'Zählerart',
};

export const GRANULARITY_LABELS: Record<ReportGranularity, string> = {
  total: 'Gesamt',
  day: 'Tag',
  week: 'Woche',
  month: 'Monat',
  year: 'Jahr',
};

export const PERIOD_KIND_LABELS: Record<ReportPeriodKind, string> = {
  current_year: 'Laufendes Jahr',
  last_12_months: 'Letzte 12 Monate',
  current_month: 'Laufender Monat',
  last_month: 'Letzter Monat',
  all: 'Gesamter Zeitraum',
  fixed: 'Benutzerdefiniert',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Lokales `YYYY-MM-DD` eines Date (Browser-Zeitzone). */
function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface Period {
  from: string | null;
  to: string | null;
}

/**
 * Löst eine relative Zeitraum-Definition zum konkreten lokalen Datumsbereich auf.
 * `fixed` liefert `{null, null}` — die festen Daten verwaltet die Seite selbst.
 */
export function resolvePeriod(kind: ReportPeriodKind, today: Date): Period {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-basiert
  switch (kind) {
    case 'current_year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'current_month':
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case 'last_month':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case 'last_12_months':
      // Erster Tag des Monats vor 11 Monaten bis letzter Tag des aktuellen Monats.
      return { from: iso(new Date(y, m - 11, 1)), to: iso(new Date(y, m + 1, 0)) };
    case 'all':
      return { from: null, to: null };
    case 'fixed':
      return { from: null, to: null };
  }
}

export interface ComparisonRow {
  key: string;
  group_label: string;
  meter_type: MeterType;
  unit: string;
  a: number;
  b: number;
  delta: number;
  /** Prozentuale Änderung A ggü. B; `null`, wenn B = 0 und A > 0 (nicht definiert). */
  pct: number | null;
}

function rowKey(r: ReportRow): string {
  return `${r.group_key ?? 'null'}|${r.group_label}|${r.meter_type}|${r.unit}`;
}

/**
 * Stellt zwei Perioden je `(Gruppe, Zählerart, Einheit)` gegenüber. A = aktuelle
 * Periode, B = Vergleichsperiode. Zeilen, die nur in einer Periode vorkommen,
 * erscheinen mit 0 auf der fehlenden Seite.
 */
export function diffRows(rowsA: ReportRow[], rowsB: ReportRow[]): ComparisonRow[] {
  const map = new Map<string, ComparisonRow>();
  const ensure = (r: ReportRow): ComparisonRow => {
    const key = rowKey(r);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        group_label: r.group_label,
        meter_type: r.meter_type,
        unit: r.unit,
        a: 0,
        b: 0,
        delta: 0,
        pct: null,
      };
      map.set(key, row);
    }
    return row;
  };
  for (const r of rowsA) ensure(r).a += Number(r.consumption);
  for (const r of rowsB) ensure(r).b += Number(r.consumption);
  const out = [...map.values()];
  for (const row of out) {
    row.delta = row.a - row.b;
    row.pct = row.b === 0 ? (row.a === 0 ? 0 : null) : (row.delta / row.b) * 100;
  }
  out.sort((x, y) => x.group_label.localeCompare(y.group_label) || x.unit.localeCompare(y.unit));
  return out;
}

export interface AggregateQuery {
  dimension: ReportDimension;
  granularity: ReportGranularity;
  from: string | null;
  to: string | null;
  mainLocationIds: number[];
  locationIds: number[];
  ownerIds: number[];
  kostenstellen: number[];
  meterTypes: MeterType[];
}

/** Baut den Query-String für `/reports/aggregate(.csv)`. */
export function buildAggregateQuery(q: AggregateQuery): string {
  const p = new URLSearchParams();
  p.set('dimension', q.dimension);
  p.set('granularity', q.granularity);
  if (q.from) p.set('from_at', q.from);
  if (q.to) p.set('to_at', q.to);
  for (const id of q.mainLocationIds) p.append('main_location_id', String(id));
  for (const id of q.locationIds) p.append('location_id', String(id));
  for (const id of q.ownerIds) p.append('owner_id', String(id));
  for (const k of q.kostenstellen) p.append('kostenstelle', String(k));
  for (const t of q.meterTypes) p.append('meter_type', t);
  return p.toString();
}
