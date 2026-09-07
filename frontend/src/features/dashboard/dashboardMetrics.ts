/**
 * Reine Metrik-Selektoren: KPI-Kacheln, Hinweise und Top-Verbraucher (Filter
 * stehen in `dashboardSelectors.ts`). Zahlen sind Decimal-Strings vom Backend;
 * `Number(...)` liefert bei `null`/ungültigen Werten `NaN` — solche Beiträge
 * zählen nirgends mit.
 */

import type {
  DashboardMeasuringPoint,
  DashboardVirtualMeasuringPoint,
  FlowDirection,
  MeterType,
} from '@/lib/types';
import { TYPE_LABELS, TYPE_ORDER } from '@/lib/meterLabels';

/** Addiert einen optionalen Decimal-String zu einer laufenden Summe; `null`/NaN tragen nicht bei. */
function addContribution(sum: number, addend: string | null): number {
  if (addend === null) return sum;
  const n = Number(addend);
  return Number.isNaN(n) ? sum : sum + n;
}

/** Bucket per Key holen (oder mit `seed()` anlegen), current/previous addieren, zurückschreiben. */
function accumulate<B extends { current: number; previous: number }>(
  map: Map<string, B>,
  key: string,
  seed: () => B,
  current: string | null,
  previous: string | null,
): void {
  const bucket = map.get(key) ?? seed();
  bucket.current = addContribution(bucket.current, current);
  bucket.previous = addContribution(bucket.previous, previous);
  map.set(key, bucket);
}

// --- KPI ----------------------------------------------------------------

export type Sentiment = 'good' | 'bad' | 'neutral';

export interface KpiTile {
  key: string;
  type: MeterType;
  unit: string;
  direction: FlowDirection;
  label: string;
  current: number;
  previous: number | null;
  deltaPct: number | null;
  trend: 'up' | 'down' | 'flat' | 'none';
  sentiment: Sentiment;
  vmpId?: number;
}

function classifyTrend(deltaPct: number | null, flatPct: number): KpiTile['trend'] {
  if (deltaPct === null) return 'none';
  if (Math.abs(deltaPct) < flatPct) return 'flat';
  return deltaPct > 0 ? 'up' : 'down';
}

function classifySentiment(direction: FlowDirection, trend: KpiTile['trend']): Sentiment {
  if (trend === 'flat' || trend === 'none') return 'neutral';
  const isUp = trend === 'up';
  if (direction === 'bezug') return isUp ? 'bad' : 'good';
  return isUp ? 'good' : 'bad'; // Einspeisung: invertiert
}

/** `previous`/`deltaPct`/`trend` einer Kachel — `null`/`'none'`, wenn `eligible` false ist. */
function computeDelta(
  current: number,
  previousRaw: number,
  eligible: boolean,
  flatPct: number,
): { previous: number | null; deltaPct: number | null; trend: KpiTile['trend'] } {
  if (!eligible) return { previous: null, deltaPct: null, trend: 'none' };
  const deltaPct = ((current - previousRaw) / previousRaw) * 100;
  return { previous: previousRaw, deltaPct, trend: classifyTrend(deltaPct, flatPct) };
}

interface KpiBucket {
  type: MeterType;
  unit: string;
  direction: FlowDirection;
  current: number;
  previous: number;
}

/** Nur die vmp-Buckets brauchen zusätzlich `vmpId`/`name` — sonst identisch zu `KpiBucket`. */
interface VmpKpiBucket extends KpiBucket {
  vmpId: number;
  name: string;
}

/**
 * Eine Kachel je (Zählerart, Einheit, Richtung) über alle Items summiert
 * (HT+NT zusammen, `2.8.x` getrennt als Einspeisung), plus eine Kachel je
 * (vmp, Einheit) für verrechnete Messstellen.
 */
