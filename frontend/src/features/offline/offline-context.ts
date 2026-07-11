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

export interface OnlineStatusState {
  /** Best-effort: navigator.onLine + Ausgang echter API-Requests. */
  isOnline: boolean;
}

export const OnlineStatusContext = createContext<OnlineStatusState>({ isOnline: true });

export function useOnlineStatus(): OnlineStatusState {
  return useContext(OnlineStatusContext);
}
