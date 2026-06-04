import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FilterPrefsProvider } from './FilterPrefsProvider';
import { useFilterPrefs } from './filter-prefs-context';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const thisYear = new Date().getFullYear();
const YEAR_RANGE = { from: `${thisYear}-01-01`, to: `${thisYear}-12-31` };

describe('FilterPrefsProvider', () => {
  it('startet mit rememberFilters=false und dateRange = laufendes Jahr', () => {
    const { result } = renderHook(() => useFilterPrefs(), { wrapper: FilterPrefsProvider });
    expect(result.current.rememberFilters).toBe(false);
    expect(result.current.dateRange).toEqual(YEAR_RANGE);
  });

  it('lädt einen gespeicherten dateRange aus sessionStorage', () => {
    window.sessionStorage.setItem(
      'app.dateRange',
      JSON.stringify({ from: '2022-01-01', to: '2022-12-31' }),
    );
    const { result } = renderHook(() => useFilterPrefs(), { wrapper: FilterPrefsProvider });
    expect(result.current.dateRange).toEqual({ from: '2022-01-01', to: '2022-12-31' });
  });

  it('setFrom/setTo aktualisieren und persistieren app.dateRange', async () => {
    const { result } = renderHook(() => useFilterPrefs(), { wrapper: FilterPrefsProvider });
    act(() => result.current.setFrom('2025-03-01'));
    act(() => result.current.setTo('2025-09-30'));
    expect(result.current.dateRange).toEqual({ from: '2025-03-01', to: '2025-09-30' });
    await waitFor(() =>
      expect(window.sessionStorage.getItem('app.dateRange')).toBe(
        JSON.stringify({ from: '2025-03-01', to: '2025-09-30' }),
      ),
    );
  });

  it('stepYear(-1) verschiebt den Bereich um ein Jahr zurück', () => {
    window.sessionStorage.setItem(
      'app.dateRange',
      JSON.stringify({ from: '2026-01-01', to: '2026-12-31' }),
    );
    const { result } = renderHook(() => useFilterPrefs(), { wrapper: FilterPrefsProvider });
    act(() => result.current.stepYear(-1));
    expect(result.current.dateRange).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('Ausschalten von „Filter merken" wischt filters.*-Keys, lässt den Datumsbereich aber unangetastet', () => {
    window.localStorage.setItem('filters.remember', '1');
    window.sessionStorage.setItem('filters.dashboard.type', JSON.stringify(['water']));
    window.sessionStorage.setItem(
      'app.dateRange',
      JSON.stringify({ from: '2020-01-01', to: '2020-12-31' }),
    );
    window.sessionStorage.setItem('unrelated.key', 'keep');

    const { result } = renderHook(() => useFilterPrefs(), { wrapper: FilterPrefsProvider });
    expect(result.current.dateRange).toEqual({ from: '2020-01-01', to: '2020-12-31' });

    act(() => result.current.setRememberFilters(false));

    expect(result.current.rememberFilters).toBe(false);
    expect(window.localStorage.getItem('filters.remember')).toBe('0');
    expect(window.sessionStorage.getItem('filters.dashboard.type')).toBeNull();
    // Datumsbereich hängt nicht mehr an „Filter merken" — bleibt erhalten.
    expect(window.sessionStorage.getItem('app.dateRange')).toBe(
      JSON.stringify({ from: '2020-01-01', to: '2020-12-31' }),
    );
    expect(result.current.dateRange).toEqual({ from: '2020-01-01', to: '2020-12-31' });
    expect(window.sessionStorage.getItem('unrelated.key')).toBe('keep');
  });
});
