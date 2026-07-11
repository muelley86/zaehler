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
 * — auf iOS-PWAs feuert `online` oft nicht), manueller Button. Zusätzlich
 * plant der `syncScheduler` nach Netzfehlern automatische Retries mit
 * Backoff (30 s → 5 min) — als Probe auch dann, wenn kein online-Event
 * kommt. Nach jedem erfolgreich durchgelaufenen Sync wird der
 * Stammdaten-Snapshot erneuert.
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
import {
  refreshMasterDataSnapshot,
  refreshMasterDataSnapshotIfStale,
} from '@/lib/offline/masterData';
import { openSummary, subscribeOutbox } from '@/lib/offline/outbox';
import { getSyncPhase, runSync, subscribeSyncState } from '@/lib/offline/syncEngine';
import type { SyncPhase } from '@/lib/offline/syncEngine';
import { createSyncScheduler } from '@/lib/offline/syncScheduler';
import type { SyncScheduler } from '@/lib/offline/syncScheduler';
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
  const [oldestPendingAt, setOldestPendingAt] = useState<string | null>(null);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>(() => getSyncPhase());
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const schedulerRef = useRef<SyncScheduler | null>(null);

  const doSync = useCallback(async () => {
    const id = userIdRef.current;
    if (id === null) return;
    const result = await runSync(id);
    if (result.stopped === 'done') {
      setLastSyncAt(new Date());
      // Serverkontakt war da — Stammdaten-Kopie im Hintergrund erneuern.
      void refreshMasterDataSnapshot(id);
    }
    // Nach dem await kann inzwischen ein ANDERER User angemeldet sein —
    // dessen Scheduler darf das veraltete Ergebnis nicht sehen.
    if (userIdRef.current === id) schedulerRef.current?.onRunFinished(result);
  }, []);

  // Retry-Scheduler: lebt solange ein User angemeldet ist.
  useEffect(() => {
    if (userId === null) return;
    const scheduler = createSyncScheduler(() => void doSync());
    schedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [userId, doSync]);

  // Konnektivitäts-Signal + Browser-Events.
  useEffect(() => {
    const unsubscribe = subscribeConnectivity(setIsOnline);
    const handleOnline = () => {
      reportOnline();
      schedulerRef.current?.resetBackoff();
      void doSync();
    };
    const handleOffline = () => reportOffline();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        schedulerRef.current?.resetBackoff();
        void doSync();
      }
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

  // Badge-Zähler + Alter: bei jeder Outbox-Mutation neu ermitteln.
  useEffect(() => {
    if (userId === null) {
      setPendingCount(0);
      setOldestPendingAt(null);
      return;
    }
    let cancelled = false;
    const update = () => {
      void openSummary(userId)
        .then((summary) => {
          if (cancelled) return;
          setPendingCount(summary.count);
          setOldestPendingAt(summary.oldestCreatedAt);
          // Nur retry-fähige Items armen den Probe-Timer — reine
          // Konflikt-Queues warten auf den Nutzer, nicht auf das Netz.
          schedulerRef.current?.ensureScheduled(summary.retryableCount);
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
    // Wer lange nur online arbeitet (leere Queue), bekäme sonst nie einen
    // frischen Stammdaten-Snapshot — der Nach-Sync-Refresh feuert dann nicht.
    void refreshMasterDataSnapshotIfStale(userId);
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
    () => ({ isOnline, pendingCount, oldestPendingAt, syncPhase, lastSyncAt, runSyncNow }),
    [isOnline, pendingCount, oldestPendingAt, syncPhase, lastSyncAt, runSyncNow],
  );
  return <OnlineStatusContext.Provider value={value}>{children}</OnlineStatusContext.Provider>;
}
