import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  bucketEndIso,
  defaultGranularity,
  loadChartType,
  loadGranularity,
  saveChartType,
  saveGranularity,
} from './chartUtils';

// Zeitzone fuer diese Datei auf Europe/Berlin pinnen — die Lokalzeit-Bucketing-
// Tests sollen deterministisch sein, unabhaengig von der TZ des Test-Runners.
// Restore in afterAll, damit andere Testdateien im selben Worker unberuehrt bleiben.
const ORIG_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Berlin';
});
afterAll(() => {
  process.env.TZ = ORIG_TZ;
});

afterEach(() => {
  window.localStorage.clear();
});

describe('bucketEndIso', () => {
  it('Tag: gibt das Datum selbst zurück (akzeptiert auch Datetime)', () => {
    expect(bucketEndIso('2024-06-05', 'day')).toBe('2024-06-05');
    expect(bucketEndIso('2024-06-05T18:30:00Z', 'day')).toBe('2024-06-05');
  });

  it('Woche: liefert den ISO-Sonntag (Mo–So)', () => {
    expect(bucketEndIso('2024-06-03', 'week')).toBe('2024-06-09'); // Montag
    expect(bucketEndIso('2024-06-05', 'week')).toBe('2024-06-09'); // Mittwoch
    expect(bucketEndIso('2024-06-09', 'week')).toBe('2024-06-09'); // Sonntag
    expect(bucketEndIso('2024-06-10', 'week')).toBe('2024-06-16'); // nächster Montag
  });

  it('Monat: liefert den letzten Tag des Monats (inkl. Schaltjahr)', () => {
    expect(bucketEndIso('2024-02-15', 'month')).toBe('2024-02-29');
    expect(bucketEndIso('2024-04-10', 'month')).toBe('2024-04-30');
    expect(bucketEndIso('2024-12-05', 'month')).toBe('2024-12-31');
  });

  it('Jahr: liefert den 31.12.', () => {
    expect(bucketEndIso('2024-03-01', 'year')).toBe('2024-12-31');
  });

  it("Instant um lokale Mitternacht bucket't auf den lokalen Tag (Browser-TZ)", () => {
    // 2024-12-31T23:00:00Z == 01.01.2025 00:00 Europe/Berlin → lokaler Tag 01.01.2025.
    expect(bucketEndIso('2024-12-31T23:00:00Z', 'day')).toBe('2025-01-01');
    expect(bucketEndIso('2024-12-31T23:00:00Z', 'month')).toBe('2025-01-31');
  });
});

describe('defaultGranularity', () => {
  it('kurze Spanne → Tag', () => {
    expect(defaultGranularity('2024-06-01', '2024-06-30')).toBe('day');
  });
  it('mittlere Spanne → Woche', () => {
    expect(defaultGranularity('2024-01-01', '2024-06-01')).toBe('week');
  });
  it('ein Jahr → Monat', () => {
    expect(defaultGranularity('2024-01-01', '2024-12-31')).toBe('month');
  });
  it('mehrere Jahre → Jahr', () => {
    expect(defaultGranularity('2020-01-01', '2024-12-31')).toBe('year');
  });
  it('leere/ungültige Eingabe → Monat', () => {
    expect(defaultGranularity('', '')).toBe('month');
  });
});

describe('localStorage-Helfer', () => {
  it('loadChartType: Default line; persistiert und liest zurück', () => {
    expect(loadChartType()).toBe('line');
    saveChartType('bar');
    expect(loadChartType()).toBe('bar');
  });

  it('loadChartType: ungültiger gespeicherter Wert → line', () => {
    window.localStorage.setItem('dashboard.chartType', 'pie');
    expect(loadChartType()).toBe('line');
  });

  it('loadGranularity: null wenn nicht gesetzt, sonst gespeicherter Wert', () => {
    expect(loadGranularity()).toBeNull();
    saveGranularity('week');
    expect(loadGranularity()).toBe('week');
  });

  it('loadGranularity: ungültiger Wert → null', () => {
    window.localStorage.setItem('dashboard.granularity', 'decade');
    expect(loadGranularity()).toBeNull();
  });
});
