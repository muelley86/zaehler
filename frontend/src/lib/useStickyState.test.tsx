import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { enumCodec, setCodec, stringCodec, useStickyState } from './useStickyState';

const KEY = 'filters.test.value';

const idCodec = setCodec<number | null>(
  (x): x is number | null => x === null || typeof x === 'number',
);

afterEach(() => {
  // Das globale Test-Setup raeumt nur localStorage — sessionStorage hier.
  window.sessionStorage.clear();
});

describe('useStickyState', () => {
  it('persistiert ein Set<number | null> (inkl. null) und stellt es beim Remount wieder her', () => {
    const first = renderHook(() =>
      useStickyState<Set<number | null>>(KEY, new Set(), true, idCodec),
    );
    act(() => {
      first.result.current[1](new Set<number | null>([1, null, 3]));
    });
    expect(window.sessionStorage.getItem(KEY)).toBe(JSON.stringify([1, null, 3]));
    first.unmount();

    const second = renderHook(() =>
      useStickyState<Set<number | null>>(KEY, new Set(), true, idCodec),
    );
    expect([...second.result.current[0]]).toEqual([1, null, 3]);
  });

  it('schreibt nichts und ignoriert vorhandenen Storage, wenn enabled=false', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify([7]));

    const { result } = renderHook(() =>
      useStickyState<Set<number | null>>(KEY, new Set(), false, idCodec),
    );
    // Vorhandener Storage wird ignoriert -> Default.
    expect([...result.current[0]]).toEqual([]);

    act(() => {
      result.current[1](new Set<number | null>([9]));
    });
    // Kein Write bei enabled=false -> der vorab gesetzte Wert bleibt unveraendert.
    expect(window.sessionStorage.getItem(KEY)).toBe(JSON.stringify([7]));
  });

  it('faellt bei kaputtem JSON auf den Default zurueck, ohne zu werfen', () => {
    window.sessionStorage.setItem(KEY, 'kein-json{');

    const { result } = renderHook(() =>
      useStickyState<Set<number | null>>(KEY, new Set(), true, idCodec),
    );
    expect([...result.current[0]]).toEqual([]);
  });

  it('round-trippt einen String ueber stringCodec', () => {
    const first = renderHook(() => useStickyState<string>(KEY, '', true, stringCodec));
    act(() => {
      first.result.current[1]('hallo');
    });
    expect(window.sessionStorage.getItem(KEY)).toBe('hallo');
    first.unmount();

    const second = renderHook(() => useStickyState<string>(KEY, '', true, stringCodec));
    expect(second.result.current[0]).toBe('hallo');
  });

  it('enumCodec round-trippt gueltige Werte und faellt bei Fremdwerten auf den Default', () => {
    type Color = 'red' | 'blue';
    const codec = enumCodec<Color>((x): x is Color => x === 'red' || x === 'blue');

    const first = renderHook(() => useStickyState<Color>(KEY, 'red', true, codec));
    act(() => {
      first.result.current[1]('blue');
    });
    expect(window.sessionStorage.getItem(KEY)).toBe('blue');
    first.unmount();

    const second = renderHook(() => useStickyState<Color>(KEY, 'red', true, codec));
    expect(second.result.current[0]).toBe('blue');
    second.unmount();

    // Fremdwert (z. B. veralteter Enum-Wert) -> Default statt kaputtem State.
    window.sessionStorage.setItem(KEY, 'green');
    const third = renderHook(() => useStickyState<Color>(KEY, 'red', true, codec));
    expect(third.result.current[0]).toBe('red');
  });
});
