/**
 * Sync-Engine: spielt die Outbox gegen den Server ab (kein React).
 *
 * Handgerollt statt workbox-background-sync: iOS Safari hat kein
 * SyncManager-API, und die Konfliktbehandlung (400-Plausibilität, 409-
 * Duplikat) braucht App-Kontext und UI. Getriggert wird eventbasiert
 * (App-Start, online-Event, Sichtbarkeitswechsel, Login, manuell);
 * Retries nach Netzfehlern plant `syncScheduler.ts` (Backoff 30 s → 5 min).
 *
 * Ablauf-Garantien:
 * - Strikt sequenziell, sortiert nach readingAt: die Server-Plausibilität
 *   prüft gegen DB-Nachbarn, Out-of-order-Replay ergäbe Phantom-Warnungen.
 * - Nach einer Plausibilitätswarnung werden WEITERE pending-Items desselben
 *   Registers in diesem Lauf übersprungen (Kaskaden-Warnungen vermeiden).
 * - 409 mit wertgleichem Bestand wird als Erfolg gewertet (eigener POST kam
 *   durch, Response ging im Funkloch verloren) — Fotos laden auf die
 *   existierende Server-ID nach.
 * - Foto-Uploads sind einzeln crash-sicher (uploadedPhotoIds wird nach
 *   jedem Foto persistiert → kein Doppel-Upload).
 * - Doppel-Sync-Schutz: Web Locks (Multi-Tab) + Modul-Flag (StrictMode).
 */

import { ApiError, NetworkError, api, isPlausibilityWarning } from '@/lib/api';
import type { ReadingRead } from '@/lib/types';
import type { OutboxReading } from './db';
import { completeItem, getGroupPhotos, listItems, updateItem } from './outbox';

export type SyncPhase = 'idle' | 'syncing' | 'auth_required' | 'offline';

export interface SyncResult {
  synced: number;
  conflicts: number;
  stopped: 'done' | 'offline' | 'auth' | 'locked';
}

/** Wird nach jedem erfolgreichen Sync-Lauf mit synced > 0 gefeuert. */
export const SYNCED_EVENT = 'zaehler:synced';

type SyncPhaseListener = (phase: SyncPhase) => void;
const phaseListeners = new Set<SyncPhaseListener>();
let currentPhase: SyncPhase = 'idle';

function setPhase(phase: SyncPhase): void {
  if (phase === currentPhase) return;
  currentPhase = phase;
  for (const listener of phaseListeners) listener(phase);
}

export function getSyncPhase(): SyncPhase {
  return currentPhase;
}

export function subscribeSyncState(listener: SyncPhaseListener): () => void {
  phaseListeners.add(listener);
  return () => {
    phaseListeners.delete(listener);
  };
}

interface StepOutcome {
  stop?: 'offline' | 'auth';
  synced: boolean;
  conflict: boolean;
}

/** Ein pending-Item POSTen; Ergebnis bestimmt Status/Abbruch. */
async function postReading(item: OutboxReading): Promise<StepOutcome & { serverId?: number }> {
  await updateItem(item.id, { attempts: item.attempts + 1 });
  try {
    const created = await api.post<ReadingRead>('/readings', {
      register_id: item.registerId,
      value: item.value,
      reading_at: item.readingAt,
      note: item.note,
      acknowledge_warnings: item.acknowledgeWarnings,
    });
    return { synced: false, conflict: false, serverId: created.id };
  } catch (err) {
    if (err instanceof NetworkError) {
      return { stop: 'offline', synced: false, conflict: false };
    }
    if (err instanceof ApiError) {
      if (err.status === 401) {
        return { stop: 'auth', synced: false, conflict: false };
      }
      if (isPlausibilityWarning(err)) {
        await updateItem(item.id, { status: 'conflict_warning', problem: err.problem });
        return { synced: false, conflict: true };
      }
      if (err.status === 409) {
        const existing = err.problem['existing'] as { id?: number; value?: string } | undefined;
        if (
          existing?.id !== undefined &&
          existing.value !== undefined &&
          Number(existing.value) === Number(item.value)
        ) {
          // Wertgleiches Duplikat: eigener POST kam bereits durch.
          return { synced: false, conflict: false, serverId: existing.id };
        }
        await updateItem(item.id, { status: 'conflict_duplicate', problem: err.problem });
        return { synced: false, conflict: true };
      }
      await updateItem(item.id, {
        status: 'error',
        problem: err.problem,
        lastError: err.message,
      });
      return { synced: false, conflict: true };
    }
    throw err;
  }
}

