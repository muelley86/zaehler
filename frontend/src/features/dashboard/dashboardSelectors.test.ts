import { describe, expect, it } from 'vitest';

import type { MeterType } from '@/lib/types';

import { dashboardItem, virtualItem } from './testFixtures';
import {
  activeFilterChips,
  buildFilterOptions,
  countActiveFilters,
  emptyFilters,
  isMpSelectionActive,
  matchesBaseFilters,
  removeChip,
  selectFilteredItems,
  selectFilteredVirtual,
  type DashboardFilters,
} from './dashboardSelectors';

describe('emptyFilters', () => {
  it('liefert leere Sets für alle Filter', () => {
    const f = emptyFilters();
    expect(countActiveFilters(f)).toBe(0);
    expect(isMpSelectionActive(f)).toBe(false);
  });
});

describe('matchesBaseFilters', () => {
  it('greift auf Hauptstandort/Eigentümer/Zählerstandort/Typ', () => {
    const item = dashboardItem({
      main_location_id: 1,
      current_owner_id: 2,
      location_id: 3,
      type: 'water',
    });
    const f = emptyFilters();
    expect(matchesBaseFilters(item, f)).toBe(true);
    expect(matchesBaseFilters(item, { ...f, mainLocation: new Set([1]) })).toBe(true);
    expect(matchesBaseFilters(item, { ...f, mainLocation: new Set([99]) })).toBe(false);
    expect(matchesBaseFilters(item, { ...f, owner: new Set([2]) })).toBe(true);
    expect(matchesBaseFilters(item, { ...f, owner: new Set([99]) })).toBe(false);
    expect(matchesBaseFilters(item, { ...f, location: new Set([3]) })).toBe(true);
    expect(matchesBaseFilters(item, { ...f, location: new Set([99]) })).toBe(false);
    expect(matchesBaseFilters(item, { ...f, type: new Set(['water']) })).toBe(true);
    expect(matchesBaseFilters(item, { ...f, type: new Set(['electricity']) })).toBe(false);
  });

  it('null-Werte (ohne …) matchen explizit gesetzten null-Filter', () => {
    const item = dashboardItem({ main_location_id: null });
    const f = { ...emptyFilters(), mainLocation: new Set<number | null>([null]) };
    expect(matchesBaseFilters(item, f)).toBe(true);
  });
});

describe('selectFilteredItems / selectFilteredVirtual — gemeinsame MP-/vmp-Auswahl', () => {
  it('ohne Auswahl: alle Items, die die Basis-Filter erfüllen', () => {
    const items = [
      dashboardItem({ id: 1, type: 'water' }),
      dashboardItem({ id: 2, type: 'electricity' }),
    ];
    const f = { ...emptyFilters(), type: new Set<MeterType>(['water']) };
    expect(selectFilteredItems(items, f).map((i) => i.id)).toEqual([1]);
  });

  it('measuringPoint-Auswahl blendet nicht gewählte reale UND alle virtuellen Items aus', () => {
    const items = [dashboardItem({ id: 1 }), dashboardItem({ id: 2 })];
    const virtuals = [virtualItem({ id: 10 })];
    const f = { ...emptyFilters(), measuringPoint: new Set<number | null>([1]) };
    expect(selectFilteredItems(items, f).map((i) => i.id)).toEqual([1]);
    expect(selectFilteredVirtual(virtuals, f)).toEqual([]);
  });

  it('virtual-Auswahl blendet alle realen Items aus, lässt nur gewählte vmp durch', () => {
    const items = [dashboardItem({ id: 1 })];
    const virtuals = [virtualItem({ id: 10 }), virtualItem({ id: 11 })];
    const f = { ...emptyFilters(), virtual: new Set<number | null>([10]) };
    expect(selectFilteredItems(items, f)).toEqual([]);
    expect(selectFilteredVirtual(virtuals, f).map((v) => v.id)).toEqual([10]);
  });

  it('selectFilteredVirtual respektiert den Typ-Filter unabhängig von der MP-Auswahl', () => {
    const virtuals = [
      virtualItem({ id: 10, type: 'water' }),
      virtualItem({ id: 11, type: 'electricity' }),
    ];
    const f = { ...emptyFilters(), type: new Set<MeterType>(['water']) };
    expect(selectFilteredVirtual(virtuals, f).map((v) => v.id)).toEqual([10]);
  });
});

