/**
 * useObjectUrl — ``blob:``-Vorschau-URL für eine lokale Datei (Foto-Picker).
 *
 * Object-URLs sind eine externe Ressource: anlegen beim Abonnieren, wieder
 * freigeben (``revokeObjectURL``), sobald niemand sie mehr anzeigt. Darum
 * ``useSyncExternalStore`` statt ``setState`` im Effekt — die Registry zählt
 * die Nutzer je Blob, das StrictMode-Doppel-Mount (subscribe → unsubscribe →
 * subscribe) erzeugt dabei sauber eine frische URL statt eine freigegebene
 * weiterzuverwenden. Vor dem ersten Abonnieren ist der Wert ``null``.
 */

import { useCallback, useSyncExternalStore } from 'react';

interface Entry {
  url: string;
  users: number;
}

const registry = new Map<Blob, Entry>();

export function useObjectUrl(blob: Blob): string | null {
  const subscribe = useCallback(() => {
    let entry = registry.get(blob);
    if (!entry) {
      entry = { url: URL.createObjectURL(blob), users: 0 };
      registry.set(blob, entry);
    }
    entry.users += 1;
    return () => {
      const current = registry.get(blob);
      if (!current) return;
      current.users -= 1;
      if (current.users === 0) {
        registry.delete(blob);
        URL.revokeObjectURL(current.url);
      }
    };
  }, [blob]);
  const getSnapshot = useCallback(() => registry.get(blob)?.url ?? null, [blob]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
