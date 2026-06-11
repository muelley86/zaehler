import { describe, expect, it } from 'vitest';

import type { ReportRow } from '@/lib/types';

import {
  PERIOD_KIND_LABELS,
  buildAggregateQuery,
  diffRows,
  directionSuffix,
  displayGroupLabel,
  groupsWithEinspeisung,
  resolvePeriod,
} from './reportUtils';

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
