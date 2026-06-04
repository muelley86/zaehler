/**
 * FilterPrefsProvider — fuellt den FilterPrefsContext. Mountet an der App-Wurzel
 * (oberhalb des Route-Trees), damit der globale Datumsbereich Routenwechsel
 * überlebt.
 *
 * Speicher-Schluessel:
 *  - `app.dateRange` (sessionStorage)  — globaler Datumsbereich, IMMER persistiert
 *    (außerhalb des `filters.`-Präfix, s.u.).
 *  - `filters.remember` (localStorage) — dauerhafte Ein/Aus-Praeferenz „Filter merken".
 *  - `filters.*` (sessionStorage)      — die per-Seite gemerkten Nicht-Datums-Filter.
 *
 * „Filter merken → aus" loescht jeden `filters.*`-Session-Key — der Datumsbereich
 * (`app.dateRange`) liegt bewusst außerhalb dieses Präfix und bleibt erhalten.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { currentYearRange, shiftRangeByYears } from '@/lib/dateRange';
import type { DateRange } from '@/lib/dateRange';
import { FilterPrefsContext } from './filter-prefs-context';
import type { FilterPrefsState } from './filter-prefs-context';

const REMEMBER_KEY = 'filters.remember';
const DATE_RANGE_KEY = 'app.dateRange';
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

function loadDateRange(): DateRange {
  try {
    const raw = window.sessionStorage.getItem(DATE_RANGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed) && typeof parsed.from === 'string' && typeof parsed.to === 'string') {
        return { from: parsed.from, to: parsed.to };
      }
    }
  } catch {
    /* ignore */
  }
  return currentYearRange(new Date());
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
  const [dateRange, setRange] = useState<DateRange>(() => loadDateRange());

  // Globaler Datumsbereich — IMMER persistiert (kein „Filter merken"-Gate).
  useEffect(() => {
    try {
      window.sessionStorage.setItem(DATE_RANGE_KEY, JSON.stringify(dateRange));
    } catch {
      /* non-fatal */
    }
  }, [dateRange]);

  const setRememberFilters = useCallback((on: boolean) => {
    try {
      window.localStorage.setItem(REMEMBER_KEY, on ? '1' : '0');
    } catch {
      /* non-fatal */
    }
    // Aus = Reset der ÜBRIGEN Filter; der Datumsbereich bleibt unangetastet.
    if (!on) clearAllSessionFilterKeys();
    setRemember(on);
  }, []);

  const setDateRange = useCallback((next: DateRange) => setRange(next), []);
  const setFrom = useCallback((v: string) => setRange((r) => ({ ...r, from: v })), []);
  const setTo = useCallback((v: string) => setRange((r) => ({ ...r, to: v })), []);
  const stepYear = useCallback((delta: number) => setRange((r) => shiftRangeByYears(r, delta)), []);
  const resetDateRange = useCallback(() => setRange(currentYearRange(new Date())), []);

  const value = useMemo<FilterPrefsState>(
    () => ({
      rememberFilters,
      setRememberFilters,
      dateRange,
      setDateRange,
      setFrom,
      setTo,
      stepYear,
      resetDateRange,
    }),
    [
      rememberFilters,
      setRememberFilters,
      dateRange,
      setDateRange,
      setFrom,
      setTo,
      stepYear,
      resetDateRange,
    ],
  );

  return <FilterPrefsContext.Provider value={value}>{children}</FilterPrefsContext.Provider>;
}
