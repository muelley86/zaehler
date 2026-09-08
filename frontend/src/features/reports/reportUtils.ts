/**
 * Reine Helfer für die Auswertungen-Seite: Auflösung relativer Zeiträume in
 * konkrete (lokale) Daten, Vergleichs-Diff zweier Perioden und der Query-Builder
 * für `/reports/aggregate`. Alles ohne Seiteneffekte → unit-testbar.
 */

import { shiftRangeByMonths } from '@/lib/dateRange';
import { formatDateDe } from '@/lib/format';
import { TYPE_LABELS } from '@/lib/meterLabels';
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
  shared_range: 'Aktueller Zeitraum',
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
    case 'shared_range':
      // Der globale Datumsbereich wird vom Aufrufer (ReportsPage) injiziert.
      return { from: null, to: null };
  }
}

export type CompareKind = 'previous_year' | 'previous_period' | 'custom';

export const COMPARE_KIND_LABELS: Record<CompareKind, string> = {
  previous_year: 'Vorjahr',
  previous_period: 'Vorperiode',
  custom: 'Benutzerdefiniert',
};

const OPEN_PERIOD: Period = { from: null, to: null };

function parseLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function isMonthAligned(from: Date, to: Date): boolean {
  return from.getDate() === 1 && to.getDate() === lastDayOfMonth(to).getDate();
}

/** Gleicher Bereich ein Jahr früher (Monatsende bleibt Monatsende). */
export function previousYearRange(p: Period): Period {
  if (!p.from || !p.to) return OPEN_PERIOD;
  return shiftRangeByMonths({ from: p.from, to: p.to }, -12);
}

/**
 * Die direkt vorangehende Periode — Regel wie im Backend (`services/dashboard.py::
 * previous_range`): monatsaligned → gleich viele ganze Monate zurück, sonst
 * gleiche Tageslänge endend am Tag vor `from`.
 */
export function previousPeriodRange(p: Period): Period {
  if (!p.from || !p.to) return OPEN_PERIOD;
  const from = parseLocal(p.from);
  const to = parseLocal(p.to);
  if (isMonthAligned(from, to)) {
    const months =
      (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
    const start = new Date(from.getFullYear(), from.getMonth() - months, 1);
    const end = lastDayOfMonth(new Date(to.getFullYear(), to.getMonth() - months, 1));
    return { from: iso(start), to: iso(end) };
  }
  const lengthDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const end = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (lengthDays - 1));
  return { from: iso(start), to: iso(end) };
}

/** Periode 2 des Vergleichs aus Art, Periode 1 und den freien Feldern. */
export function resolveComparePeriod(
  kind: CompareKind,
  period: Period,
  customFrom: string,
  customTo: string,
): Period {
  switch (kind) {
    case 'previous_year':
      return previousYearRange(period);
    case 'previous_period':
      return previousPeriodRange(period);
    case 'custom':
      return { from: customFrom || null, to: customTo || null };
  }
}

/**
 * Lesbares Label eines ausgeführten Auswertungs-Zeitraums (Spaltenkopf im
 * Perioden-Vergleich). Offene Enden und der Gesamtzeitraum sind abgedeckt.
 */
export function periodLabel(from: string | null, to: string | null): string {
  if (from && to) return `${formatDateDe(from)} – ${formatDateDe(to)}`;
  if (from) return `ab ${formatDateDe(from)}`;
  if (to) return `bis ${formatDateDe(to)}`;
  return PERIOD_KIND_LABELS.all;
}

/** Fertige Zeitraum-Labels des Vergleichs: A = Hauptzeitraum, B = Vergleichszeitraum. */
export interface ComparisonPeriods {
  a: string;
  b: string;
}

const DIRECTION_LABELS = { bezug: 'Bezug', einspeisung: 'Einspeisung' } as const;

interface DirectionRow {
  group_key: number | null;
  group_label: string;
  meter_type: MeterType;
  direction: 'bezug' | 'einspeisung';
}

/** Gruppen-Identität für die Richtungs-Kennzeichnung: Gruppe + Zählerart. */
function directionGroupKey(r: DirectionRow): string {
  return `${r.group_key ?? 'null'}|${r.group_label}|${r.meter_type}`;
}

/** Gruppen, die mindestens eine Einspeisungs-Zeile haben (= bidirektional). */
export function groupsWithEinspeisung(rows: readonly DirectionRow[]): Set<string> {
  return new Set(rows.filter((r) => r.direction === 'einspeisung').map(directionGroupKey));
}

/**
 * Richtungs-Label für eine Tabellenzeile: Einspeisung immer, Bezug nur bei
 * bidirektionalen Gruppen (sonst wäre „Bezug" an Gas/Wasser-Zeilen Rauschen).
 */
