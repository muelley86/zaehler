/**
 * Reine Filter-Selektoren für die Dashboard-Fachlogik: Basis-Filter,
 * kaskadierende Options-Listen für die Filter-Dropdowns und Chips für die
 * aktive Auswahl. Frei von React — isoliert unit-testbar; die Hooks/Views
 * bauen später nur noch auf diesen Exporten auf.
 *
 * KPI-Kacheln, Hinweise und Top-Verbraucher stehen in `dashboardMetrics.ts`.
 */

import type { DropdownOption } from '@/components/ui';
import type {
  DashboardMeasuringPoint,
  DashboardVirtualMeasuringPoint,
  MeterType,
} from '@/lib/types';
import { TYPE_LABELS, TYPE_ORDER } from '@/lib/meterLabels';

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

/**
 * Chips für den Messstellen-Filter aus einer unkaskadierten Namensquelle
 * (alle Items) statt aus `options.measuringPoints`: Letztere kaskadiert über
 * die Basis-Filter — eine bereits gewählte Messstelle kann durch einen später
 * gesetzten Basis-Filter aus der Options-Liste fallen, obwohl sie weiterhin
 * ausgewählt ist. Ohne diese Sonderbehandlung würde der Chip nur noch die
 * rohe ID zeigen.
 */
function chipsForMeasuringPoint(
  selected: Set<number | null>,
  nameById: Map<number, string>,
): FilterChip[] {
  const prefix = FILTER_CHIP_PREFIX.measuringPoint;
  const chips: FilterChip[] = [];
  for (const value of selected) {
    const label = (value !== null ? nameById.get(value) : undefined) ?? String(value);
    chips.push({
      key: `measuringPoint::${String(value)}`,
      label: `${prefix}: ${label}`,
      filter: 'measuringPoint',
      value,
    });
  }
  return chips;
}

/**
 * Ein Chip je aktivem Filter-Wert. `items` liefert eine unkaskadierte
 * Namensquelle für den Messstellen-Filter (siehe `chipsForMeasuringPoint`);
 * die übrigen Options-Listen sind (im Gegensatz zu `options.measuringPoints`)
 * bereits unkaskadiert und können direkt verwendet werden.
 */
export function activeFilterChips(
  f: DashboardFilters,
  options: FilterOptions,
  items: DashboardMeasuringPoint[],
): FilterChip[] {
  const mpNameById = new Map(items.map((item) => [item.id, item.name]));
  return [
    ...chipsFor('mainLocation', f.mainLocation, options.mainLocations),
    ...chipsFor('owner', f.owner, options.owners),
    ...chipsFor('location', f.location, options.locations),
    ...chipsFor('type', f.type, options.types),
    ...chipsForMeasuringPoint(f.measuringPoint, mpNameById),
    ...chipsFor('virtual', f.virtual, options.virtual),
  ];
}

/** Entfernt einen Chip-Wert aus dem passenden Filter — liefert neue Sets, mutiert `f` nicht. */
export function removeChip(f: DashboardFilters, chip: FilterChip): DashboardFilters {
  // `chip.value` gehört laut Konstruktion (`chipsFor`/`chipsForMeasuringPoint`) immer zum
  // Set von `chip.filter` — der doppelte Cast über `unknown` überbrückt die dafür zu grobe
  // Vereinigungs-Typisierung.
  const set = f[chip.filter] as unknown as Set<FilterChip['value']>;
  const next = new Set(set);
  next.delete(chip.value);
  return { ...f, [chip.filter]: next };
}
