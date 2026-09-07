/**
 * Tests für useMediaQuery: liest den aktuellen Match-Status per
 * useSyncExternalStore, reagiert auf das change-Event der MediaQueryList
 * und liefert false, wenn window.matchMedia in der Umgebung fehlt.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DESKTOP_QUERY, useIsDesktop, useMediaQuery } from './useMediaQuery';

type ChangeListener = (event: Pick<MediaQueryListEvent, 'matches'>) => void;

/**
 * Minimaler MediaQueryList-Mock mit steuerbarem change-Event. ``shape`` bleibt
 * ohne explizite Typannotation (freie Inferenz), damit die Parameter der
 * add/removeEventListener-Methoden nicht implizit ``any`` werden — der Cast
 * auf ``MediaQueryList`` passiert erst am Ende, über eine Variable (nicht am
 * Objekt-Literal) — sonst greift ``consistent-type-assertions``/
 * ``objectLiteralTypeAssertions: never``.
 */
function createMql(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<ChangeListener>();

  function addEventListener(_type: 'change', cb: ChangeListener): void {
    listeners.add(cb);
  }
  function removeEventListener(_type: 'change', cb: ChangeListener): void {
    listeners.delete(cb);
  }

  const shape = {
    get matches() {
      return matches;
    },
    media: DESKTOP_QUERY,
    addEventListener,
    removeEventListener,
  };

  return {
    mql: shape as unknown as MediaQueryList,
    setMatches: (next: boolean) => {
      matches = next;
      for (const cb of listeners) cb({ matches: next });
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMediaQuery', () => {
  it('gibt true zurück, wenn die Query aktuell matcht', () => {
    const { mql } = createMql(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql);

    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(true);
  });

  it('gibt false zurück, wenn die Query nicht matcht', () => {
    const { mql } = createMql(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql);

    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(false);
  });

  it('reagiert auf das change-Event der MediaQueryList', () => {
    const { mql, setMatches } = createMql(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql);

    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(false);

    act(() => {
      setMatches(true);
    });
    expect(result.current).toBe(true);
  });

  it('liefert false, wenn window.matchMedia in der Umgebung fehlt', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => {
      throw new Error('matchMedia sollte nicht aufgerufen werden');
    });
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true });

    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(false);

    Object.defineProperty(window, 'matchMedia', { value: original, configurable: true });
  });

  it('useIsDesktop nutzt die Desktop-Breakpoint-Query (Tailwind md)', () => {
    let seenQuery = '';
    const { mql } = createMql(true);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      seenQuery = query;
      return mql;
    });

    const { result } = renderHook(() => useIsDesktop());
    expect(seenQuery).toBe('(min-width: 768px)');
    expect(result.current).toBe(true);
  });
});
