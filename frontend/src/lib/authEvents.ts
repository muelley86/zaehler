/**
 * Signal "Sitzung verloren" als schlanker Modul-Emitter (kein React), analog zu
 * `offline/connectivity.ts`.
 *
 * `lib/api.ts` meldet hier jede 401-Antwort außerhalb der Auth-Endpunkte. Der
 * AuthProvider prüft daraufhin `/auth/me` neu und zeigt die Anmeldung, statt
 * dass die Oberfläche weiter angemeldet aussieht, während der Server jede
 * Anfrage ablehnt (Sitzung abgelaufen, Server neu aufgesetzt).
 */

type UnauthorizedListener = () => void;

const listeners = new Set<UnauthorizedListener>();

/** Eine Anfrage wurde mit 401 abgelehnt — die Sitzung gilt serverseitig nicht (mehr). */
export function reportUnauthorized(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Auf verlorene Sitzungen hören. Rückgabe: unsubscribe. */
export function subscribeUnauthorized(listener: UnauthorizedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
