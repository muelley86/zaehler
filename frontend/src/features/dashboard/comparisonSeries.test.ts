import { describe, expect, it } from 'vitest';

import type { ConsumptionPoint, MeterType } from '@/lib/types';

import { buildComparisonGroups, type ItemLike } from './comparisonSeries';

/** Minimale Messstelle — der Helper nutzt nur id/name/type/consumption. */
function item(
  id: number,
  name: string,
  type: MeterType,
  consumption: ConsumptionPoint[],
): ItemLike {
  return { id, name, type, consumption };
}

/** Ein Verbrauchspunkt (period_start = period_end, der Helper bucket't nicht selbst). */
function cp(obis: string, periodEnd: string, consumption: string, unit: string): ConsumptionPoint {
  return {
    period_start: periodEnd,
    period_end: periodEnd,
    register_id: 0,
    obis_code: obis,
    consumption,
    unit,
  };
}

/** Index-Zugriff mit Narrowing (tsconfig: noUncheckedIndexedAccess). */
function at<T>(arr: T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`kein Element an Index ${i}`);
  return v;
}

describe('buildComparisonGroups', () => {
  it('gruppiert nach (Zählerart, Einheit) und sortiert nach TYPE_ORDER', () => {
    const groups = buildComparisonGroups({
      items: [
        item(2, 'Wasser B', 'water', [cp('water', '2024-01-31', '5', 'm³')]),
        item(1, 'Strom A', 'electricity', [cp('1.8.0', '2024-01-31', '100', 'kWh')]),
      ],
    });

    expect(groups.map((g) => [g.type, g.unit])).toEqual([
      ['electricity', 'kWh'],
      ['water', 'm³'],
    ]);
  });

  it('summiert HT + NT desselben Zählers zu EINER Bezugs-Serie', () => {
    const groups = buildComparisonGroups({
      items: [
        item(1, 'Strom HT/NT', 'electricity', [
          cp('1.8.1', '2024-01-31', '60', 'kWh'),
          cp('1.8.2', '2024-01-31', '40', 'kWh'),
        ]),
      ],
    });

    expect(groups).toHaveLength(1);
    const g = at(groups, 0);
    expect(g.seriesKeys).toEqual(['mp-1::draw']);
    expect(g.labelOf['mp-1::draw']).toBe('Strom HT/NT');
    expect(g.series).toEqual([{ date: '2024-01-31', 'mp-1::draw': 100 }]);
  });

  it('bidirektional: Bezug (1.8.x) und Einspeisung (2.8.x) als getrennte Serien mit Suffix-Label', () => {
    const groups = buildComparisonGroups({
      items: [
        item(1, 'Strom', 'electricity', [
          cp('1.8.0', '2024-01-31', '100', 'kWh'),
          cp('2.8.0', '2024-01-31', '30', 'kWh'),
        ]),
      ],
    });

    expect(groups).toHaveLength(1);
    const g = at(groups, 0);
    // Sortiert nach Label: „Strom (Bezug)" < „Strom (Einspeisung)".
    expect(g.seriesKeys).toEqual(['mp-1::draw', 'mp-1::feed']);
    expect(g.labelOf['mp-1::draw']).toBe('Strom (Bezug)');
    expect(g.labelOf['mp-1::feed']).toBe('Strom (Einspeisung)');
    expect(g.series).toEqual([{ date: '2024-01-31', 'mp-1::draw': 100, 'mp-1::feed': 30 }]);
  });

  it('führt mehrere Messstellen je period_end in einer Zeile zusammen', () => {
    const groups = buildComparisonGroups({
      items: [
        item(1, 'A', 'water', [
          cp('water', '2024-01-31', '5', 'm³'),
          cp('water', '2024-02-29', '6', 'm³'),
        ]),
        item(2, 'B', 'water', [cp('water', '2024-02-29', '7', 'm³')]),
      ],
    });

    expect(groups).toHaveLength(1);
    const g = at(groups, 0);
    expect(g.seriesKeys).toEqual(['mp-1::draw', 'mp-2::draw']);
    expect(g.series).toEqual([
      { date: '2024-01-31', 'mp-1::draw': 5 },
      { date: '2024-02-29', 'mp-1::draw': 6, 'mp-2::draw': 7 },
    ]);
  });

  it('Single-Flow-Messstelle: Label ohne Suffix (nur Name)', () => {
    const groups = buildComparisonGroups({
      items: [item(7, 'Hauptzähler', 'electricity', [cp('1.8.0', '2024-01-31', '12', 'kWh')])],
    });

    expect(at(groups, 0).labelOf['mp-7::draw']).toBe('Hauptzähler');
  });

  it('leere Eingabe → keine Gruppen; Messstelle ohne Verbrauch erzeugt keine Gruppe', () => {
    expect(buildComparisonGroups({ items: [] })).toEqual([]);
    expect(buildComparisonGroups({ items: [item(1, 'A', 'water', [])] })).toEqual([]);
  });

  it('seriesKeys sind deterministisch nach Label sortiert', () => {
    const groups = buildComparisonGroups({
      items: [
        item(1, 'Zeta', 'water', [cp('water', '2024-01-31', '1', 'm³')]),
        item(2, 'Alpha', 'water', [cp('water', '2024-01-31', '2', 'm³')]),
      ],
    });

    expect(at(groups, 0).seriesKeys).toEqual(['mp-2::draw', 'mp-1::draw']); // Alpha vor Zeta
  });
});

describe('buildComparisonGroups — verrechnete Messstellen', () => {
  it('fügt eine Netto-Serie im vmp-Namensraum mit "(verrechnet)"-Label hinzu', () => {
    const groups = buildComparisonGroups({
      items: [item(3, 'Strom A', 'electricity', [cp('1.8.0', '2024-01-31', '100', 'kWh')])],
      virtualItems: [
        {
          id: 3, // gleiche ID wie die echte MP — darf nicht kollidieren
          name: 'Biogas real',
          type: 'electricity',
          consumption: [cp('virtual', '2024-01-31', '380', 'kWh')],
          totals: [],
        },
      ],
    });

    expect(groups).toHaveLength(1);
    const g = at(groups, 0);
    expect(g.seriesKeys).toContain('vmp-3');
    expect(g.seriesKeys).toContain('mp-3::draw');
    expect(g.labelOf['vmp-3']).toBe('Biogas real (verrechnet)');
    expect(at(g.series, 0)['vmp-3']).toBe(380);
    expect(at(g.series, 0)['mp-3::draw']).toBe(100);
  });

  it('behält negative Netto-Buckets bei', () => {
    const groups = buildComparisonGroups({
      items: [],
      virtualItems: [
        {
          id: 1,
          name: 'Netto',
          type: 'electricity',
          consumption: [cp('virtual', '2024-01-31', '-200', 'kWh')],
          totals: [],
        },
      ],
    });

    expect(groups).toHaveLength(1);
    expect(at(at(groups, 0).series, 0)['vmp-1']).toBe(-200);
  });

  it('ohne virtualItems unverändert (Regression)', () => {
    const groups = buildComparisonGroups({
      items: [item(1, 'Strom A', 'electricity', [cp('1.8.0', '2024-01-31', '100', 'kWh')])],
    });
    expect(at(groups, 0).seriesKeys).toEqual(['mp-1::draw']);
  });
});
