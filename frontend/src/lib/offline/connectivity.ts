/**
 * Konnektivitäts-Signal als schlanker Modul-Emitter (kein React).
 *
 * `navigator.onLine` allein ist unzuverlässig: Ein Handy mit LTE meldet
 * "online", obwohl der (nur im Heimnetz erreichbare) Server nicht antwortet.
 * Deshalb speist `lib/api.ts` hier den Ausgang ECHTER Requests ein:
 * jede erhaltene Response (auch 4xx/5xx) → `reportOnline()`, jeder
 * Netzfehler → `reportOffline()`. Browser-Events (`online`/`offline`)
 * werden vom OnlineStatusProvider zusätzlich durchgereicht.
 */

type ConnectivityListener = (isOnline: boolean) => void;

let onlineState = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<ConnectivityListener>();

function setOnlineState(next: boolean): void {
  if (next === onlineState) {
    return;
  }
  onlineState = next;
  for (const listener of listeners) {
    listener(next);
  }
}

/** Ein Request hat den Server erreicht (Response erhalten, egal welcher Status). */
export function reportOnline(): void {
  setOnlineState(true);
}

/** Ein Request ist am Netz gescheitert (fetch-Rejection, kein HTTP-Status). */
export function reportOffline(): void {
  setOnlineState(false);
}

/** Aktueller (best-effort) Online-Zustand. */
export function getIsOnline(): boolean {
  return onlineState;
}

/**
 * Auf Zustandswechsel hören; feuert nur bei ECHTEN Wechseln (kein Re-Fire
 * bei wiederholtem gleichem Report). Rückgabe: unsubscribe.
 */
export function subscribeConnectivity(listener: ConnectivityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
