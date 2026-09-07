/**
 * Reine Selektoren für die Dashboard-Fachlogik: Filter (inkl. kaskadierender
 * Optionen und Chips), KPI-Kacheln, Hinweise (Stale/Abweichung) und
 * Top-Verbraucher. Frei von React — isoliert unit-testbar; die Hooks/Views
 * bauen später nur noch auf diesen Exporten auf.
 *
 * Zahlen kommen als Decimal-Strings vom Backend; `Number(...)` liefert bei
 * `null`/ungültigen Werten `NaN` — solche Beiträge zählen nirgends mit.
 */

import type { DropdownOption } from '@/components/ui';
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

// --- Filter -----------------------------------------------------------------

export interface DashboardFilters {
  mainLocation: Set<number | null>;
  owner: Set<number | null>;
  location: Set<number | null>;
  type: Set<MeterType>;
  measuringPoint: Set<number | null>;
  virtual: Set<number | null>;
}

export function emptyFilters(): DashboardFilters {
  return {
    mainLocation: new Set(),
    owner: new Set(),
    location: new Set(),
    type: new Set(),
    measuringPoint: new Set(),
    virtual: new Set(),
  };
}

/** Die vier kategorialen Basis-Filter (Hauptstandort/Eigentümer/Standort/Typ). */
export function matchesBaseFilters(item: DashboardMeasuringPoint, f: DashboardFilters): boolean {
  if (f.mainLocation.size > 0 && !f.mainLocation.has(item.main_location_id)) return false;
  if (f.owner.size > 0 && !f.owner.has(item.current_owner_id)) return false;
  if (f.location.size > 0 && !f.location.has(item.location_id)) return false;
  if (f.type.size > 0 && !f.type.has(item.type)) return false;
  return true;
}

/**
 * Messstellen- und vmp-Filter bilden EINE gemeinsame Auswahl: sobald in
 * mindestens einem der beiden etwas gewählt ist, erscheinen nur noch explizit
 * gewählte Einträge — echte und verrechnete blenden sich also gegenseitig aus.
 */
export function isMpSelectionActive(f: DashboardFilters): boolean {
  return f.measuringPoint.size > 0 || f.virtual.size > 0;
}

export function selectFilteredItems(
  items: DashboardMeasuringPoint[],
  f: DashboardFilters,
): DashboardMeasuringPoint[] {
  const selectionActive = isMpSelectionActive(f);
  return items.filter(
    (item) => matchesBaseFilters(item, f) && (!selectionActive || f.measuringPoint.has(item.id)),
  );
}

/**
 * Verrechnete Messstellen: respektieren den Zählerart-Filter und die
 * gemeinsame Messstellen-/vmp-Auswahl. Die übrigen kategorialen Filter
 * (Standort/Eigentümer) greifen nicht — virtuelle Messstellen haben diese
 * Attribute nicht.
 */
export function selectFilteredVirtual(
  virtualItems: DashboardVirtualMeasuringPoint[],
  f: DashboardFilters,
): DashboardVirtualMeasuringPoint[] {
  const selectionActive = isMpSelectionActive(f);
  return virtualItems.filter(
    (v) => (f.type.size === 0 || f.type.has(v.type)) && (!selectionActive || f.virtual.has(v.id)),
  );
}

export function countActiveFilters(f: DashboardFilters): number {
  return (
    f.mainLocation.size +
    f.owner.size +
    f.location.size +
    f.type.size +
    f.measuringPoint.size +
    f.virtual.size
  );
}

export interface FilterOptions {
  mainLocations: DropdownOption<number | null>[];
  owners: DropdownOption<number | null>[];
  locations: DropdownOption<number | null>[];
  types: DropdownOption<MeterType>[];
  measuringPoints: DropdownOption<number | null>[];
  virtual: DropdownOption<number | null>[];
}

/** Distinkte (id, name)-Paare aus den Items plus eine „ohne …"-Option (value null) am Ende. */
function collectIdOptions(
  items: DashboardMeasuringPoint[],
  idOf: (item: DashboardMeasuringPoint) => number | null,
  nameOf: (item: DashboardMeasuringPoint) => string | null,
  noneLabel: string,
): DropdownOption<number | null>[] {
  const map = new Map<number, string>();
  for (const item of items) {
    const id = idOf(item);
    if (id !== null && !map.has(id)) map.set(id, nameOf(item) ?? `#${id}`);
  }
  const options: DropdownOption<number | null>[] = Array.from(map.entries()).map(([id, name]) => ({
    value: id,
    label: name,
  }));
  options.push({ value: null, label: noneLabel });
  return options;
}

