/**
 * useSharedDateRange — kapselt den seitenuebergreifend geteilten Datumsbereich
 * fuer eine konkrete Seite (Dashboard, Erfassungen). Verbirgt das
 * on/off-Branching:
 *
 *  - Option AUS  → lokaler State, initial = `pageDefault` (bisheriges Verhalten).
 *  - Option AN   → „null-until-set": solange kein geteilter Bereich gesetzt ist,
 *                  zeigt die Seite ihren eigenen `pageDefault`; die erste
 *                  Datumseingabe seedet den geteilten Bereich (das jeweils andere
 *                  Feld kommt aus dem aktuell effektiven Wert) und gilt ab dann
 *                  auf allen teilnehmenden Seiten.
 *
 * `reset()` raeumt den geteilten Bereich und setzt den lokalen Fallback auf den
 * Seiten-Default zurueck.
 */

import { useState } from 'react';

import { useFilterPrefs } from './filter-prefs-context';

export interface SharedDateRangeApi {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  reset: () => void;
}

export function useSharedDateRange(pageDefault: { from: string; to: string }): SharedDateRangeApi {
  const { rememberFilters, sharedRange, setSharedRange, clearSharedRange } = useFilterPrefs();
  const [localFrom, setLocalFrom] = useState(pageDefault.from);
  const [localTo, setLocalTo] = useState(pageDefault.to);

  // Inline-Null-Check statt Boolean-Variable, damit TS `sharedRange` narrowen kann.
  const from = rememberFilters && sharedRange !== null ? sharedRange.from : localFrom;
  const to = rememberFilters && sharedRange !== null ? sharedRange.to : localTo;

  function setFrom(v: string) {
    if (rememberFilters) setSharedRange({ from: v, to });
    else setLocalFrom(v);
  }
  function setTo(v: string) {
    if (rememberFilters) setSharedRange({ from, to: v });
    else setLocalTo(v);
  }
  function reset() {
    clearSharedRange();
    setLocalFrom(pageDefault.from);
    setLocalTo(pageDefault.to);
  }

  return { from, to, setFrom, setTo, reset };
}
