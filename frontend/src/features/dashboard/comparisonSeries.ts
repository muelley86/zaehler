/**
 * Reiner Helfer für den Dashboard-Vergleichs-Chart: verdichtet den gebündelten
 * `/dashboard`-Verbrauch mehrerer Messstellen zu Vergleichs-Serien.
 *
 * - **Ein Chart pro `(Zählerart, Einheit)`-Gruppe** — verschiedene Einheiten
 *   teilen nie eine Y-Achse (entspricht der Backend-Invariante in
 *   `services/report_aggregation.py`).
 * - **Eine Serie je Messstelle**, deren Register summiert werden. Ausnahme:
 *   bidirektionaler Strom — Bezug (OBIS `1.8.x`) und Einspeisung (`2.8.x`)
 *   werden als zwei getrennte Serien geführt (sonst würde man Bezug und
 *   Einspeisung physikalisch unsinnig addieren).
 *
 * Bewusst frei von React/Recharts, damit isoliert unit-testbar.
 */

import type {
  ConsumptionPoint,
  DashboardVirtualMeasuringPoint,
  MeasuringPointRead,
  MeterType,
} from '@/lib/types';
import { TYPE_ORDER } from '@/lib/meterLabels';

/** Eine Chart-Zeile: ein Datum plus je Serie ein Wert. */
export type ComparisonRow = Record<string, number | string> & { date: string };

export interface ComparisonGroup {
  type: MeterType;
  unit: string;
  /** Serien-Schlüssel (`mp-<id>::draw|feed`), deterministisch nach Label sortiert. */
  seriesKeys: string[];
  /** Anzeige-Label je Serien-Schlüssel. */
  labelOf: Record<string, string>;
  series: ComparisonRow[];
}

/** Nur diese Felder der Messstelle werden gebraucht — hält den Helper testbar. */
type MpLike = Pick<MeasuringPointRead, 'id' | 'name' | 'type'>;
type Flow = 'draw' | 'feed';

/** Einspeisung = OBIS 2.8.x; alles andere (1.8.x, Gas, Wasser, Wärme) = Bezug. */
function classifyFlow(obisCode: string): Flow {
  return obisCode.startsWith('2.8') ? 'feed' : 'draw';
}

interface GroupAcc {
  type: MeterType;
  unit: string;
  rows: Map<string, Record<string, number>>; // period_end → { seriesKey: Summe }
  seriesKeys: Set<string>;
}

export function buildComparisonGroups(input: {
  filteredPoints: MpLike[];
  consumptions: Record<number, ConsumptionPoint[]>;
  /** Verrechnete Messstellen: Netto-Serien (Key `vmp-<id>`, kein draw/feed-Split). */
  virtualItems?: DashboardVirtualMeasuringPoint[];
}): ComparisonGroup[] {
  const { filteredPoints, consumptions, virtualItems = [] } = input;

  const groups = new Map<string, GroupAcc>();
  const flowsByMp = new Map<number, Set<Flow>>();
  const nameById = new Map<number, string>();
  const virtualNameByKey = new Map<string, string>();

  for (const point of filteredPoints) {
    nameById.set(point.id, point.name);
    for (const p of consumptions[point.id] ?? []) {
      const flow = classifyFlow(p.obis_code);
      let flows = flowsByMp.get(point.id);
      if (!flows) {
        flows = new Set();
        flowsByMp.set(point.id, flows);
      }
      flows.add(flow);

      const groupKey = `${point.type}::${p.unit}`;
      let acc = groups.get(groupKey);
      if (!acc) {
        acc = { type: point.type, unit: p.unit, rows: new Map(), seriesKeys: new Set() };
        groups.set(groupKey, acc);
      }
      const seriesKey = `mp-${point.id}::${flow}`;
      acc.seriesKeys.add(seriesKey);
      let row = acc.rows.get(p.period_end);
      if (!row) {
        row = {};
        acc.rows.set(p.period_end, row);
      }
      row[seriesKey] = (row[seriesKey] ?? 0) + Number(p.consumption);
    }
  }

  // Verrechnete Messstellen: eine Netto-Serie je vmp (eigener `vmp-`-Namensraum,
  // keine Kollision mit echten MP-IDs). Negative Bucket-Werte laufen unverändert
  // durch — der Chart stellt sie unterhalb der Nulllinie dar.
  for (const vmp of virtualItems) {
    const seriesKey = `vmp-${vmp.id}`;
    virtualNameByKey.set(seriesKey, `${vmp.name} (verrechnet)`);
    for (const p of vmp.consumption) {
      const groupKey = `${vmp.type}::${p.unit}`;
      let acc = groups.get(groupKey);
      if (!acc) {
        acc = { type: vmp.type, unit: p.unit, rows: new Map(), seriesKeys: new Set() };
        groups.set(groupKey, acc);
      }
      acc.seriesKeys.add(seriesKey);
      let row = acc.rows.get(p.period_end);
      if (!row) {
        row = {};
        acc.rows.set(p.period_end, row);
      }
      row[seriesKey] = (row[seriesKey] ?? 0) + Number(p.consumption);
    }
  }

  const labelFor = (seriesKey: string): string => {
    const virtualName = virtualNameByKey.get(seriesKey);
    if (virtualName !== undefined) return virtualName;
    const sep = seriesKey.indexOf('::');
    const id = Number(seriesKey.slice(3, sep));
    const flow = seriesKey.slice(sep + 2) as Flow;
    const name = nameById.get(id) ?? seriesKey;
    const flows = flowsByMp.get(id);
    if (flows && flows.size > 1) {
      return flow === 'feed' ? `${name} (Einspeisung)` : `${name} (Bezug)`;
    }
    return name;
  };

  const result: ComparisonGroup[] = [];
  for (const acc of groups.values()) {
    const labelOf: Record<string, string> = {};
    for (const k of acc.seriesKeys) labelOf[k] = labelFor(k);
    const seriesKeys = [...acc.seriesKeys].sort((a, b) => {
      const la = labelOf[a] ?? a;
      const lb = labelOf[b] ?? b;
      const cmp = la.localeCompare(lb, 'de');
      return cmp !== 0 ? cmp : a.localeCompare(b);
    });
    const series: ComparisonRow[] = [...acc.rows.entries()]
      .map(([date, vals]) => {
        const out: ComparisonRow = { date };
        for (const [k, v] of Object.entries(vals)) out[k] = v;
        return out;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    result.push({ type: acc.type, unit: acc.unit, seriesKeys, labelOf, series });
  }

  result.sort((a, b) => {
    const t = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    return t !== 0 ? t : a.unit.localeCompare(b.unit);
  });

  return result;
}