/**
 * Optionen für alle sechs Filter-Dropdowns. `measuringPoints` kaskadiert über
 * `matchesBaseFilters` — nur Messstellen, die zu den vier Basis-Filtern
 * passen, stehen zur Wahl. `virtual` bleibt unfiltriert (Auswahl-Liste
 * zeigt immer alle verrechneten Messstellen).
 */
export function buildFilterOptions(
  items: DashboardMeasuringPoint[],
  virtualItems: DashboardVirtualMeasuringPoint[],
  f: DashboardFilters,
): FilterOptions {
  return {
    mainLocations: collectIdOptions(
      items,
      (i) => i.main_location_id,
      (i) => i.main_location_name,
      'ohne Hauptstandort',
    ),
    owners: collectIdOptions(
      items,
      (i) => i.current_owner_id,
      (i) => i.current_owner_name,
      'ohne Eigentümer',
    ),
    locations: collectIdOptions(
      items,
      (i) => i.location_id,
      (i) => i.location_name,
      'ohne Zählerstandort',
    ),
    types: TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
    measuringPoints: items
      .filter((item) => matchesBaseFilters(item, f))
      .map((item) => ({ value: item.id, label: item.name })),
    virtual: virtualItems.map((v) => ({ value: v.id, label: v.name })),
  };
}

export interface FilterChip {
  key: string;
  label: string;
  filter: keyof DashboardFilters;
  value: number | null | MeterType;
}

const FILTER_CHIP_PREFIX: Record<keyof DashboardFilters, string> = {
  mainLocation: 'Hauptstandort',
  owner: 'Eigentümer',
  location: 'Zählerstandort',
  type: 'Zählerart',
  measuringPoint: 'Messstelle',
  virtual: 'Verrechnete Messstelle',
};

function chipsFor<T extends number | null | MeterType>(
  filterKey: keyof DashboardFilters,
  selected: Set<T>,
  options: DropdownOption<T>[],
): FilterChip[] {
  const prefix = FILTER_CHIP_PREFIX[filterKey];
  const chips: FilterChip[] = [];
  for (const value of selected) {
    const label = options.find((o) => o.value === value)?.label ?? String(value);
    chips.push({
      key: `${filterKey}::${String(value)}`,
      label: `${prefix}: ${label}`,
      filter: filterKey,
      value,
    });
  }
  return chips;
}

/** Ein Chip je aktivem Filter-Wert, mit sprechendem Label aus den Options-Listen. */
export function activeFilterChips(f: DashboardFilters, options: FilterOptions): FilterChip[] {
  return [
    ...chipsFor('mainLocation', f.mainLocation, options.mainLocations),
    ...chipsFor('owner', f.owner, options.owners),
    ...chipsFor('location', f.location, options.locations),
    ...chipsFor('type', f.type, options.types),
    ...chipsFor('measuringPoint', f.measuringPoint, options.measuringPoints),
    ...chipsFor('virtual', f.virtual, options.virtual),
  ];
}

