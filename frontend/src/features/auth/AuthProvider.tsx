/**
 * AuthProvider — füllt den AuthContext bei React-Mount mit dem
 * aktuell angemeldeten User (`/auth/me`-Roundtrip) und stellt
 * login/verifyTotp/logout/refresh bereit.
 *
 * Hook + Context-Definition liegen in `auth-context.ts`, damit Vites
 * Fast-Refresh nicht durch zusätzliche Nicht-Component-Exports
 * gestört wird.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError, NetworkError, api } from '@/lib/api';
import { subscribeUnauthorized } from '@/lib/authEvents';
import { clearDashboardCache } from '@/features/dashboard/useDashboardData';
import { clearAll as clearOfflineData } from '@/lib/offline/outbox';
import type { LoginResponse, Me } from '@/lib/types';
import { AuthContext } from './auth-context';
import type { AuthState, LoginResult } from './auth-context';
import { clearMeSnapshot, loadMeSnapshot, saveMeSnapshot } from './meSnapshot';

/**
 * Leert die Caches, die API-Antworten eines Users über einen User-Wechsel
 * hinweg halten können: den modul-weiten Dashboard-Cache und den
 * NetworkFirst-Cache `api-get` des Service-Workers (Same-Origin, gleiches
 * Cookie-Bucket — ohne Purge sähe ein Folge-User offline oder bei langsamem
 * Server die Antworten des Vorgängers, inkl. nicht zugeordneter Messstellen).
 */
async function purgeUserCaches(): Promise<void> {
  clearDashboardCache();
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete('api-get');
  } catch {
    /* Cache-API fehlt (Test/SSR/HTTP) — egal. */
  }
}

/** Neuer User ≠ zuletzt bekannter User → Caches des Vorgängers verwerfen. */
function purgeIfUserChanged(next: Me): void {
  if (loadMeSnapshot()?.id !== next.id) void purgeUserCaches();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Als Promise-Kette statt try/await: der Initial-Aufruf aus dem Effekt setzt
  // State so nachweislich erst im Callback (react-hooks/set-state-in-effect).
  const refresh = useCallback(
    (): Promise<void> =>
      api
        .get<Me>('/auth/me')
        .then(
          (data) => {
            setMe(data);
            saveMeSnapshot(data);
          },
          (err: unknown) => {
            if (err instanceof ApiError && err.status === 401) {
              // Server sagt explizit "nicht angemeldet" — Snapshot ist damit
              // ungültig und darf keinen Offline-Kaltstart mehr ermöglichen.
              setMe(null);
              clearMeSnapshot();
              // Caches mitpurgen — sonst kann ein späterer Login als anderer
              // User (MP-Zugriffsfilter!) noch Antworten des vorherigen Users
              // sehen (Dashboard im ersten Frame, SW-Cache offline).
              void purgeUserCaches();
            } else if (err instanceof NetworkError) {
              // Server nicht erreichbar (unterwegs, Server nur im Heimnetz):
              // letzten bekannten User wiederherstellen, damit die App mit
              // gecachten Daten rendert statt auf "Lade…" zu hängen. Ohne
              // Snapshot bleibt es bei der Login-Seite.
              setMe(loadMeSnapshot());
            } else {
              throw err;
            }
          },
        )
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Lehnt der Server eine beliebige Anfrage mit 401 ab, ist die Sitzung weg
  // (abgelaufen, Server neu aufgesetzt). Neu prüfen statt weiter angemeldet
  // auszusehen — der 401-Zweig von `refresh` führt dann zur Anmeldung.
  useEffect(
    () =>
      subscribeUnauthorized(() => {
        void refresh();
      }),
    [refresh],
  );

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const data = await api.post<LoginResponse>('/auth/login', { username, password });
    if (data.requires_2fa && data.challenge_token) {
      return { kind: 'totp', challengeToken: data.challenge_token };
    }
    if (data.me) {
      purgeIfUserChanged(data.me);
      setMe(data.me);
      saveMeSnapshot(data.me);
      return { kind: 'ok', me: data.me };
    }
    throw new Error('Login-Antwort ohne me oder challenge_token');
  }, []);

  const verifyTotp = useCallback(async (challengeToken: string, code: string) => {
    const data = await api.post<Me>('/auth/2fa/verify', {
      challenge_token: challengeToken,
      code,
    });
    purgeIfUserChanged(data);
    setMe(data);
    saveMeSnapshot(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // 401: Server-Session ist ohnehin ungültig → lokal aufräumen ist korrekt.
      // Jeder andere Fehler (Netz, 5xx): Die Session ist NICHT widerrufen und
      // das httpOnly-Cookie bleibt gültig — ein lokaler "Erfolg" würde den
      // User täuschen (nächster App-Start wäre wieder angemeldet). Also
      // Fehler an die UI durchreichen und nichts verwerfen.
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
    setMe(null);
    // Offline-Snapshot mit entfernen — nach explizitem Logout darf kein
    // Offline-Kaltstart mehr in den Account des vorherigen Users führen.
    clearMeSnapshot();
    // Offline-Queue + Stammdaten-Snapshot ebenfalls purgen (die UI hat
    // bei offenen Einträgen vorher einen Confirm gezeigt).
    try {
      await clearOfflineData();
    } catch {
      /* IndexedDB fehlt (Test/alte Umgebung) — egal. */
    }
    await purgeUserCaches();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ me, loading, login, verifyTotp, logout, refresh }),
    [me, loading, login, verifyTotp, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
