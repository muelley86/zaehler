import { describe, expect, it } from 'vitest';

import type { ReportRow } from '@/lib/types';

import {
  PERIOD_KIND_LABELS,
  buildAggregateQuery,
  comparisonCsvRows,
  diffRows,
  directionSuffix,
  displayGroupLabel,
  groupsWithEinspeisung,
  periodLabel,
  previousPeriodRange,
  previousYearRange,
  resolveComparePeriod,
  resolvePeriod,
  rowKey,
  runBlocker,
} from './reportUtils';

describe('Vergleichsperioden', () => {
  it('previousYearRange verschiebt um ein Jahr, Monatsende bleibt Monatsende', () => {
    expect(previousYearRange({ from: '2026-08-01', to: '2026-09-30' })).toEqual({
      from: '2025-08-01',
      to: '2025-09-30',
    });
    expect(previousYearRange({ from: '2028-02-01', to: '2028-02-29' })).toEqual({
      from: '2027-02-01',
      to: '2027-02-28',
    });
    expect(previousYearRange({ from: null, to: null })).toEqual({ from: null, to: null });
  });

  it('previousPeriodRange: monatsaligned → gleich viele ganze Monate zurück', () => {
    expect(previousPeriodRange({ from: '2026-08-01', to: '2026-09-30' })).toEqual({
      from: '2026-06-01',
      to: '2026-07-31',
    });
    expect(previousPeriodRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('previousPeriodRange: sonst gleiche Tageslänge endend am Vortag', () => {
    expect(previousPeriodRange({ from: '2026-03-10', to: '2026-03-19' })).toEqual({
      from: '2026-02-28',
      to: '2026-03-09',
    });
    expect(previousPeriodRange({ from: '2026-01-01', to: null })).toEqual({ from: null, to: null });
  });

  it('resolveComparePeriod: benutzerdefiniert nimmt die freien Felder', () => {
    const p = { from: '2026-08-01', to: '2026-09-30' };
    expect(resolveComparePeriod('custom', p, '2024-01-01', '')).toEqual({
      from: '2024-01-01',
      to: null,
    });
    expect(resolveComparePeriod('previous_year', p, '', '')).toEqual(previousYearRange(p));
    expect(resolveComparePeriod('previous_period', p, '', '')).toEqual(previousPeriodRange(p));
  });
});

describe('comparisonCsvRows', () => {
  it('Kopf trägt die Zeitraum-Labels, Werte mit Komma-Dezimal', () => {
    const rows = diffRows(
      [
        {
          group_key: 1,
          group_label: 'Halle',
          meter_type: 'electricity',
          unit: 'kWh',
          direction: 'einspeisung',
          period_start: null,
          period_end: null,
          consumption: '120.5',
        },
      ],
      [],
    );
    const csv = comparisonCsvRows(rows, { a: '01.01.2026 – 31.12.2026', b: 'Gesamter Zeitraum' });
    expect(csv).toEqual([
      [
        'Gruppe',
        'Zählerart',
        'Richtung',
        'Einheit',
        '01.01.2026 – 31.12.2026',
        'Gesamter Zeitraum',
        'Differenz',
      ],
      ['Halle', 'Strom', 'Einspeisung', 'kWh', '120,5', '0', '120,5'],
    ]);
  });
});

describe('periodLabel', () => {
  it('beide Daten → deutscher Datumsbereich', () => {
    expect(periodLabel('2025-01-01', '2025-12-31')).toBe('01.01.2025 – 31.12.2025');
  });
  it('nur Von → „ab"', () => {
    expect(periodLabel('2025-01-01', null)).toBe('ab 01.01.2025');
  });
  it('nur Bis → „bis"', () => {
    expect(periodLabel(null, '2025-12-31')).toBe('bis 31.12.2025');
  });
  it('ohne Grenzen → Gesamter Zeitraum', () => {
    expect(periodLabel(null, null)).toBe('Gesamter Zeitraum');
  });
});

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
  it('all/fixed/shared_range → ohne Grenzen (Aufrufer injiziert ggf. den globalen Bereich)', () => {
    expect(resolvePeriod('all', today)).toEqual({ from: null, to: null });
    expect(resolvePeriod('fixed', today)).toEqual({ from: null, to: null });
    expect(resolvePeriod('shared_range', today)).toEqual({ from: null, to: null });
  });
  it('Label für shared_range', () => {
    expect(PERIOD_KIND_LABELS.shared_range).toBe('Aktueller Zeitraum');
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

function row(
  group_key: number | null,
  label: string,
  unit: string,
  value: string,
  direction: 'bezug' | 'einspeisung' = 'bezug',
): ReportRow {
  return {
    group_key,
    group_label: label,
    meter_type: 'electricity',
    unit,
    direction,
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

  it('Bezug und Einspeisung werden nicht vermischt', () => {
    const a = [row(4, 'PV', 'kWh', '100', 'bezug'), row(4, 'PV', 'kWh', '30', 'einspeisung')];
    const b = [row(4, 'PV', 'kWh', '80', 'bezug')];
    const rows = diffRows(a, b);
    expect(rows).toHaveLength(2);
    const bezug = rows.find((r) => r.direction === 'bezug');
    const einspeisung = rows.find((r) => r.direction === 'einspeisung');
    expect(bezug?.a).toBe(100);
    expect(bezug?.b).toBe(80);
    expect(einspeisung?.a).toBe(30);
    expect(einspeisung?.b).toBe(0);
  });
});

describe('directionSuffix', () => {
  const pvBezug = row(4, 'PV', 'kWh', '100', 'bezug');
  const pvEinspeisung = row(4, 'PV', 'kWh', '30', 'einspeisung');
  const halleBezug = row(5, 'Halle', 'kWh', '50', 'bezug');
  const rows = [pvBezug, pvEinspeisung, halleBezug];

  it('bidirektionale Gruppe: beide Richtungen werden beschriftet', () => {
    const bidiGroups = groupsWithEinspeisung(rows);
    expect(directionSuffix(pvBezug, bidiGroups)).toBe('Bezug');
    expect(directionSuffix(pvEinspeisung, bidiGroups)).toBe('Einspeisung');
  });

  it('Bezugs-Zeile ohne Einspeisungs-Pendant bleibt ohne Zusatz', () => {
    const bidiGroups = groupsWithEinspeisung(rows);
    expect(directionSuffix(halleBezug, bidiGroups)).toBeNull();
  });

  it('andere Zählerart derselben Gruppe bekommt kein „Bezug"', () => {
    // Dimension Standort: bidirektionaler Stromzähler + Wasserzähler am selben Ort.
    const wasser: ReportRow = { ...row(4, 'PV', 'm³', '10', 'bezug'), meter_type: 'water' };
    const bidiGroups = groupsWithEinspeisung([...rows, wasser]);
    expect(directionSuffix(wasser, bidiGroups)).toBeNull();
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
      measuringPointIds: [],
    });
    const p = new URLSearchParams(qs);
    expect(p.has('measuring_point_id')).toBe(false);
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
      measuringPointIds: [3, 5],
    });
    const p = new URLSearchParams(qs);
    expect(p.getAll('measuring_point_id')).toEqual(['3', '5']);
    expect(p.get('from_at')).toBe('2024-01-01');
    expect(p.getAll('owner_id')).toEqual(['7', '8']);
    expect(p.getAll('kostenstelle')).toEqual(['10001']);
    expect(p.getAll('meter_type')).toEqual(['electricity', 'water']);
  });
});

describe('verrechnete Messstellen (is_virtual)', () => {
  it('displayGroupLabel hängt "(verrechnet)" nur an virtuelle Zeilen', () => {
    expect(displayGroupLabel('Biogas', true)).toBe('Biogas (verrechnet)');
    expect(displayGroupLabel('Biogas', false)).toBe('Biogas');
    expect(displayGroupLabel('Biogas', undefined)).toBe('Biogas');
  });

  it('diffRows trennt virtuelle und echte Zeile mit gleicher group_key', () => {
    const real = row(5, 'Halle', 'kWh', '100');
    const virt: ReportRow = { ...row(5, 'Halle', 'kWh', '40'), is_virtual: true };
    const rows = diffRows([real, virt], []);
    expect(rows).toHaveLength(2);
    const v = rows.find((r) => r.is_virtual);
    expect(v?.a).toBe(40);
    expect(rows.find((r) => !r.is_virtual)?.a).toBe(100);
  });
});

describe('runBlocker', () => {
  const ready = {
    periodKind: 'shared_range' as const,
    customFrom: '',
    customTo: '',
    periodFrom: '2026-08-01',
    periodTo: '2026-09-30',
    compare: false,
    compareKind: 'previous_year' as const,
    compareFrom: '',
    compareTo: '',
  };

  it('ist null, wenn alle Filter Standardwerte haben', () => {
    expect(runBlocker(ready)).toBeNull();
  });

  it('blockiert „Benutzerdefiniert" ohne beide Daten', () => {
    expect(runBlocker({ ...ready, periodKind: 'fixed' })).toMatch(/Von- und Bis-Datum/);
    expect(runBlocker({ ...ready, periodKind: 'fixed', customFrom: '2026-01-01' })).toMatch(
      /Von- und Bis-Datum/,
    );
    expect(
      runBlocker({
        ...ready,
        periodKind: 'fixed',
        customFrom: '2026-01-01',
        customTo: '2026-01-31',
      }),
    ).toBeNull();
  });

  it('blockiert den benutzerdefinierten Vergleich ohne beide Vergleichsdaten', () => {
    const custom = { ...ready, compare: true, compareKind: 'custom' as const };
    expect(runBlocker(custom)).toMatch(/Vergleichsdaten/);
    expect(runBlocker({ ...custom, compareTo: '2025-12-31' })).toMatch(/Vergleichsdaten/);
    expect(
      runBlocker({ ...custom, compareFrom: '2025-01-01', compareTo: '2025-12-31' }),
    ).toBeNull();
  });

  it('Vorjahr/Vorperiode brauchen eine begrenzte Periode 1', () => {
    expect(runBlocker({ ...ready, compare: true })).toBeNull();
    expect(runBlocker({ ...ready, compare: true, periodFrom: null, periodTo: null })).toMatch(
      /begrenzten Zeitraum/,
    );
    expect(
      runBlocker({
        ...ready,
        compare: true,
        compareKind: 'previous_period',
        periodFrom: null,
        periodTo: null,
      }),
    ).toMatch(/begrenzten Zeitraum/);
    // Benutzerdefiniert kommt ohne Periode 1 aus.
    expect(
      runBlocker({
        ...ready,
        compare: true,
        compareKind: 'custom',
        periodFrom: null,
        periodTo: null,
        compareFrom: '2025-01-01',
        compareTo: '2025-12-31',
      }),
    ).toBeNull();
  });
});

describe('rowKey', () => {
  it('trennt virtuelle von echten Zeilen mit gleicher ID', () => {
    const base: ReportRow = {
      group_key: 1,
      group_label: 'A',
      meter_type: 'electricity',
      unit: 'kWh',
      direction: 'bezug',
      period_start: null,
      period_end: null,
      consumption: '1',
    };
    expect(rowKey(base)).not.toBe(rowKey({ ...base, is_virtual: true }));
    expect(rowKey(base)).not.toBe(rowKey({ ...base, direction: 'einspeisung' }));
  });
});