export function selectKpiTiles(
  items: DashboardMeasuringPoint[],
  virtualItems: DashboardVirtualMeasuringPoint[],
  opts: { flatPct: number } = { flatPct: 1 },
): KpiTile[] {
  const { flatPct } = opts;
  const buckets = new Map<string, KpiBucket>();
  for (const item of items) {
    for (const t of item.totals) {
      const key = `${item.type}::${t.unit}::${t.direction}`;
      accumulate(
        buckets,
        key,
        () => ({ type: item.type, unit: t.unit, direction: t.direction, current: 0, previous: 0 }),
        t.current,
        t.previous,
      );
    }
  }

  const vmpBuckets = new Map<string, VmpKpiBucket>();
  for (const v of virtualItems) {
    for (const t of v.totals) {
      // Kein Richtungs-Teil im Key: das Backend liefert virtuelle `totals`
      // mit `obis_code='virtual'`, ein Eintrag je Einheit — keine Bezug-/
      // Einspeisung-Aufteilung für die Netto-Serie einer vmp.
      const key = `vmp::${v.id}::${t.unit}`;
      accumulate(
        vmpBuckets,
        key,
        () => ({
          type: v.type,
          unit: t.unit,
          direction: t.direction,
          current: 0,
          previous: 0,
          vmpId: v.id,
          name: v.name,
        }),
        t.current,
        t.previous,
      );
    }
  }

  const tiles: KpiTile[] = [];
  for (const [key, b] of buckets) {
    const base = baseKpiFields(key, b, flatPct, b.previous > 0);
    tiles.push({
      ...base,
      label: TYPE_LABELS[b.type] + (b.direction === 'einspeisung' ? ' · Einspeisung' : ''),
      sentiment: classifySentiment(b.direction, base.trend),
    });
  }
  for (const [key, b] of vmpBuckets) {
    const base = baseKpiFields(key, b, flatPct, b.previous > 0 && b.current >= 0);
    tiles.push({
      ...base,
      label: `${b.name} (verrechnet)`,
      // Verrechnete Messstellen haben keine natürliche Bezug/Einspeisung-
      // Richtung — ein Sentiment (gut/schlecht) ist daraus nicht ableitbar.
      sentiment: 'neutral',
      vmpId: b.vmpId,
    });
  }

  tiles.sort(compareKpiTiles);
  return tiles;
}

/** Die Felder, die reale und vmp-Kacheln gemeinsam haben — Delta/Trend zentral berechnet. */
function baseKpiFields(key: string, b: KpiBucket, flatPct: number, eligible: boolean) {
  const { previous, deltaPct, trend } = computeDelta(b.current, b.previous, eligible, flatPct);
  return {
    key,
    type: b.type,
    unit: b.unit,
    direction: b.direction,
    current: b.current,
    previous,
    deltaPct,
    trend,
  };
}

function compareKpiTiles(a: KpiTile, b: KpiTile): number {
  const aVmp = a.vmpId !== undefined;
  const bVmp = b.vmpId !== undefined;
  if (aVmp !== bVmp) return aVmp ? 1 : -1;
  if (aVmp && bVmp) return a.label.localeCompare(b.label, 'de');
  const typeCmp = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
  if (typeCmp !== 0) return typeCmp;
  if (a.direction !== b.direction) return a.direction === 'bezug' ? -1 : 1;
  return a.unit.localeCompare(b.unit, 'de');
}

// --- Hinweise -------------------------------------------------------------

export const STALE_AFTER_DAYS = 45;
export const DEVIATION_PCT = 30;

const MS_PER_DAY = 86_400_000;

interface StaleInsight {
  kind: 'stale';
  mpId: number;
  name: string;
  lastReadingAt: string | null;
  daysSince: number | null;
}

interface DeviationInsight {
  kind: 'deviation';
  mpId: number;
  name: string;
  unit: string;
  direction: FlowDirection;
  current: number;
  previous: number;
  deltaPct: number;
}

export type Insight = StaleInsight | DeviationInsight;

function selectStaleInsights(
  items: DashboardMeasuringPoint[],
  now: Date,
  staleAfterDays: number,
): StaleInsight[] {
  const result: StaleInsight[] = [];
  for (const item of items) {
    if (item.last_reading_at === null) {
      result.push({
        kind: 'stale',
        mpId: item.id,
        name: item.name,
        lastReadingAt: null,
        daysSince: null,
      });
      continue;
    }
    const daysSince = Math.floor(
      (now.getTime() - new Date(item.last_reading_at).getTime()) / MS_PER_DAY,
    );
    if (daysSince > staleAfterDays) {
      result.push({
        kind: 'stale',
        mpId: item.id,
        name: item.name,
        lastReadingAt: item.last_reading_at,
        daysSince,
      });
    }
  }
  return result.sort((a, b) => {
    if (a.daysSince === null) return b.daysSince === null ? 0 : -1;
    if (b.daysSince === null) return 1;
    return b.daysSince - a.daysSince;
  });
}

/** Gleiche Form wie `KpiBucket` ohne `type` — Abweichungs-Buckets sind je Item schon typisiert. */
type DeviationBucket = Omit<KpiBucket, 'type'>;

