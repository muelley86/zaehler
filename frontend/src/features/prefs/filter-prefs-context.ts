/**
 * FilterPrefs-Context — haelt zwei Dinge:
 *  - `rememberFilters`: die persoenliche Ein/Aus-Einstellung „Filter merken"
 *    (dauerhaft in localStorage).
 *  - `sharedRange`: den seitenuebergreifend geteilten Datumsbereich
 *    (nur diese Browser-Session, in sessionStorage). `null` = „noch nicht
 *    gesetzt" → jede Seite nutzt ihren eigenen Default.
 *
 * Hook + Context-Definition liegen — analog zu `auth-context.ts` — getrennt vom
 * Provider-Component, damit Vites Fast-Refresh nicht durch zusaetzliche
 * Nicht-Component-Exports gestoert wird.
 */

import { createContext, useContext } from 'react';

export type SharedDateRange = { from: string; to: string } | null;

export interface FilterPrefsState {
  rememberFilters: boolean;
  setRememberFilters: (on: boolean) => void;
  sharedRange: SharedDateRange;
  setSharedRange: (next: SharedDateRange) => void;
  clearSharedRange: () => void;
}

export const FilterPrefsContext = createContext<FilterPrefsState | null>(null);

export function useFilterPrefs(): FilterPrefsState {
  const ctx = useContext(FilterPrefsContext);
  if (!ctx) {
    throw new Error('useFilterPrefs must be used within FilterPrefsProvider');
  }
  return ctx;
}
