import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FilterPrefsProvider } from './FilterPrefsProvider';
import { useSharedDateRange } from './useSharedDateRange';

const DASH_DEFAULT = { from: '2026-01-01', to: '2026-12-31' };
const READINGS_DEFAULT = { from: '', to: '' };

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('useSharedDateRange', () => {
  it('nutzt bei deaktivierter Option lokalen State (Seiten-Default) und teilt nichts', () => {
    const { result } = renderHook(() => useSharedDateRange(DASH_DEFAULT), {
      wrapper: FilterPrefsProvider,
    });
    expect(result.current.from).toBe('2026-01-01');
    expect(result.current.to).toBe('2026-12-31');

    act(() => result.current.setFrom('2025-04-01'));
    expect(result.current.from).toBe('2025-04-01');
    expect(window.sessionStorage.getItem('filters.shared.dateRange')).toBeNull();
  });

  it('teilt den Datumsbereich bei aktiver Option seitenuebergreifend (null-until-set)', () => {
    window.localStorage.setItem('filters.remember', '1');
    const { result } = renderHook(
      () => ({
        dash: useSharedDateRange(DASH_DEFAULT),
        readings: useSharedDateRange(READINGS_DEFAULT),
      }),
      { wrapper: FilterPrefsProvider },
    );

    // Vor der ersten Eingabe: jede Seite zeigt ihren eigenen Default.
    expect(result.current.dash.from).toBe('2026-01-01');
    expect(result.current.readings.from).toBe('');

    // Eingabe auf der „Dashboard"-Seite seedet den geteilten Bereich
    // (anderes Feld kommt aus dem Default dieser Seite).
    act(() => result.current.dash.setFrom('2025-06-01'));
    expect(result.current.dash.from).toBe('2025-06-01');
    expect(result.current.dash.to).toBe('2026-12-31');

    // … und gilt sofort auch auf der „Erfassungen"-Seite (ueberschreibt deren Default).
    expect(result.current.readings.from).toBe('2025-06-01');
    expect(result.current.readings.to).toBe('2026-12-31');

    // Reset auf einer Seite raeumt den geteilten Bereich -> beide fallen auf
    // ihren eigenen Default zurueck.
    act(() => result.current.readings.reset());
    expect(result.current.dash.from).toBe('2026-01-01');
    expect(result.current.readings.from).toBe('');
    expect(window.sessionStorage.getItem('filters.shared.dateRange')).toBeNull();
  });
});
