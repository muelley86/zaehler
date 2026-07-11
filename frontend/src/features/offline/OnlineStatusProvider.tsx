/**
 * Stellt Online-Status + Offline-Warteschlangen-Zustand app-weit bereit
 * und triggert die Synchronisierung.
 *
 * Online-Signal (kombiniert, weil keines allein reicht):
 * - `lib/offline/connectivity.ts`: Ausgang ECHTER API-Requests — fängt den
 *   Kernfall "Handy hat LTE, aber der Server ist nur im Heimnetz erreichbar".
 * - Browser-Events `online`/`offline`: `offline` ist verlässlich (Flugmodus),
 *   `online` nur optimistisch — der nächste echte Request korrigiert ggf.
 *
 * Sync-Trigger (eventbasiert, iOS hat kein Background-Sync-API):
 * App-Start/Login, `online`-Event, App-in-den-Vordergrund (`visibilitychange`
 * — auf iOS-PWAs feuert `online` oft nicht), manueller Button. Nach jedem
 * erfolgreich durchgelaufenen Sync wird der Stammdaten-Snapshot erneuert.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { AuthContext } from '@/features/auth/auth-context';
import {
  getIsOnline,
  reportOffline,
  reportOnline,
  subscribeConnectivity,
} from '@/lib/offline/connectivity';
import { refreshMasterDataSnapshot } from '@/lib/offline/masterData';
import { countOpen, subscribeOutbox } from '@/lib/offline/outbox';
import { getSyncPhase, runSync, subscribeSyncState } from '@/lib/offline/syncEngine';
import type { SyncPhase } from '@/lib/offline/syncEngine';
import { OnlineStatusContext } from './offline-context';
import type { OnlineStatusState } from './offline-context';

export function OnlineStatusProvider({ children }: { children: ReactNode }) {
  // useContext statt useAuth: der Provider soll auch OHNE AuthProvider
  // funktionieren (Tests, stille Degradation) — dann gibt es keinen User
  // und damit weder Queue noch Sync.
  const auth = useContext(AuthContext);
  const userId = auth?.me?.id ?? null;

  const [isOnline, setIsOnline] = useState(() => getIsOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>(() => getSyncPhase());
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const doSync = useCallback(async () => {
    const id = userIdRef.current;
    if (id === null) return;
    const result = await runSync(id);
    if (result.stopped === 'done') {
      setLastSyncAt(new Date());
      // Serverkontakt war da — Stammdaten-Kopie im Hintergrund erneuern.
      void refreshMasterDataSnapshot(id);
    }
  }, []);

  // Konnektivitäts-Signal + Browser-Events.
  useEffect(() => {
    const unsubscribe = subscribeConnectivity(setIsOnline);
    const handleOnline = () => {
      reportOnline();
      void doSync();
    };
    const handleOffline = () => reportOffline();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void doSync();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    // Zustand könnte sich zwischen Initial-Render und Effect geändert haben.
    setIsOnline(getIsOnline());
    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [doSync]);

  // Sync-Phase spiegeln.
  useEffect(() => subscribeSyncState(setSyncPhase), []);

  // Badge-Zähler: bei jeder Outbox-Mutation neu zählen.
  useEffect(() => {
    if (userId === null) {
      setPendingCount(0);
      return;
    }
    let cancelled = false;
    const update = () => {
      void countOpen(userId)
        .then((count) => {
          if (!cancelled) setPendingCount(count);
        })
        .catch(() => {
          /* IndexedDB nicht verfügbar — Badge bleibt 0. */
        });
    };
    update();
    const unsubscribe = subscribeOutbox(update);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  // App-Start bzw. Login: Sync anstoßen + Storage-Persistenz best-effort.
  useEffect(() => {
    if (userId === null) return;
    void doSync();
    try {
      void navigator.storage?.persist?.().catch(() => undefined);
    } catch {
      /* Storage-API fehlt — egal. */
    }
  }, [userId, doSync]);

  const runSyncNow = useCallback(() => {
    void doSync();
  }, [doSync]);

  const value = useMemo<OnlineStatusState>(
    () => ({ isOnline, pendingCount, syncPhase, lastSyncAt, runSyncNow }),
    [isOnline, pendingCount, syncPhase, lastSyncAt, runSyncNow],
  );
  return <OnlineStatusContext.Provider value={value}>{children}</OnlineStatusContext.Provider>;
}
