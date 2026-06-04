/**
 * FilterPrefs-Context:
 *  - `dateRange`: der globale Datumsbereich. **Immer vorhanden** (nie null),
 *    seitenübergreifend (Dashboard, Erfassungen, Auswertungen via Option) und
 *    sitzungspersistent (sessionStorage) — unabhängig von „Filter merken".
 *  - `rememberFilters`: die persoenliche Ein/Aus-Einstellung „Filter merken",
 *    die nur noch die ÜBRIGEN (Nicht-Datums-)Filter steuert (localStorage).
 *
 * Hook + Context-Definition liegen — analog zu `auth-context.ts` — getrennt vom
 * Provider-Component, damit Vites Fast-Refresh nicht gestört wird.
 */

import { createContext, useContext } from 'react';

import type { DateRange } from '@/lib/dateRange';

export interface FilterPrefsState {
  rememberFilters: boolean;
  setRememberFilters: (on: boolean) => void;
  dateRange: DateRange;
  setDateRange: (next: DateRange) => void;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  /** Verschiebt den Datumsbereich um `delta` ganze Jahre (−1 = Vorjahr). */
  stepYear: (delta: number) => void;
  /** Setzt den Datumsbereich auf den Standard (laufendes Kalenderjahr). */
  resetDateRange: () => void;
}

export const FilterPrefsContext = createContext<FilterPrefsState | null>(null);

export function useFilterPrefs(): FilterPrefsState {
  const ctx = useContext(FilterPrefsContext);
  if (!ctx) {
    throw new Error('useFilterPrefs must be used within FilterPrefsProvider');
  }
  return ctx;
}
