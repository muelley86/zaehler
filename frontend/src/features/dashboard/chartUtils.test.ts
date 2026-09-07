import { afterEach, describe, expect, it } from 'vitest';

import {
  clearChartType,
  clearGranularity,
  defaultChartType,
  defaultGranularity,
  loadChartType,
  loadGranularity,
  saveChartType,
  saveGranularity,
} from './chartUtils';

afterEach(() => {
  window.localStorage.clear();
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

describe('defaultChartType', () => {
  it('Tag/Woche → Linie', () => {
    expect(defaultChartType('day')).toBe('line');
    expect(defaultChartType('week')).toBe('line');
  });
  it('Monat/Jahr → Balken', () => {
    expect(defaultChartType('month')).toBe('bar');
    expect(defaultChartType('year')).toBe('bar');
  });
});

describe('localStorage-Helfer', () => {
  it('loadChartType: null wenn nicht gesetzt; persistiert und liest zurück', () => {
    expect(loadChartType()).toBeNull();
    saveChartType('bar');
    expect(loadChartType()).toBe('bar');
  });

  it('loadChartType: ungültiger gespeicherter Wert → null', () => {
    window.localStorage.setItem('dashboard.chartType', 'pie');
    expect(loadChartType()).toBeNull();
  });

  it('clearChartType: löscht die gemerkte Wahl', () => {
    saveChartType('bar');
    clearChartType();
    expect(loadChartType()).toBeNull();
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

  it('clearGranularity: löscht die gemerkte Wahl', () => {
    saveGranularity('week');
    clearGranularity();
    expect(loadGranularity()).toBeNull();
  });
});
