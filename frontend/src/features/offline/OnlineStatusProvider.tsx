/**
 * Stellt den Online-Status app-weit bereit.
 *
 * Signale (kombiniert, weil keines allein reicht):
 * - `lib/offline/connectivity.ts`: Ausgang ECHTER API-Requests — fängt den
 *   Kernfall "Handy hat LTE, aber der Server ist nur im Heimnetz erreichbar".
 * - Browser-Events `online`/`offline`: `offline` ist verlässlich (Flugmodus),
 *   `online` nur optimistisch — der nächste echte Request korrigiert ggf.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  getIsOnline,
  reportOffline,
  reportOnline,
  subscribeConnectivity,
} from '@/lib/offline/connectivity';
import { OnlineStatusContext } from './offline-context';
import type { OnlineStatusState } from './offline-context';

export function OnlineStatusProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(() => getIsOnline());

  useEffect(() => {
    const unsubscribe = subscribeConnectivity(setIsOnline);
    const handleOnline = () => reportOnline();
    const handleOffline = () => reportOffline();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Zustand könnte sich zwischen Initial-Render und Effect geändert haben.
    setIsOnline(getIsOnline());
    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const value = useMemo<OnlineStatusState>(() => ({ isOnline }), [isOnline]);
  return <OnlineStatusContext.Provider value={value}>{children}</OnlineStatusContext.Provider>;
}
