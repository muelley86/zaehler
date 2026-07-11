/**
 * Retry-Planung für die Sync-Engine (kein React).
 *
 * Nach einem Netzfehler-Abbruch wird mit exponentiellem Backoff
 * (30 s → Cap 5 min) erneut synchronisiert — deckt den iOS-Fall ab, in dem
 * das online-Event nach Netz-Rückkehr nicht feuert. Am Cap wirkt die Kette
 * als periodischer Probe-Tick, solange Einträge offen sind. Konflikte lösen
 * bewusst KEINEN Auto-Retry aus (Nutzer entscheidet auf /sync), 401
 * pausiert bis zum Login.
 */

import type { SyncResult } from './syncEngine';

export const RETRY_BASE_MS = 30_000;
export const RETRY_MAX_MS = 300_000;

export interface SyncScheduler {
  /** Nach jedem Sync-Lauf aufrufen — plant bzw. verwirft den Retry. */
  onRunFinished(result: SyncResult): void;
  /** Bei Outbox-Änderungen: armt einen Probe-Timer, solange RETRY-FÄHIGE
   * Items (pending/photos_pending) offen sind — Konflikte zählen nicht. */
  ensureScheduled(openCount: number): void;
  /** Bei online-Event / Sichtbarwerden: nächster Fehlversuch startet wieder bei 30 s. */
  resetBackoff(): void;
  dispose(): void;
}

export function createSyncScheduler(trigger: () => void): SyncScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let step = 0;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const currentDelay = () => Math.min(RETRY_BASE_MS * 2 ** step, RETRY_MAX_MS);

  const schedule = (delay: number) => {
    clear();
    timer = setTimeout(() => {
      timer = null;
      trigger();
    }, delay);
  };

  return {
    onRunFinished(result) {
      if (result.stopped === 'offline') {
        schedule(currentDelay());
        step += 1;
        return;
      }
      if (result.stopped === 'done') {
        step = 0;
        // Übrig gebliebene Items sind Konflikte/Foto-Fehler — ein Auto-Retry
        // würde nur dieselbe Nutzer-Entscheidung wieder anstoßen.
        clear();
        return;
      }
      if (result.stopped === 'auth') {
        clear();
      }
      // 'locked': ein anderer Tab synct bereits — nichts anfassen.
    },
    ensureScheduled(openCount) {
      if (openCount === 0) {
        clear();
        return;
      }
      if (timer === null) schedule(currentDelay());
    },
    resetBackoff() {
      step = 0;
    },
    dispose: clear,
  };
}
