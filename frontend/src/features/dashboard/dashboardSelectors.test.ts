import { describe, expect, it } from 'vitest';

import type { DashboardTotal, MeterType } from '@/lib/types';

import { dashboardItem, virtualItem } from './testFixtures';
import {
  activeFilterChips,
  buildFilterOptions,
  countActiveFilters,
  DEVIATION_PCT,
  emptyFilters,
  isMpSelectionActive,
  matchesBaseFilters,
  removeChip,
  selectFilteredItems,
  selectFilteredVirtual,
  selectInsights,
  selectKpiTiles,
  selectTopConsumers,
  STALE_AFTER_DAYS,
  TOP_LIMIT,
  type DashboardFilters,
} from './dashboardSelectors';

/** Index-Zugriff mit Narrowing (tsconfig: noUncheckedIndexedAccess). */
function at<T>(arr: T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`kein Element an Index ${i}`);
  return v;
}

function total(overrides: Partial<DashboardTotal> = {}): DashboardTotal {
  return {
    obis_code: 'r',
    unit: 'kWh',
    direction: 'bezug',
    current: null,
    previous: null,
    ...overrides,
  };
}

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
    const chips = activeFilterChips(f, options);
    const labels = chips.map((c) => c.label);
    expect(labels).toContain('Zählerart: Wasser');
    expect(labels).toContain('Messstelle: Wasser Garten');
    expect(labels).toContain('Hauptstandort: ohne Hauptstandort');
    expect(labels).toContain('Verrechnete Messstelle: Netto Biogas');
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

describe('selectKpiTiles', () => {
  it('summiert HT + NT in einen Bezugs-Bucket', () => {
    const items = [
      dashboardItem({
        type: 'electricity',
        totals: [
          total({
            obis_code: '1.8.1',
            unit: 'kWh',
            direction: 'bezug',
            current: '60',
            previous: '50',
          }),
          total({
            obis_code: '1.8.2',
            unit: 'kWh',
            direction: 'bezug',
            current: '40',
            previous: '30',
          }),
        ],
      }),
    ];
    const tiles = selectKpiTiles(items, []);
    expect(tiles).toHaveLength(1);
    expect(at(tiles, 0).current).toBe(100);
    expect(at(tiles, 0).previous).toBe(80);
  });

  it('Bezug und Einspeisung landen in getrennten Kacheln', () => {
    const items = [
      dashboardItem({
        type: 'electricity',
        totals: [
          total({ direction: 'bezug', unit: 'kWh', current: '100', previous: '80' }),
          total({ direction: 'einspeisung', unit: 'kWh', current: '30', previous: '20' }),
        ],
      }),
    ];
    const tiles = selectKpiTiles(items, []);
    expect(tiles).toHaveLength(2);
    expect(tiles.map((t) => t.direction).sort()).toEqual(['bezug', 'einspeisung']);
    const feed = tiles.find((t) => t.direction === 'einspeisung');
    expect(feed?.label).toBe('Strom · Einspeisung');
  });

  it('kWh und m³ (Heizung) landen in getrennten Kacheln', () => {
    const items = [
      dashboardItem({
        type: 'heating',
        totals: [
          total({ direction: 'bezug', unit: 'kWh', current: '10', previous: '10' }),
          total({ direction: 'bezug', unit: 'm³', current: '5', previous: '5' }),
        ],
      }),
    ];
    const tiles = selectKpiTiles(items, []);
    expect(tiles.map((t) => t.unit).sort()).toEqual(['kWh', 'm³']);
  });

  it('previous 0 oder null → deltaPct null, previous null', () => {
    const zero = selectKpiTiles(
      [dashboardItem({ totals: [total({ current: '10', previous: '0' })] })],
      [],
    );
    expect(at(zero, 0).previous).toBeNull();
    expect(at(zero, 0).deltaPct).toBeNull();
    expect(at(zero, 0).trend).toBe('none');

    const nullPrev = selectKpiTiles(
      [dashboardItem({ totals: [total({ current: '10', previous: null })] })],
      [],
    );
    expect(at(nullPrev, 0).previous).toBeNull();
    expect(at(nullPrev, 0).deltaPct).toBeNull();
  });

  it('+25 % → up/bad (Bezug), -25 % → down/good (Bezug)', () => {
    const up = selectKpiTiles(
      [dashboardItem({ totals: [total({ direction: 'bezug', current: '125', previous: '100' })] })],
      [],
    );
    expect(at(up, 0).deltaPct).toBeCloseTo(25);
    expect(at(up, 0).trend).toBe('up');
    expect(at(up, 0).sentiment).toBe('bad');

    const down = selectKpiTiles(
      [dashboardItem({ totals: [total({ direction: 'bezug', current: '75', previous: '100' })] })],
      [],
    );
    expect(at(down, 0).deltaPct).toBeCloseTo(-25);
    expect(at(down, 0).trend).toBe('down');
    expect(at(down, 0).sentiment).toBe('good');
  });

  it('Einspeisung invertiert das Sentiment', () => {
    const up = selectKpiTiles(
      [
        dashboardItem({
          totals: [total({ direction: 'einspeisung', current: '125', previous: '100' })],
        }),
      ],
      [],
    );
    expect(at(up, 0).sentiment).toBe('good');

    const down = selectKpiTiles(
      [
        dashboardItem({
          totals: [total({ direction: 'einspeisung', current: '75', previous: '100' })],
        }),
      ],
      [],
    );
    expect(at(down, 0).sentiment).toBe('bad');
  });

  it('Änderung < flatPct → flat/neutral', () => {
    const tiles = selectKpiTiles(
      [dashboardItem({ totals: [total({ current: '100.5', previous: '100' })] })],
      [],
      { flatPct: 1 },
    );
    expect(at(tiles, 0).trend).toBe('flat');
    expect(at(tiles, 0).sentiment).toBe('neutral');
  });

  it('vmp mit negativem current: deltaPct null, vmpId gesetzt', () => {
    const tiles = selectKpiTiles(
      [],
      [
        virtualItem({
          id: 42,
          name: 'Netto',
          totals: [total({ current: '-50', previous: '100' })],
        }),
      ],
    );
    expect(tiles).toHaveLength(1);
    const t = at(tiles, 0);
    expect(t.current).toBe(-50);
    expect(t.deltaPct).toBeNull();
    expect(t.previous).toBeNull();
    expect(t.vmpId).toBe(42);
    expect(t.label).toBe('Netto (verrechnet)');
  });

  it('vmp mit positivem current und previous > 0 bekommt deltaPct', () => {
    const tiles = selectKpiTiles(
      [],
      [virtualItem({ id: 5, totals: [total({ current: '150', previous: '100' })] })],
    );
    expect(at(tiles, 0).deltaPct).toBeCloseTo(50);
  });

  it('Sortierung: TYPE_ORDER, Bezug vor Einspeisung, Einheit, vmp zuletzt (Name)', () => {
    const items = [
      dashboardItem({
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '1', previous: '1' })],
      }),
      dashboardItem({
        type: 'electricity',
        totals: [
          total({ direction: 'einspeisung', unit: 'kWh', current: '1', previous: '1' }),
          total({ direction: 'bezug', unit: 'kWh', current: '1', previous: '1' }),
        ],
      }),
    ];
    const virtuals = [
      virtualItem({ id: 1, name: 'Zeta', totals: [total({ current: '1', previous: '1' })] }),
      virtualItem({ id: 2, name: 'Alpha', totals: [total({ current: '1', previous: '1' })] }),
    ];
    const tiles = selectKpiTiles(items, virtuals);
    expect(tiles.map((t) => t.label)).toEqual([
      'Strom',
      'Strom · Einspeisung',
      'Wasser',
      'Alpha (verrechnet)',
      'Zeta (verrechnet)',
    ]);
  });
});

