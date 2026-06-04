import { describe, expect, it } from 'vitest';

import type { ConsumptionPoint, MeasuringPointRead, MeterType } from '@/lib/types';

import { buildComparisonGroups } from './comparisonSeries';

/** Minimale Messstelle — der Helper nutzt nur id/name/type. */
function mp(
  id: number,
  name: string,
  type: MeterType,
): Pick<MeasuringPointRead, 'id' | 'name' | 'type'> {
  return { id, name, type };
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
      filteredPoints: [mp(2, 'Wasser B', 'water'), mp(1, 'Strom A', 'electricity')],
      consumptions: {
        1: [cp('1.8.0', '2024-01-31', '100', 'kWh')],
        2: [cp('water', '2024-01-31', '5', 'm³')],
      },
    });

    expect(groups.map((g) => [g.type, g.unit])).toEqual([
      ['electricity', 'kWh'],
      ['water', 'm³'],
    ]);
  });

  it('summiert HT + NT desselben Zählers zu EINER Bezugs-Serie', () => {
    const groups = buildComparisonGroups({
      filteredPoints: [mp(1, 'Strom HT/NT', 'electricity')],
      consumptions: {
        1: [cp('1.8.1', '2024-01-31', '60', 'kWh'), cp('1.8.2', '2024-01-31', '40', 'kWh')],
      },
    });

    expect(groups).toHaveLength(1);
    const g = at(groups, 0);
    expect(g.seriesKeys).toEqual(['mp-1::draw']);
    expect(g.labelOf['mp-1::draw']).toBe('Strom HT/NT');
    expect(g.series).toEqual([{ date: '2024-01-31', 'mp-1::draw': 100 }]);
  });

  it('bidirektional: Bezug (1.8.x) und Einspeisung (2.8.x) als getrennte Serien mit Suffix-Label', () => {
    const groups = buildComparisonGroups({
      filteredPoints: [mp(1, 'Strom', 'electricity')],
      consumptions: {
        1: [cp('1.8.0', '2024-01-31', '100', 'kWh'), cp('2.8.0', '2024-01-31', '30', 'kWh')],
      },
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
      filteredPoints: [mp(1, 'A', 'water'), mp(2, 'B', 'water')],
      consumptions: {
        1: [cp('water', '2024-01-31', '5', 'm³'), cp('water', '2024-02-29', '6', 'm³')],
        2: [cp('water', '2024-02-29', '7', 'm³')],
      },
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
      filteredPoints: [mp(7, 'Hauptzähler', 'electricity')],
      consumptions: { 7: [cp('1.8.0', '2024-01-31', '12', 'kWh')] },
    });

    expect(at(groups, 0).labelOf['mp-7::draw']).toBe('Hauptzähler');
  });

  it('leere Eingabe → keine Gruppen; Messstelle ohne Verbrauch erzeugt keine Gruppe', () => {
    expect(buildComparisonGroups({ filteredPoints: [], consumptions: {} })).toEqual([]);
    expect(
      buildComparisonGroups({ filteredPoints: [mp(1, 'A', 'water')], consumptions: {} }),
    ).toEqual([]);
  });

  it('seriesKeys sind deterministisch nach Label sortiert', () => {
    const groups = buildComparisonGroups({
      filteredPoints: [mp(1, 'Zeta', 'water'), mp(2, 'Alpha', 'water')],
      consumptions: {
        1: [cp('water', '2024-01-31', '1', 'm³')],
        2: [cp('water', '2024-01-31', '2', 'm³')],
      },
    });

    expect(at(groups, 0).seriesKeys).toEqual(['mp-2::draw', 'mp-1::draw']); // Alpha vor Zeta
  });
});
