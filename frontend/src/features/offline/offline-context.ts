/**
 * Online-Status-Context + Hook (Muster wie `auth-context.ts`: Definition
 * getrennt vom Provider, damit Fast-Refresh sauber bleibt).
 *
 * Bewusst MIT Default-Wert statt Throw: Der Status ist ein rein
 * präsentationales Signal — Komponenten ohne Provider (ältere Tests,
 * Storybook o. ä.) verhalten sich einfach wie "online", exakt das
 * bisherige Verhalten. Vergessener Provider ⇒ stille Degradation,
 * kein Crash.
 */

import { createContext, useContext } from 'react';

import type { SyncPhase } from '@/lib/offline/syncEngine';

export interface OnlineStatusState {
  /** Best-effort: navigator.onLine + Ausgang echter API-Requests. */
  isOnline: boolean;
  /** Offene Einträge in der Offline-Warteschlange (eigener User). */
  pendingCount: number;
  syncPhase: SyncPhase;
  lastSyncAt: Date | null;
  /** Sync manuell anstoßen (no-op ohne Provider/angemeldeten User). */
  runSyncNow: () => void;
}

export const OnlineStatusContext = createContext<OnlineStatusState>({
  isOnline: true,
  pendingCount: 0,
  syncPhase: 'idle',
  lastSyncAt: null,
  runSyncNow: () => {
    /* ohne Provider bewusst no-op */
  },
});

export function useOnlineStatus(): OnlineStatusState {
  return useContext(OnlineStatusContext);
}
