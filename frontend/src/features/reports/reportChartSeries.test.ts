import { describe, expect, it } from 'vitest';

import type { ReportRow } from '@/lib/types';

import {
  COMPARE_A_KEY,
  COMPARE_B_KEY,
  VALUE_KEY,
  buildReportChartGroups,
  countSeries,
} from './reportChartSeries';
import { diffRows } from './reportUtils';

function row(over: Partial<ReportRow>): ReportRow {
  return {
    group_key: 1,
    group_label: 'Halle',
    meter_type: 'electricity',
    unit: 'kWh',
    direction: 'bezug',
    period_start: null,
    period_end: null,
    consumption: '10',
    ...over,
  };
}

describe('buildReportChartGroups — kategorisch (Gesamt)', () => {
  it('bildet je (Zählerart, Einheit) eine Gruppe mit einem Balken je Zeile, sortiert nach TYPE_ORDER', () => {
    const groups = buildReportChartGroups({
      rows: [
        row({ group_key: 3, group_label: 'Garten', meter_type: 'water', unit: 'm³' }),
        row({ group_key: 1, group_label: 'Halle', consumption: '10' }),
        row({ group_key: 2, group_label: 'Büro', consumption: '5.5' }),
      ],
      comparison: null,
      granularity: 'total',
    });

    expect(groups.map((g) => g.id)).toEqual(['electricity::kWh', 'water::m³']);
    const strom = groups[0]!;
    expect(strom.mode).toBe('categorical');
    expect(strom.seriesKeys).toEqual([VALUE_KEY]);
    expect(strom.data).toEqual([
      { x: 'Halle', [VALUE_KEY]: 10 },
      { x: 'Büro', [VALUE_KEY]: 5.5 },
    ]);
  });

  it('kennzeichnet Einspeisung und verrechnete Zeilen im Label wie die Tabelle', () => {
    const groups = buildReportChartGroups({
      rows: [
        row({ group_label: 'PV', direction: 'bezug' }),
        row({ group_label: 'PV', direction: 'einspeisung', consumption: '3' }),
        row({ group_key: 9, group_label: 'Saldo', is_virtual: true }),
      ],
      comparison: null,
      granularity: 'total',
    });

    expect(groups[0]!.data.map((d) => d.x)).toEqual([
      'PV · Bezug',
      'PV · Einspeisung',
      'Saldo (verrechnet)',
    ]);
  });
});

describe('buildReportChartGroups — Vergleich', () => {
  it('liefert Aktuell/Vergleich als zwei Balken je Zeile', () => {
    const comparison = diffRows(
      [row({ consumption: '120' })],
      [row({ consumption: '100' }), row({ group_key: 2, group_label: 'Büro', consumption: '7' })],
    );
    const groups = buildReportChartGroups({ rows: [], comparison, granularity: 'month' });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.mode).toBe('categorical');
    expect(groups[0]!.seriesKeys).toEqual([COMPARE_A_KEY, COMPARE_B_KEY]);
    expect(groups[0]!.labelOf).toEqual({ a: 'Aktuell', b: 'Vergleich' });
    expect(groups[0]!.data).toEqual([
      { x: 'Büro', a: 0, b: 7 },
      { x: 'Halle', a: 120, b: 100 },
    ]);
  });

  it('übernimmt die Zeitraum-Labels des Laufs als Serien-Namen', () => {
    const comparison = diffRows([row({ consumption: '120' })], [row({ consumption: '100' })]);
    const groups = buildReportChartGroups({
      rows: [],
      comparison,
      granularity: 'total',
      comparisonLabels: { a: '01.01.2026 – 31.12.2026', b: '01.01.2025 – 31.12.2025' },
    });

    expect(groups[0]!.labelOf).toEqual({
      a: '01.01.2026 – 31.12.2026',
      b: '01.01.2025 – 31.12.2025',
    });
  });
});

describe('buildReportChartGroups — Zeitreihe', () => {
  it('pivotiert je period_end mit einer Serie je Gruppe(+Richtung), nach Datum sortiert', () => {
    const groups = buildReportChartGroups({
      rows: [
        row({ period_end: '2026-02-28', consumption: '12' }),
        row({ period_end: '2026-01-31', consumption: '10' }),
        row({ group_key: 2, group_label: 'Büro', period_end: '2026-01-31', consumption: '4' }),
        row({ period_end: null, consumption: '999' }), // ohne Periode → ignoriert
      ],
      comparison: null,
      granularity: 'month',
    });

    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.mode).toBe('timeseries');
    expect(g.seriesKeys).toHaveLength(2);
    const [halle, buero] = g.seriesKeys;
    expect(g.labelOf[halle!]).toBe('Halle');
    expect(g.labelOf[buero!]).toBe('Büro');
    expect(g.data).toEqual([
      { x: '2026-01-31', [halle!]: 10, [buero!]: 4 },
      { x: '2026-02-28', [halle!]: 12 },
    ]);
  });

  it('virtuelle und echte Zeilen mit gleicher ID kollidieren nicht', () => {
    const groups = buildReportChartGroups({
      rows: [
        row({ group_key: 1, group_label: 'X', period_end: '2026-01-31', consumption: '1' }),
        row({
          group_key: 1,
          group_label: 'X',
          period_end: '2026-01-31',
          consumption: '2',
          is_virtual: true,
        }),
      ],
      comparison: null,
      granularity: 'month',
    });

    expect(groups[0]!.seriesKeys).toHaveLength(2);
    expect(Object.values(groups[0]!.labelOf)).toEqual(['X', 'X (verrechnet)']);
  });
});

describe('countSeries', () => {
  it('zählt Balken (kategorisch) bzw. Serien (Zeitreihe)', () => {
    const categorical = buildReportChartGroups({
      rows: [row({}), row({ group_key: 2, group_label: 'B' })],
      comparison: null,
      granularity: 'total',
    });
    const timeseries = buildReportChartGroups({
      rows: [
        row({ period_end: '2026-01-31' }),
        row({ period_end: '2026-02-28' }),
        row({ group_key: 2, group_label: 'B', period_end: '2026-01-31' }),
      ],
      comparison: null,
      granularity: 'month',
    });

    expect(countSeries(categorical)).toBe(2);
    expect(countSeries(timeseries)).toBe(2);
  });
});