describe('countActiveFilters / activeFilterChips / removeChip', () => {
  it('zählt über alle sechs Filter', () => {
    const f: DashboardFilters = {
      ...emptyFilters(),
      mainLocation: new Set([1]),
      owner: new Set([2, 3]),
    };
    expect(countActiveFilters(f)).toBe(3);
  });

  it('erzeugt lesbare Chip-Labels inkl. „ohne …"', () => {
    const items = [
      dashboardItem({ id: 1, name: 'Wasser Garten', type: 'water', main_location_id: null }),
    ];
    const virtuals = [virtualItem({ id: 10, name: 'Netto Biogas' })];
    const f: DashboardFilters = {
      ...emptyFilters(),
      type: new Set(['water']),
      measuringPoint: new Set([1]),
      mainLocation: new Set([null]),
      virtual: new Set([10]),
    };
    const options = buildFilterOptions(items, virtuals, f);
    const chips = activeFilterChips(f, options, items);
    const labels = chips.map((c) => c.label);
    expect(labels).toContain('Zählerart: Wasser');
    expect(labels).toContain('Messstelle: Wasser Garten');
    expect(labels).toContain('Hauptstandort: ohne Hauptstandort');
    expect(labels).toContain('Verrechnete Messstelle: Netto Biogas');
  });

  it('MP-Chip-Label bleibt lesbar, wenn die MP durch einen später gesetzten Basis-Filter aus der Kaskade fällt', () => {
    // Erst MP 1 (Wasser) auswählen, dann den Typ-Filter auf „Strom" setzen —
    // options.measuringPoints kaskadiert weg, der Chip muss trotzdem den
    // Namen zeigen (nicht die rohe ID).
    const items = [dashboardItem({ id: 1, name: 'Wasser Garten', type: 'water' })];
    const f: DashboardFilters = {
      ...emptyFilters(),
      measuringPoint: new Set([1]),
      type: new Set<MeterType>(['electricity']),
    };
    const options = buildFilterOptions(items, [], f);
    expect(options.measuringPoints).toEqual([]); // kaskadiert weg

    const chips = activeFilterChips(f, options, items);
    const mpChip = chips.find((c) => c.filter === 'measuringPoint');
    expect(mpChip?.label).toBe('Messstelle: Wasser Garten');
  });

  it('removeChip liefert ein neues Filter-Objekt mit neuen Sets (keine Mutation)', () => {
    const f: DashboardFilters = { ...emptyFilters(), type: new Set(['water', 'electricity']) };
    const chip = {
      key: 'type::water',
      label: 'x',
      filter: 'type' as const,
      value: 'water' as const,
    };
    const next = removeChip(f, chip);
    expect(next).not.toBe(f);
    expect(next.type).not.toBe(f.type);
    expect([...next.type]).toEqual(['electricity']);
    expect([...f.type]).toEqual(['water', 'electricity']); // Original unverändert
  });
});

describe('buildFilterOptions — Kaskade der Messstellen-Optionen', () => {
  it('measuringPoints respektiert die Basis-Filter (Kaskade)', () => {
    const items = [
      dashboardItem({ id: 1, name: 'A', type: 'water' }),
      dashboardItem({ id: 2, name: 'B', type: 'electricity' }),
    ];
    const f = { ...emptyFilters(), type: new Set<MeterType>(['water']) };
    const options = buildFilterOptions(items, [], f);
    expect(options.measuringPoints.map((o) => o.value)).toEqual([1]);
  });

  it('mainLocations/owners/locations enthalten eine „ohne …"-Option', () => {
    const items = [dashboardItem({ id: 1, main_location_id: 5, main_location_name: 'Hof' })];
    const options = buildFilterOptions(items, [], emptyFilters());
    expect(options.mainLocations).toEqual([
      { value: 5, label: 'Hof' },
      { value: null, label: 'ohne Hauptstandort' },
    ]);
  });
});
