/**
 * useStickyState — wie `useState`, aber spiegelt den Wert (nur wenn `enabled`)
 * nach `sessionStorage`. Ist `enabled` false, verhaelt sich der Hook exakt wie
 * ein normales `useState` (kein Lesen, kein Schreiben) — so bleibt das Verhalten
 * bei deaktivierter „Filter merken"-Option byte-genau das bisherige.
 *
 * Persistenz-Idiom wie anderswo im Frontend (vgl. `loadExpandedSet`): jeder
 * Storage-Zugriff in try/catch, kaputtes/fehlendes JSON faellt auf den Default
 * zurueck statt zu werfen.
 */

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export interface StickyCodec<T> {
  serialize: (value: T) => string;
  /** Muss bei ungueltiger Eingabe werfen oder einen Fallback liefern. */
  deserialize: (raw: string) => T;
}

export function useStickyState<T>(
  key: string,
  defaultValue: T,
  enabled: boolean,
  codec: StickyCodec<T>,
): [T, Dispatch<SetStateAction<T>>] {
  // „Latest ref" — so haengt der Schreib-Effekt nicht an der (oft pro Render
  // neu erzeugten) Codec-Referenz und schreibt nicht bei jedem Render.
  const codecRef = useRef(codec);
  codecRef.current = codec;

  const [value, setValue] = useState<T>(() => {
    if (!enabled) return defaultValue;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) return defaultValue;
      return codec.deserialize(raw);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (!enabled) return;
    try {
      window.sessionStorage.setItem(key, codecRef.current.serialize(value));
    } catch {
      /* QuotaExceeded / SecurityError ignorieren — non-fatal UX-State */
    }
  }, [enabled, key, value]);

  return [value, setValue];
}

/**
 * Codec fuer `Set<T>` (T = string | number | null). Serialisiert als JSON-Array
 * (`null`-Member bleiben erhalten), liest mit Member-Guard zurueck und verwirft
 * fremde Eintraege.
 */
export function setCodec<T extends string | number | null>(
  isMember: (x: unknown) => x is T,
): StickyCodec<Set<T>> {
  return {
    serialize: (s) => JSON.stringify([...s]),
    deserialize: (raw) => {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<T>();
      const arr: unknown[] = parsed;
      return new Set<T>(arr.filter(isMember));
    },
  };
}

export const stringCodec: StickyCodec<string> = {
  serialize: (s) => s,
  deserialize: (raw) => raw,
};