describe('selectInsights', () => {
  const now = new Date('2026-09-07T12:00:00Z');

  it('46 Tage seit letzter Ablesung → stale; 44 Tage → kein Hinweis', () => {
    const stale = dashboardItem({
      id: 1,
      last_reading_at: new Date(now.getTime() - 46 * 86_400_000).toISOString(),
    });
    const fresh = dashboardItem({
      id: 2,
      last_reading_at: new Date(now.getTime() - 44 * 86_400_000).toISOString(),
    });
    const insights = selectInsights([stale, fresh], { now });
    expect(insights.filter((i) => i.kind === 'stale').map((i) => i.mpId)).toEqual([1]);
  });

  it('last_reading_at null → nie abgelesen, sortiert zuerst', () => {
    const never = dashboardItem({ id: 1, name: 'Nie', last_reading_at: null });
    const stale = dashboardItem({
      id: 2,
      name: 'Alt',
      last_reading_at: new Date(now.getTime() - 100 * 86_400_000).toISOString(),
    });
    const insights = selectInsights([stale, never], { now });
    const staleInsights = insights.filter((i) => i.kind === 'stale');
    expect(staleInsights.map((i) => i.mpId)).toEqual([1, 2]);
    expect(staleInsights[0]).toMatchObject({ daysSince: null });
  });

  it('Abweichungs-Grenze exakt 30 % → kein Hinweis; > 30 % → Hinweis', () => {
    const exact = dashboardItem({
      id: 1,
      totals: [total({ current: '130', previous: '100' })],
    });
    const over = dashboardItem({
      id: 2,
      totals: [total({ current: '131', previous: '100' })],
    });
    const insights = selectInsights([exact, over], { now });
    const deviations = insights.filter((i) => i.kind === 'deviation');
    expect(deviations.map((i) => i.mpId)).toEqual([2]);
  });

  it('previous=0 oder current=0 → kein Abweichungs-Hinweis', () => {
    const zeroPrev = dashboardItem({ id: 1, totals: [total({ current: '100', previous: '0' })] });
    const zeroCurrent = dashboardItem({
      id: 2,
      totals: [total({ current: '0', previous: '100' })],
    });
    const insights = selectInsights([zeroPrev, zeroCurrent], { now });
    expect(insights.filter((i) => i.kind === 'deviation')).toEqual([]);
  });

  it('HT + NT werden vor dem Vergleich summiert', () => {
    const item = dashboardItem({
      id: 1,
      totals: [
        total({ obis_code: '1.8.1', current: '80', previous: '50' }),
        total({ obis_code: '1.8.2', current: '80', previous: '50' }),
      ],
    });
    // Summe: current 160 vs previous 100 → +60 % Abweichung.
    const insights = selectInsights([item], { now });
    const deviations = insights.filter((i) => i.kind === 'deviation');
    expect(deviations).toHaveLength(1);
  });

  it('respektiert übergebene staleAfterDays/deviationPct-Defaults', () => {
    expect(STALE_AFTER_DAYS).toBe(45);
    expect(DEVIATION_PCT).toBe(30);
  });

  it('gibt stale-Hinweise vor deviation-Hinweisen zurück', () => {
    const staleItem = dashboardItem({
      id: 1,
      last_reading_at: new Date(now.getTime() - 100 * 86_400_000).toISOString(),
    });
    const deviatingItem = dashboardItem({
      id: 2,
      last_reading_at: now.toISOString(),
      totals: [total({ current: '200', previous: '100' })],
    });
    const insights = selectInsights([staleItem, deviatingItem], { now });
    expect(insights.map((i) => i.kind)).toEqual(['stale', 'deviation']);
  });
});

