/**
 * Reiner Adapter Auswertungs-Zeilen → Diagramm-Gruppen. Ein Chart je
 * (Zählerart, Einheit); innerhalb der Gruppe entweder
 * - `categorical`: ein Balken je Ergebnis-Zeile (Auflösung „Gesamt" bzw.
 *   Perioden-Vergleich mit beiden Zeiträumen nebeneinander), oder
 * - `timeseries`: eine Serie je Gruppe(+Richtung) über `period_end`.
 * Ohne Seiteneffekte → unit-testbar.
 */

import { TYPE_ORDER } from '@/lib/meterLabels';
import type { MeterType, ReportGranularity, ReportRow } from '@/lib/types';
import { directionSuffix, displayGroupLabel, groupsWithEinspeisung, rowKey } from './reportUtils';
import type { ComparisonPeriods, ComparisonRow } from './reportUtils';

export type ReportChartType = 'line' | 'bar';
export type ReportChartMode = 'categorical' | 'timeseries';

/** Ein Datenpunkt: `x` = Gruppen-Label (categorical) bzw. `period_end` (timeseries). */
export type ReportChartDatum = Record<string, number | string> & { x: string };

export interface ReportChartGroup {
  /** `${meter_type}::${unit}` — Section-Key. */
  id: string;
  meterType: MeterType;
  unit: string;
  mode: ReportChartMode;
  seriesKeys: string[];
  labelOf: Record<string, string>;
  data: ReportChartDatum[];
}

/** Serien-Schlüssel des Einzel-Balkens bzw. der beiden Vergleichs-Balken. */
export const VALUE_KEY = 'value';
export const COMPARE_A_KEY = 'a';
export const COMPARE_B_KEY = 'b';

// Über dieser Serienzahl wird ein nicht-blockierender Hinweis eingeblendet,
// die Auswahl (z. B. über die Filter) einzugrenzen — sehr viele Linien/Balken
// werden sonst unleserlich.
export const MAX_CHART_SERIES_HINT = 25;

interface LabelRow {
  group_key: number | null;
  group_label: string;
  meter_type: MeterType;
  direction: 'bezug' | 'einspeisung';
  is_virtual?: boolean;
}

/** Anzeige-Label wie in der Tabelle: „(verrechnet)" + „· Einspeisung"/„· Bezug". */
function seriesLabel(r: LabelRow, bidiGroups: Set<string>): string {
  const base = displayGroupLabel(r.group_label, r.is_virtual);
  const suffix = directionSuffix(r, bidiGroups);
  return suffix ? `${base} · ${suffix}` : base;
}

function groupId(meterType: MeterType, unit: string): string {
  return `${meterType}::${unit}`;
}

function sortGroups(groups: ReportChartGroup[]): ReportChartGroup[] {
  return [...groups].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.meterType) - TYPE_ORDER.indexOf(b.meterType) ||
      a.unit.localeCompare(b.unit),
  );
}

/** Sammelt Zeilen je (Zählerart, Einheit) in Einfüge-Reihenfolge. */
function partition<T extends { meter_type: MeterType; unit: string }>(
  rows: readonly T[],
): Array<{ meterType: MeterType; unit: string; rows: T[] }> {
  const map = new Map<string, { meterType: MeterType; unit: string; rows: T[] }>();
  for (const r of rows) {
    const id = groupId(r.meter_type, r.unit);
    const bucket = map.get(id) ?? { meterType: r.meter_type, unit: r.unit, rows: [] };
    map.set(id, { ...bucket, rows: [...bucket.rows, r] });
  }
  return [...map.values()];
}

function categoricalFromRows(rows: ReportRow[]): ReportChartGroup[] {
  const bidiGroups = groupsWithEinspeisung(rows);
  return sortGroups(
    partition(rows).map(({ meterType, unit, rows: groupRows }) => ({
      id: groupId(meterType, unit),
      meterType,
      unit,
      mode: 'categorical',
      seriesKeys: [VALUE_KEY],
      labelOf: { [VALUE_KEY]: 'Verbrauch' },
      data: groupRows.map((r) => ({
        x: seriesLabel(r, bidiGroups),
        [VALUE_KEY]: Number(r.consumption),
      })),
    })),
  );
}

const DEFAULT_COMPARISON_LABELS: ComparisonPeriods = { a: 'Aktuell', b: 'Vergleich' };

function categoricalFromComparison(
  rows: ComparisonRow[],
  labels: ComparisonPeriods,
): ReportChartGroup[] {
  const bidiGroups = groupsWithEinspeisung(rows);
  return sortGroups(
    partition(rows).map(({ meterType, unit, rows: groupRows }) => ({
      id: groupId(meterType, unit),
      meterType,
      unit,
      mode: 'categorical',
      seriesKeys: [COMPARE_A_KEY, COMPARE_B_KEY],
      labelOf: { [COMPARE_A_KEY]: labels.a, [COMPARE_B_KEY]: labels.b },
      data: groupRows.map((r) => ({
        x: seriesLabel(r, bidiGroups),
        [COMPARE_A_KEY]: r.a,
        [COMPARE_B_KEY]: r.b,
      })),
    })),
  );
}

function timeseriesFromRows(rows: ReportRow[]): ReportChartGroup[] {
  const bidiGroups = groupsWithEinspeisung(rows);
  return sortGroups(
    partition(rows).map(({ meterType, unit, rows: groupRows }) => {
      const labelOf: Record<string, string> = {};
      const byDate = new Map<string, Record<string, number>>();
      for (const r of groupRows) {
        if (r.period_end === null) continue;
        const key = rowKey(r);
        labelOf[key] = seriesLabel(r, bidiGroups);
        const datum = byDate.get(r.period_end) ?? {};
        byDate.set(r.period_end, {
          ...datum,
          [key]: (datum[key] ?? 0) + Number(r.consumption),
        });
      }
      const data = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([x, values]) => ({ x, ...values }));
      return {
        id: groupId(meterType, unit),
        meterType,
        unit,
        mode: 'timeseries',
        seriesKeys: Object.keys(labelOf),
        labelOf,
        data,
      };
    }),
  );
}

export interface BuildReportChartInput {
  rows: ReportRow[];
  /** Gesetzt im Vergleichsmodus → kategorische Balken je Periode. */
  comparison: ComparisonRow[] | null;
  /** Effektive Auflösung des Laufs; `total` → kategorisch. */
  granularity: ReportGranularity;
  /** Zeitraum-Labels der beiden Vergleichs-Serien (wie die Tabellen-Köpfe). */
  comparisonLabels?: ComparisonPeriods;
}

export function buildReportChartGroups(input: BuildReportChartInput): ReportChartGroup[] {
  if (input.comparison !== null) {
    return categoricalFromComparison(
      input.comparison,
      input.comparisonLabels ?? DEFAULT_COMPARISON_LABELS,
    );
  }
  if (input.granularity === 'total') return categoricalFromRows(input.rows);
  return timeseriesFromRows(input.rows);
}

/** Gesamtzahl der Serien über alle Gruppen (für den Lesbarkeits-Hinweis). */
export function countSeries(groups: readonly ReportChartGroup[]): number {
  return groups.reduce(
    (n, g) => n + (g.mode === 'timeseries' ? g.seriesKeys.length : g.data.length),
    0,
  );
}
