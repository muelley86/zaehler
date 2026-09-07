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
import { clearDashboardCache } from '@/features/dashboard/useDashboardData';
import { clearAll as clearOfflineData } from '@/lib/offline/outbox';
import type { LoginResponse, Me } from '@/lib/types';
import { AuthContext } from './auth-context';
import type { AuthState, LoginResult } from './auth-context';
import { clearMeSnapshot, loadMeSnapshot, saveMeSnapshot } from './meSnapshot';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<Me>('/auth/me');
      setMe(data);
      saveMeSnapshot(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Server sagt explizit "nicht angemeldet" — Snapshot ist damit
        // ungültig und darf keinen Offline-Kaltstart mehr ermöglichen.
        setMe(null);
        clearMeSnapshot();
        // Dashboard-Cache mitpurgen — sonst kann ein späterer Login als
        // anderer User (MP-Zugriffsfilter!) im ersten Frame noch die
        // Aggregate des vorherigen Users sehen (siehe `logout` unten).
        clearDashboardCache();
      } else if (err instanceof NetworkError) {
        // Server nicht erreichbar (unterwegs, Server nur im Heimnetz):
        // letzten bekannten User wiederherstellen, damit die App mit
        // gecachten Daten rendert statt auf "Lade…" zu hängen. Ohne
        // Snapshot bleibt es bei der Login-Seite.
        setMe(loadMeSnapshot());
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const data = await api.post<LoginResponse>('/auth/login', { username, password });
    if (data.requires_2fa && data.challenge_token) {
      return { kind: 'totp', challengeToken: data.challenge_token };
    }
    if (data.me) {
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
    setMe(data);
    saveMeSnapshot(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setMe(null);
      // Offline-Snapshot mit entfernen — nach explizitem Logout darf kein
      // Offline-Kaltstart mehr in den Account des vorherigen Users führen.
      clearMeSnapshot();
      // Modul-weiter Dashboard-Cache mitpurgen: er überlebt sonst einen
      // User-Wechsel im selben Tab — der nächste Login (z. B. ein
      // MP-Zugriffsgefilterter Recorder) würde im ersten Frame sonst
      // synchron die Aggregate des vorherigen Users sehen.
      clearDashboardCache();
      // Offline-Queue + Stammdaten-Snapshot ebenfalls purgen (die UI hat
      // bei offenen Einträgen vorher einen Confirm gezeigt).
      try {
        await clearOfflineData();
      } catch {
        /* IndexedDB fehlt (Test/alte Umgebung) — egal. */
      }
      // SW-Cache leeren — sonst serviert der NetworkFirst-Cache
      // beim nächsten Login auf demselben Gerät noch alte API-Antworten
      // des vorherigen Users (Same-Origin, gleiches Cookie-Bucket).
      if (typeof caches !== 'undefined') {
        try {
          await caches.delete('api-get');
        } catch {
          /* Cache-API fehlt (Test/SSR/HTTP) — egal. */
        }
      }
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ me, loading, login, verifyTotp, logout, refresh }),
    [me, loading, login, verifyTotp, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