describe('selectTopConsumers', () => {
  it('rankt absteigend und Anteile summieren zu 100', () => {
    const items = [
      dashboardItem({
        id: 1,
        name: 'A',
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '10' })],
      }),
      dashboardItem({
        id: 2,
        name: 'B',
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '30' })],
      }),
      dashboardItem({
        id: 3,
        name: 'C',
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '60' })],
      }),
    ];
    const groups = selectTopConsumers(items);
    expect(groups).toHaveLength(1);
    const g = at(groups, 0);
    expect(g.entries.map((e) => e.name)).toEqual(['C', 'B', 'A']);
    const totalShare = g.entries.reduce((sum, e) => sum + e.sharePct, 0);
    expect(totalShare).toBeCloseTo(100);
  });

  it('begrenzt auf `limit` und aggregiert den Rest in `others`', () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      dashboardItem({
        id: i + 1,
        name: `MP${i + 1}`,
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: String(i + 1) })],
      }),
    );
    const groups = selectTopConsumers(items, { limit: 3 });
    const g = at(groups, 0);
    expect(g.entries).toHaveLength(3);
    expect(g.others).toEqual({ count: 4, value: 1 + 2 + 3 + 4 });
  });

  it('schließt Einspeisung, vmp und 0-Werte aus', () => {
    const items = [
      dashboardItem({
        id: 1,
        name: 'A',
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '10' })],
      }),
      dashboardItem({
        id: 2,
        name: 'B',
        type: 'water',
        totals: [total({ direction: 'einspeisung', unit: 'm³', current: '99' })],
      }),
      dashboardItem({
        id: 3,
        name: 'C',
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '0' })],
      }),
      dashboardItem({
        id: 4,
        name: 'D',
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '20' })],
      }),
    ];
    const groups = selectTopConsumers(items);
    const g = at(groups, 0);
    expect(g.entries.map((e) => e.name)).toEqual(['D', 'A']);
  });

  it('blendet Gruppen mit nur einem Eintrag aus', () => {
    const items = [
      dashboardItem({
        id: 1,
        name: 'A',
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '10' })],
      }),
    ];
    expect(selectTopConsumers(items)).toEqual([]);
  });

  it('Tiebreak bei gleichem Wert nach Name', () => {
    const items = [
      dashboardItem({
        id: 1,
        name: 'Zeta',
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '10' })],
      }),
      dashboardItem({
        id: 2,
        name: 'Alpha',
        type: 'water',
        totals: [total({ direction: 'bezug', unit: 'm³', current: '10' })],
      }),
    ];
    const g = at(selectTopConsumers(items), 0);
    expect(g.entries.map((e) => e.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('TOP_LIMIT ist der Default-Limit', () => {
    expect(TOP_LIMIT).toBe(5);
  });
});
