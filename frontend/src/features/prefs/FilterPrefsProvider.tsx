/**
 * FilterPrefsProvider — fuellt den FilterPrefsContext. Mountet an der App-Wurzel
 * (oberhalb des Route-Trees), damit der geteilte Datumsbereich Routenwechsel
 * (Dashboard ⇄ Erfassungen) ueberlebt.
 *
 * Speicher-Schluessel:
 *  - `filters.remember`        (localStorage)   — dauerhafte Ein/Aus-Praeferenz
 *  - `filters.shared.dateRange`(sessionStorage) — geteilter Datumsbereich
 *  - `filters.*`               (sessionStorage) — alle per-Seite gemerkten Filter
 *
 * Ausschalten = Reset: loescht jeden `filters.*`-Session-Key und nullt den
 * geteilten Datumsbereich.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { FilterPrefsContext } from './filter-prefs-context';
import type { FilterPrefsState, SharedDateRange } from './filter-prefs-context';

const REMEMBER_KEY = 'filters.remember';
const SHARED_RANGE_KEY = 'filters.shared.dateRange';
const SESSION_PREFIX = 'filters.';

function loadRemember(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === '1';
  } catch {
    return false;
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function loadSharedRange(enabled: boolean): SharedDateRange {
  if (!enabled) return null;
  try {
    const raw = window.sessionStorage.getItem(SHARED_RANGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed.from === 'string' && typeof parsed.to === 'string') {
      return { from: parsed.from, to: parsed.to };
    }
    return null;
  } catch {
    return null;
  }
}

function clearAllSessionFilterKeys(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k !== null && k.startsWith(SESSION_PREFIX)) doomed.push(k);
    }
    for (const k of doomed) window.sessionStorage.removeItem(k);
  } catch {
    /* non-fatal */
  }
}

export function FilterPrefsProvider({ children }: { children: ReactNode }) {
  const [rememberFilters, setRemember] = useState<boolean>(() => loadRemember());
  const [sharedRange, setRange] = useState<SharedDateRange>(() => loadSharedRange(loadRemember()));

  // Persistenz des geteilten Datumsbereichs — nur wenn aktiviert. Das Entfernen
  // beim Ausschalten erledigt `clearAllSessionFilterKeys` (Praefix-Match).
  useEffect(() => {
    if (!rememberFilters) return;
    try {
      if (sharedRange === null) window.sessionStorage.removeItem(SHARED_RANGE_KEY);
      else window.sessionStorage.setItem(SHARED_RANGE_KEY, JSON.stringify(sharedRange));
    } catch {
      /* non-fatal */
    }
  }, [rememberFilters, sharedRange]);

  const setRememberFilters = useCallback((on: boolean) => {
    try {
      window.localStorage.setItem(REMEMBER_KEY, on ? '1' : '0');
    } catch {
      /* non-fatal */
    }
    if (!on) {
      clearAllSessionFilterKeys();
      setRange(null);
    }
    setRemember(on);
  }, []);

  const setSharedRange = useCallback((next: SharedDateRange) => setRange(next), []);
  const clearSharedRange = useCallback(() => setRange(null), []);

  const value = useMemo<FilterPrefsState>(
    () => ({ rememberFilters, setRememberFilters, sharedRange, setSharedRange, clearSharedRange }),
    [rememberFilters, setRememberFilters, sharedRange, setSharedRange, clearSharedRange],
  );

  return <FilterPrefsContext.Provider value={value}>{children}</FilterPrefsContext.Provider>;
}