/** Gruppen-Fotos auf das Reading laden; Dedupe über uploadedPhotoIds. */
async function uploadPhotos(item: OutboxReading, serverId: number): Promise<StepOutcome> {
  const photos = await getGroupPhotos(item.groupId);
  const uploaded = new Set(item.uploadedPhotoIds);
  for (const photo of photos) {
    if (uploaded.has(photo.id)) continue;
    const fd = new FormData();
    fd.append('photo', new File([photo.blob], 'zaehlerstand.jpg', { type: 'image/jpeg' }));
    if (photo.gpsLat !== null && photo.gpsLon !== null) {
      fd.append('gps_lat', String(photo.gpsLat));
      fd.append('gps_lon', String(photo.gpsLon));
    }
    try {
      await api.upload(`/readings/${serverId}/photos`, fd, 'POST');
    } catch (err) {
      if (err instanceof NetworkError) {
        return { stop: 'offline', synced: false, conflict: false };
      }
      if (err instanceof ApiError) {
        if (err.status === 401) {
          return { stop: 'auth', synced: false, conflict: false };
        }
        // 413/415/409 etc. — Blob bleibt erhalten, Nutzer entscheidet.
        await updateItem(item.id, { status: 'photo_error', lastError: err.message });
        return { synced: false, conflict: true };
      }
      throw err;
    }
    uploaded.add(photo.id);
    await updateItem(item.id, { uploadedPhotoIds: [...uploaded] });
  }
  await completeItem(item.id);
  return { synced: true, conflict: false };
}

let runningInThisTab = false;

async function runSyncLocked(userId: number): Promise<SyncResult> {
  setPhase('syncing');
  let synced = 0;
  let conflicts = 0;
  const skipRegisters = new Set<number>();

  try {
    const items = (await listItems(userId)).filter(
      (item) => item.status === 'pending' || item.status === 'photos_pending',
    );

    for (const item of items) {
      if (item.status === 'pending' && skipRegisters.has(item.registerId)) continue;

      let serverId = item.serverId;
      if (item.status === 'pending') {
        const outcome = await postReading(item);
        if (outcome.stop) {
          setPhase(outcome.stop === 'auth' ? 'auth_required' : 'offline');
          return { synced, conflicts, stopped: outcome.stop };
        }
        if (outcome.conflict) {
          conflicts += 1;
          skipRegisters.add(item.registerId);
          continue;
        }
        serverId = outcome.serverId ?? null;
        if (serverId === null) continue;
        await updateItem(item.id, { status: 'photos_pending', serverId, problem: null });
      }
      if (serverId === null) continue;

      const photoOutcome = await uploadPhotos(item, serverId);
      if (photoOutcome.stop) {
        setPhase(photoOutcome.stop === 'auth' ? 'auth_required' : 'offline');
        return { synced, conflicts, stopped: photoOutcome.stop };
      }
      if (photoOutcome.conflict) {
        conflicts += 1;
        continue;
      }
      synced += 1;
    }

    setPhase('idle');
    return { synced, conflicts, stopped: 'done' };
  } finally {
    if (synced > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
    }
  }
}

/**
 * Outbox des Users abspielen. Kehrt mit `stopped: 'locked'` zurück, wenn
 * bereits ein Lauf aktiv ist (anderer Tab oder dieser).
 */
export async function runSync(userId: number): Promise<SyncResult> {
  if (runningInThisTab) {
    return { synced: 0, conflicts: 0, stopped: 'locked' };
  }
  runningInThisTab = true;
  try {
    // Web Locks (Safari ≥ 15.4): schützt gegen parallele Läufe anderer Tabs.
    // jsdom/ältere Browser haben kein navigator.locks → Modul-Flag reicht.
    if (typeof navigator !== 'undefined' && navigator.locks) {
      const result = await navigator.locks.request(
        'zaehler-sync',
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return { synced: 0, conflicts: 0, stopped: 'locked' as const };
          return runSyncLocked(userId);
        },
      );
      return result;
    }
    return await runSyncLocked(userId);
  } finally {
    runningInThisTab = false;
  }
}