/** Entfernt einen Chip-Wert aus dem passenden Filter — liefert neue Sets, mutiert `f` nicht. */
export function removeChip(f: DashboardFilters, chip: FilterChip): DashboardFilters {
  // `chip.value` gehört laut Konstruktion (`chipsFor`) immer zum Set von `chip.filter` —
  // der doppelte Cast über `unknown` überbrückt die dafür zu grobe Vereinigungs-Typisierung.
  const set = f[chip.filter] as unknown as Set<FilterChip['value']>;
  const next = new Set(set);
  next.delete(chip.value);
  return { ...f, [chip.filter]: next };
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

export interface KpiOptions {
  flatPct: number;
}

const DEFAULT_KPI_OPTIONS: KpiOptions = { flatPct: 1 };

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

interface RealBucket {
  type: MeterType;
  unit: string;
  direction: FlowDirection;
  current: number;
  previous: number;
}

interface VmpBucket {
  vmpId: number;
  name: string;
  type: MeterType;
  unit: string;
  direction: FlowDirection;
  current: number;
  previous: number;
}

/**
 * Eine Kachel je (Zählerart, Einheit, Richtung) über alle Items summiert
 * (HT+NT landen so zusammen; `2.8.x` bleibt als Einspeisung getrennt), plus
 * eine Kachel je (vmp, Einheit) für verrechnete Messstellen. Nur Buckets, für
 * die mindestens ein `total`-Eintrag existiert, werden erzeugt.
 */
export function selectKpiTiles(
  items: DashboardMeasuringPoint[],
  virtualItems: DashboardVirtualMeasuringPoint[],
  opts: KpiOptions = DEFAULT_KPI_OPTIONS,
): KpiTile[] {
  const { flatPct } = opts;

  const buckets = new Map<string, RealBucket>();
  for (const item of items) {
    for (const t of item.totals) {
      const key = `${item.type}::${t.unit}::${t.direction}`;
      const bucket = buckets.get(key) ?? {
        type: item.type,
        unit: t.unit,
        direction: t.direction,
        current: 0,
        previous: 0,
      };
      bucket.current = addContribution(bucket.current, t.current);
      bucket.previous = addContribution(bucket.previous, t.previous);
      buckets.set(key, bucket);
    }
  }

  const vmpBuckets = new Map<string, VmpBucket>();
  for (const v of virtualItems) {
    for (const t of v.totals) {
      const key = `vmp::${v.id}::${t.unit}`;
      const bucket = vmpBuckets.get(key) ?? {
        vmpId: v.id,
        name: v.name,
        type: v.type,
        unit: t.unit,
        direction: t.direction,
        current: 0,
        previous: 0,
      };
      bucket.current = addContribution(bucket.current, t.current);
      bucket.previous = addContribution(bucket.previous, t.previous);
      vmpBuckets.set(key, bucket);
    }
  }

  const tiles: KpiTile[] = [];
  for (const [key, b] of buckets) {
    const { previous, deltaPct, trend } = computeDelta(
      b.current,
      b.previous,
      b.previous > 0,
      flatPct,
    );
    tiles.push({
      key,
      type: b.type,
      unit: b.unit,
      direction: b.direction,
      label: TYPE_LABELS[b.type] + (b.direction === 'einspeisung' ? ' · Einspeisung' : ''),
      current: b.current,
      previous,
      deltaPct,
      trend,
      sentiment: classifySentiment(b.direction, trend),
    });
  }
  for (const [key, b] of vmpBuckets) {
    const eligible = b.previous > 0 && b.current >= 0;
    const { previous, deltaPct, trend } = computeDelta(b.current, b.previous, eligible, flatPct);
    tiles.push({
      key,
      type: b.type,
      unit: b.unit,
      direction: b.direction,
      label: `${b.name} (verrechnet)`,
      current: b.current,
      previous,
      deltaPct,
      trend,
      sentiment: 'neutral',
      vmpId: b.vmpId,
    });
  }

  tiles.sort(compareKpiTiles);
  return tiles;
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

export type Insight =
  | {
      kind: 'stale';
      mpId: number;
      name: string;
      lastReadingAt: string | null;
      daysSince: number | null;
    }
  | {
      kind: 'deviation';
      mpId: number;
      name: string;
      unit: string;
      direction: FlowDirection;
      current: number;
      previous: number;
      deltaPct: number;
    };

type StaleInsight = Extract<Insight, { kind: 'stale' }>;
type DeviationInsight = Extract<Insight, { kind: 'deviation' }>;

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

function selectDeviationInsights(
  items: DashboardMeasuringPoint[],
  deviationPct: number,
): DeviationInsight[] {
  const result: DeviationInsight[] = [];
  for (const item of items) {
    const buckets = new Map<
      string,
      { unit: string; direction: FlowDirection; current: number; previous: number }
    >();
    for (const t of item.totals) {
      const key = `${t.unit}::${t.direction}`;
      const bucket = buckets.get(key) ?? {
        unit: t.unit,
        direction: t.direction,
        current: 0,
        previous: 0,
      };
      bucket.current = addContribution(bucket.current, t.current);
      bucket.previous = addContribution(bucket.previous, t.previous);
      buckets.set(key, bucket);
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
 * Hinweise auf ungewöhnliche Zustände unter den (bereits gefilterten,
 * realen) Items: nie/lange nicht abgelesen (`stale`) und auffällige
 * Verbrauchs-Abweichung ggü. der Vorperiode (`deviation`). Referenzzeitpunkt
 * ist `now` (vom Aufrufer übergeben, z. B. „heute"), nicht das Ende des
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
 * nur reale Items, nur `direction === 'bezug'`, nur positive Werte. Gruppen
 * mit weniger als zwei Einträgen sind uninteressant (kein „Vergleich") und
 * werden weggelassen.
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
