import { describe, expect, it } from 'vitest';

import type { DashboardTotal } from '@/lib/types';

import { dashboardItem, virtualItem } from './testFixtures';
import {
  DEVIATION_PCT,
  selectInsights,
  selectKpiTiles,
  selectTopConsumers,
  STALE_AFTER_DAYS,
  TOP_LIMIT,
} from './dashboardMetrics';

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

  it('like-for-like: eine MP ohne aktuellen Wert trägt weder current noch previous bei', () => {
    const items = [
      dashboardItem({ id: 1, totals: [total({ current: '100', previous: '100' })] }),
      dashboardItem({ id: 2, totals: [total({ current: null, previous: '50' })] }),
    ];
    const tiles = selectKpiTiles(items, []);
    expect(tiles).toHaveLength(1);
    expect(at(tiles, 0).current).toBe(100);
    expect(at(tiles, 0).previous).toBe(100);
    expect(at(tiles, 0).deltaPct).toBe(0);
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
    // vmp-Kacheln haben kein Bezug/Einspeisung-Sentiment, siehe selectKpiTiles.
    expect(t.sentiment).toBe('neutral');
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

  it('daysSince genau 45 (== STALE_AFTER_DAYS) → kein Hinweis (Grenze exklusiv)', () => {
    const boundary = dashboardItem({
      id: 1,
      last_reading_at: new Date(now.getTime() - 45 * 86_400_000).toISOString(),
    });
    const insights = selectInsights([boundary], { now });
    expect(insights.filter((i) => i.kind === 'stale')).toEqual([]);
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

  describe('Default-Konstanten', () => {
    it('STALE_AFTER_DAYS/DEVIATION_PCT sind die Default-Schwellen', () => {
      expect(STALE_AFTER_DAYS).toBe(45);
      expect(DEVIATION_PCT).toBe(30);
    });

    it('opts.staleAfterDays/opts.deviationPct verschieben die Schwellen', () => {
      const stale12 = dashboardItem({
        id: 1,
        last_reading_at: new Date(now.getTime() - 12 * 86_400_000).toISOString(),
      });
      const dev40 = dashboardItem({
        id: 2,
        last_reading_at: now.toISOString(),
        totals: [total({ current: '140', previous: '100' })], // +40 %
      });

      const withDefaults = selectInsights([stale12, dev40], { now });
      expect(withDefaults.filter((i) => i.kind === 'stale')).toHaveLength(0); // 12 Tage < Default 45
      expect(withDefaults.filter((i) => i.kind === 'deviation')).toHaveLength(1); // 40 % > Default 30

      const withCustom = selectInsights([stale12, dev40], {
        now,
        staleAfterDays: 10,
        deviationPct: 50,
      });
      expect(withCustom.filter((i) => i.kind === 'stale')).toHaveLength(1); // 12 Tage > custom 10
      expect(withCustom.filter((i) => i.kind === 'deviation')).toHaveLength(0); // 40 % < custom 50
    });
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