export function directionSuffix(row: DirectionRow, bidiGroups: Set<string>): string | null {
  if (row.direction === 'einspeisung') return DIRECTION_LABELS.einspeisung;
  return bidiGroups.has(directionGroupKey(row)) ? DIRECTION_LABELS.bezug : null;
}

/** Label-Suffix für verrechnete (virtuelle) Messstellen-Zeilen. */
export function displayGroupLabel(label: string, isVirtual: boolean | undefined): string {
  return isVirtual ? `${label} (verrechnet)` : label;
}

export interface ComparisonRow {
  key: string;
  group_key: number | null;
  group_label: string;
  meter_type: MeterType;
  unit: string;
  /** Einspeise-Zeilen (OBIS 2.8.x) getrennt vom Bezug vergleichen. */
  direction: 'bezug' | 'einspeisung';
  /** Verrechnete (virtuelle) Messstelle — getrennt von echten MPs mit gleicher ID. */
  is_virtual: boolean;
  a: number;
  b: number;
  delta: number;
  /** Prozentuale Änderung A ggü. B; `null`, wenn B = 0 und A > 0 (nicht definiert). */
  pct: number | null;
}

/**
 * Stabile Zeilen-Identität je `(Gruppe, Zählerart, Einheit, Richtung)` — für den
 * Perioden-Vergleich und als Serien-Schlüssel im Diagramm.
 */
export function rowKey(r: ReportRow): string {
  // `is_virtual` gehört in den Key: eine virtuelle Messstelle kann dieselbe
  // group_key-ID tragen wie eine echte.
  const ns = r.is_virtual ? 'v' : 'r';
  return `${ns}|${r.group_key ?? 'null'}|${r.group_label}|${r.meter_type}|${r.unit}|${r.direction}`;
}

/**
 * Stellt zwei Perioden je `(Gruppe, Zählerart, Einheit, Richtung)` gegenüber.
 * A = aktuelle Periode, B = Vergleichsperiode. Zeilen, die nur in einer Periode
 * vorkommen, erscheinen mit 0 auf der fehlenden Seite.
 */
export function diffRows(rowsA: ReportRow[], rowsB: ReportRow[]): ComparisonRow[] {
  const map = new Map<string, ComparisonRow>();
  const ensure = (r: ReportRow): ComparisonRow => {
    const key = rowKey(r);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        group_key: r.group_key,
        group_label: r.group_label,
        meter_type: r.meter_type,
        unit: r.unit,
        direction: r.direction,
        is_virtual: r.is_virtual ?? false,
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

/** Komma-Dezimal für deutsches Excel. */
function csvNumber(n: number): string {
  return String(n).replace('.', ',');
}

/**
 * Zeilen der Vergleichs-CSV — Kopf wie die angezeigte Tabelle (Zeiträume als
 * Spaltennamen), Werte mit Komma-Dezimal.
 */
export function comparisonCsvRows(
  rows: readonly ComparisonRow[],
  p: ComparisonPeriods,
): string[][] {
  return [
    ['Gruppe', 'Zählerart', 'Richtung', 'Einheit', p.a, p.b, 'Differenz'],
    ...rows.map((r) => [
      r.group_label,
      TYPE_LABELS[r.meter_type],
      DIRECTION_LABELS[r.direction],
      r.unit,
      csvNumber(r.a),
      csvNumber(r.b),
      csvNumber(r.delta),
    ]),
  ];
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
  measuringPointIds: number[];
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
  for (const id of q.measuringPointIds) p.append('measuring_point_id', String(id));
  return p.toString();
}

export interface RunGateInput {
  periodKind: ReportPeriodKind;
  customFrom: string;
  customTo: string;
  /** Aufgelöste Periode 1 (für Vorjahr/Vorperiode nötig). */
  periodFrom: string | null;
  periodTo: string | null;
  compare: boolean;
  compareKind: CompareKind;
  compareFrom: string;
  compareTo: string;
}

/**
 * Warum gerade NICHT ausgewertet werden kann — `null`, wenn alles bereit ist.
 * Alle anderen Filter haben Standardwerte; nur die freien Datumsfelder können
 * unvollständig sein (sonst liefe die Auswertung stumm über den Gesamtzeitraum).
 */
export function runBlocker(g: RunGateInput): string | null {
  if (g.periodKind === 'fixed' && !(g.customFrom && g.customTo)) {
    return 'Für „Benutzerdefiniert" Von- und Bis-Datum angeben.';
  }
  if (g.compare && g.compareKind === 'custom' && !(g.compareFrom && g.compareTo)) {
    return 'Für den Vergleich beide Vergleichsdaten angeben.';
  }
  if (g.compare && g.compareKind !== 'custom' && !(g.periodFrom && g.periodTo)) {
    return 'Für Vorjahr/Vorperiode einen begrenzten Zeitraum wählen – oder Periode 2 benutzerdefiniert angeben.';
  }
  return null;
}