function selectDeviationInsights(
  items: DashboardMeasuringPoint[],
  deviationPct: number,
): DeviationInsight[] {
  const result: DeviationInsight[] = [];
  for (const item of items) {
    const buckets = new Map<string, DeviationBucket>();
    for (const t of item.totals) {
      const key = `${t.unit}::${t.direction}`;
      accumulate(
        buckets,
        key,
        () => ({ unit: t.unit, direction: t.direction, current: 0, previous: 0 }),
        t.current,
        t.previous,
      );
    }
    for (const b of buckets.values()) {
      if (!(b.previous > 0 && b.current > 0)) continue;
      const deltaPct = ((b.current - b.previous) / b.previous) * 100;
      if (Math.abs(deltaPct) > deviationPct) {
        result.push({
          kind: 'deviation',
          mpId: item.id,
          name: item.name,
          unit: b.unit,
          direction: b.direction,
          current: b.current,
          previous: b.previous,
          deltaPct,
        });
      }
    }
  }
  return result.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
}

/**
 * Hinweise auf ungewöhnliche Zustände unter den (gefilterten, realen) Items:
 * nie/lange nicht abgelesen (`stale`) und auffällige Abweichung ggü. der
 * Vorperiode (`deviation`). Referenzzeitpunkt ist `now`, nicht das Ende des
 * gewählten Zeitraums.
 */
export function selectInsights(
  items: DashboardMeasuringPoint[],
  opts: { now: Date; staleAfterDays?: number; deviationPct?: number },
): Insight[] {
  const staleAfterDays = opts.staleAfterDays ?? STALE_AFTER_DAYS;
  const deviationPct = opts.deviationPct ?? DEVIATION_PCT;
  return [
    ...selectStaleInsights(items, opts.now, staleAfterDays),
    ...selectDeviationInsights(items, deviationPct),
  ];
}

// --- Top-Verbraucher --------------------------------------------------------

export const TOP_LIMIT = 5;

export interface TopConsumerEntry {
  mpId: number;
  name: string;
  value: number;
  sharePct: number;
}

export interface TopConsumerGroup {
  type: MeterType;
  unit: string;
  total: number;
  entries: TopConsumerEntry[];
  others: { count: number; value: number } | null;
}

interface TopGroupAcc {
  type: MeterType;
  unit: string;
  entries: { mpId: number; name: string; value: number }[];
}

/**
 * Ranking der Messstellen mit dem höchsten Bezug je (Zählerart, Einheit) —
 * nur `direction === 'bezug'`, nur positive Werte. Gruppen mit weniger als
 * zwei Einträgen (kein „Vergleich") werden weggelassen.
 */
export function selectTopConsumers(
  items: DashboardMeasuringPoint[],
  opts: { limit: number } = { limit: TOP_LIMIT },
): TopConsumerGroup[] {
  const { limit } = opts;
  const groups = new Map<string, TopGroupAcc>();
  for (const item of items) {
    const perUnit = new Map<string, number>();
    for (const t of item.totals) {
      if (t.direction !== 'bezug') continue;
      perUnit.set(t.unit, addContribution(perUnit.get(t.unit) ?? 0, t.current));
    }
    for (const [unit, value] of perUnit) {
      if (value <= 0) continue;
      const key = `${item.type}::${unit}`;
      const acc = groups.get(key) ?? { type: item.type, unit, entries: [] };
      acc.entries.push({ mpId: item.id, name: item.name, value });
      groups.set(key, acc);
    }
  }

  const result: TopConsumerGroup[] = [];
  for (const acc of groups.values()) {
    if (acc.entries.length < 2) continue;
    const total = acc.entries.reduce((sum, e) => sum + e.value, 0);
    const sorted = [...acc.entries].sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name, 'de'),
    );
    const withShare: TopConsumerEntry[] = sorted.map((e) => ({
      ...e,
      sharePct: (e.value / total) * 100,
    }));
    const rest = withShare.slice(limit);
    const others =
      rest.length > 0
        ? { count: rest.length, value: rest.reduce((sum, e) => sum + e.value, 0) }
        : null;
    result.push({
      type: acc.type,
      unit: acc.unit,
      total,
      entries: withShare.slice(0, limit),
      others,
    });
  }

  result.sort((a, b) => {
    const typeCmp = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    return typeCmp !== 0 ? typeCmp : a.unit.localeCompare(b.unit, 'de');
  });
  return result;
}
