import { describe, expect, it } from 'vitest';

import type { ReportRow } from '@/lib/types';

import { buildAggregateQuery, diffRows, resolvePeriod } from './reportUtils';

describe('resolvePeriod', () => {
  const today = new Date(2024, 5, 15); // 15. Juni 2024 (lokal)

  it('current_year → Kalenderjahr', () => {
    expect(resolvePeriod('current_year', today)).toEqual({ from: '2024-01-01', to: '2024-12-31' });
  });
  it('current_month → Monatsgrenzen', () => {
    expect(resolvePeriod('current_month', today)).toEqual({ from: '2024-06-01', to: '2024-06-30' });
  });
  it('last_month → Vormonat', () => {
    expect(resolvePeriod('last_month', today)).toEqual({ from: '2024-05-01', to: '2024-05-31' });
  });
  it('last_12_months → 12 Kalendermonate inkl. aktuellem', () => {
    expect(resolvePeriod('last_12_months', today)).toEqual({
      from: '2023-07-01',
      to: '2024-06-30',
    });
  });
  it('all/fixed → ohne Grenzen', () => {
    expect(resolvePeriod('all', today)).toEqual({ from: null, to: null });
    expect(resolvePeriod('fixed', today)).toEqual({ from: null, to: null });
  });
  it('Jahreswechsel: last_month im Januar → Dezember Vorjahr', () => {
    expect(resolvePeriod('last_month', new Date(2024, 0, 10))).toEqual({
      from: '2023-12-01',
      to: '2023-12-31',
    });
  });
});

function first<T>(arr: T[]): T {
  const x = arr[0];
  if (x === undefined) throw new Error('erwartete mindestens ein Element');
  return x;
}

function row(group_key: number | null, label: string, unit: string, value: string): ReportRow {
  return {
    group_key,
    group_label: label,
    meter_type: 'electricity',
    unit,
    period_start: null,
    period_end: null,
    consumption: value,
  };
}

describe('diffRows', () => {
  it('berechnet Delta und Prozent je (Gruppe, Art, Einheit)', () => {
    const a = [row(1, 'KSt 1', 'kWh', '120')];
    const b = [row(1, 'KSt 1', 'kWh', '100')];
    const d = first(diffRows(a, b));
    expect(d.a).toBe(120);
    expect(d.b).toBe(100);
    expect(d.delta).toBe(20);
    expect(d.pct).toBeCloseTo(20);
  });

  it('fehlende Seite zählt als 0', () => {
    const d = first(diffRows([row(2, 'Neu', 'kWh', '50')], []));
    expect(d.a).toBe(50);
    expect(d.b).toBe(0);
    expect(d.delta).toBe(50);
    expect(d.pct).toBeNull(); // b=0, a>0 → undefiniert
  });

  it('beide 0 → pct 0', () => {
    const d = first(diffRows([row(3, 'X', 'kWh', '0')], [row(3, 'X', 'kWh', '0')]));
    expect(d.pct).toBe(0);
  });
});

describe('buildAggregateQuery', () => {
  it('setzt Dimension/Granularität und lässt leere Daten weg', () => {
    const qs = buildAggregateQuery({
      dimension: 'kostenstelle',
      granularity: 'total',
      from: null,
      to: null,
      mainLocationIds: [],
      locationIds: [],
      ownerIds: [],
      kostenstellen: [],
      meterTypes: [],
    });
    const p = new URLSearchParams(qs);
    expect(p.get('dimension')).toBe('kostenstelle');
    expect(p.get('granularity')).toBe('total');
    expect(p.has('from_at')).toBe(false);
    expect(p.has('to_at')).toBe(false);
  });

  it('hängt wiederholbare Filter-Parameter an', () => {
    const qs = buildAggregateQuery({
      dimension: 'owner',
      granularity: 'month',
      from: '2024-01-01',
      to: '2024-12-31',
      mainLocationIds: [],
      locationIds: [],
      ownerIds: [7, 8],
      kostenstellen: [10001],
      meterTypes: ['electricity', 'water'],
    });
    const p = new URLSearchParams(qs);
    expect(p.get('from_at')).toBe('2024-01-01');
    expect(p.getAll('owner_id')).toEqual(['7', '8']);
    expect(p.getAll('kostenstelle')).toEqual(['10001']);
    expect(p.getAll('meter_type')).toEqual(['electricity', 'water']);
  });
});
