/**
 * Aktiver Stammdaten-Snapshot: Messstellen + letzte Zählerstände werden bei
 * jedem erfolgreichen Serverkontakt komplett in IndexedDB gespiegelt.
 *
 * Damit ist die ERFASSUNG offline garantiert möglich — unabhängig davon,
 * welche Seiten zuletzt besucht wurden (der passive SW-HTTP-Cache deckt nur
 * Besuchtes ab und unterliegt LRU-Verdrängung). Der Snapshot ist eine
 * KOPIE, nie die Wahrheit: Refresh-Fehler werden geschluckt, der alte
 * Stand bleibt dann einfach stehen.
 */

import { api } from '@/lib/api';
import { mapWithConcurrency } from '@/lib/concurrency';
import type { MeasuringPointRead, RegisterStateRead } from '@/lib/types';
import type { MasterDataSnapshot } from './db';
import { getOfflineDb } from './db';

const STATE_FETCH_CONCURRENCY = 5;

/**
 * Snapshot neu aufbauen (best-effort, fire-and-forget-tauglich).
 * Fehler — auch Netzfehler — werden bewusst geschluckt.
 */
export async function refreshMasterDataSnapshot(userId: number): Promise<void> {
  try {
    const points = await api.get<MeasuringPointRead[]>('/measuring-points');
    const stateLists = await mapWithConcurrency(
      points,
      (mp) =>
        api
          .get<RegisterStateRead[]>(`/measuring-points/${mp.id}/state`)
          .catch(() => [] as RegisterStateRead[]),
      STATE_FETCH_CONCURRENCY,
    );
    const statesByMpId: Record<number, RegisterStateRead[]> = {};
    points.forEach((mp, index) => {
      statesByMpId[mp.id] = stateLists[index] ?? [];
    });

    const snapshot: MasterDataSnapshot = {
      userId,
      fetchedAt: new Date().toISOString(),
      points,
      statesByMpId,
    };
    const db = await getOfflineDb();
    await db.put('master-data', snapshot);
  } catch {
    /* Snapshot ist Komfort — alter Stand bleibt gültig. */
  }
}

/**
 * Snapshot NUR für den passenden User laden — Messstellen sind per Recorder
 * berechtigungsgefiltert, fremde Snapshots dürfen nie angezeigt werden.
 */
export async function loadMasterDataSnapshot(userId: number): Promise<MasterDataSnapshot | null> {
  try {
    const db = await getOfflineDb();
    const snapshot = await db.get('master-data', userId);
    return snapshot ?? null;
  } catch {
    return null;
  }
}
