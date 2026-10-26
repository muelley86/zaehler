/**
 * useLatestRef — Ref, der immer den zuletzt gerenderten Wert hält.
 *
 * Für Callbacks/Effekte, die den AKTUELLEN Wert lesen sollen, ohne den Wert
 * als Dependency zu führen (stabile Identität, kein Effekt-Neustart). Der Ref
 * wird nach dem Commit im Layout-Effekt aktualisiert statt während des
 * Renderns — Schreiben in ``ref.current`` im Render ist in React unzulässig
 * (Concurrent Rendering kann Renders verwerfen). Layout-Effekte laufen vor
 * allen passiven Effekten und Event-Handlern; die sehen also stets den neuen
 * Wert. Nur im Render selbst darf der Ref nicht gelesen werden — und nicht in
 * Layout-Effekten von Kindern (die laufen vor dem Layout-Effekt hier).
 */

import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
