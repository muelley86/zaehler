/**
 * Reaktiver Media-Query-Hook auf Basis von ``useSyncExternalStore`` — liest
 * ``window.matchMedia(query).matches`` und aktualisiert bei jedem
 * ``change``-Event der MediaQueryList. Fehlt ``window.matchMedia`` (z. B.
 * in einer Testumgebung ohne Mock), liefert der Hook konsequent ``false``
 * statt zu werfen.
 *
 * Basis für {@link useIsDesktop}, das später zwischen dem Sidebar-Layout
 * (Desktop) und dem Bottom-Sheet-Layout (Mobile) umschaltet.
 */

import { useCallback, useSyncExternalStore } from 'react';

/** Tailwind-Breakpoint ``md`` — ab hier gilt die Desktop-Ansicht. */
export const DESKTOP_QUERY = '(min-width: 768px)';

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function getSnapshotFor(query: string): boolean {
  if (!hasMatchMedia()) return false;
  return window.matchMedia(query).matches;
}

function subscribeTo(query: string, onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const mql = window.matchMedia(query);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Liefert ``true``, solange ``query`` aktuell matcht — reaktiv über Renders hinweg. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => subscribeTo(query, onChange), [query]);
  const getSnapshot = useCallback(() => getSnapshotFor(query), [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** ``true`` ab dem Tailwind-Breakpoint ``md`` (Desktop-Layout). */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
