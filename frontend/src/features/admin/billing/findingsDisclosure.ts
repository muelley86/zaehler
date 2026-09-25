/**
 * Klappzustand der Prüfabschnitte: offen bei Befund oder Fehler, sonst zu — bis der User selbst
 * klappt, dann gilt seine Wahl.
 */
import { useState } from 'react';

/** `null` = noch kein Ergebnis (lädt). */
export type FindingsState = { error: true } | { error: false; findings: number } | null;

export function useFindingsDisclosure(state: FindingsState) {
  const [manual, setManual] = useState<boolean | null>(null);
  const auto = state !== null && (state.error || state.findings > 0);
  const open = manual ?? auto;
  return { open, toggle: () => setManual(!open) };
}
