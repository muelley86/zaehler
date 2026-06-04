import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FilterPrefsProvider } from './FilterPrefsProvider';
import { useFilterPrefs } from './filter-prefs-context';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('FilterPrefsProvider', () => {
  it('startet mit rememberFilters=false ohne gespeicherte Praeferenz', () => {
    const { result } = renderHook(() => useFilterPrefs(), { wrapper: FilterPrefsProvider });
    expect(result.current.rememberFilters).toBe(false);
    expect(result.current.sharedRange).toBeNull();
  });

  it('setRememberFilters(true) schreibt localStorage und setzt den State', () => {
    const { result } = renderHook(() => useFilterPrefs(), { wrapper: FilterPrefsProvider });
    act(() => result.current.setRememberFilters(true));
    expect(result.current.rememberFilters).toBe(true);
    expect(window.localStorage.getItem('filters.remember')).toBe('1');
  });

  it('persistiert sharedRange in sessionStorage und entfernt ihn bei clear', () => {
    window.localStorage.setItem('filters.remember', '1');
    const { result } = renderHook(() => useFilterPrefs(), { wrapper: FilterPrefsProvider });

    act(() => result.current.setSharedRange({ from: '2025-01-01', to: '2025-03-31' }));
    expect(result.current.sharedRange).toEqual({ from: '2025-01-01', to: '2025-03-31' });
    expect(window.sessionStorage.getItem('filters.shared.dateRange')).toBe(
      JSON.stringify({ from: '2025-01-01', to: '2025-03-31' }),
    );

    act(() => result.current.clearSharedRange());
    expect(result.current.sharedRange).toBeNull();
    expect(window.sessionStorage.getItem('filters.shared.dateRange')).toBeNull();
  });

  it('Ausschalten wischt alle filters.*-Session-Keys, nullt sharedRange, laesst Fremdes stehen', () => {
    window.localStorage.setItem('filters.remember', '1');
    window.sessionStorage.setItem('filters.dashboard.type', JSON.stringify(['water']));
    window.sessionStorage.setItem('filters.readings.mp', JSON.stringify([5]));
    window.sessionStorage.setItem('unrelated.key', 'keep');

    const { result } = renderHook(() => useFilterPrefs(), { wrapper: FilterPrefsProvider });
    act(() => result.current.setSharedRange({ from: '2025-01-01', to: '2025-12-31' }));
    act(() => result.current.setRememberFilters(false));

    expect(result.current.rememberFilters).toBe(false);
    expect(result.current.sharedRange).toBeNull();
    expect(window.sessionStorage.getItem('filters.dashboard.type')).toBeNull();
    expect(window.sessionStorage.getItem('filters.readings.mp')).toBeNull();
    expect(window.sessionStorage.getItem('filters.shared.dateRange')).toBeNull();
    expect(window.sessionStorage.getItem('unrelated.key')).toBe('keep');
    expect(window.localStorage.getItem('filters.remember')).toBe('0');
  });
});
