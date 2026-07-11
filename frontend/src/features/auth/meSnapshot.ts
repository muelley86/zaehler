/**
 * Letzter bekannter User als localStorage-Snapshot (`offline.me`).
 *
 * Zweck: Offline-Kaltstart — ist der Server beim App-Start nicht erreichbar
 * (z. B. unterwegs, Server nur im Heimnetz), stellt der AuthProvider den
 * zuletzt angemeldeten User hieraus wieder her, damit die App mit gecachten
 * Daten rendern kann. Der Snapshot ist NIE die Wahrheit: Sobald der Server
 * antwortet, gilt ausschließlich dessen `/auth/me`-Antwort (401 → Snapshot
 * wird gelöscht). Eigene Datei statt AuthProvider.tsx, damit der Provider
 * component-only bleibt (Fast-Refresh) und der Logout-Purge zentral ist.
 */

import type { Me } from '@/lib/types';

const ME_SNAPSHOT_KEY = 'offline.me';

interface MeSnapshot {
  me: Me;
  savedAt: string;
}

export function saveMeSnapshot(me: Me): void {
  try {
    const snapshot: MeSnapshot = { me, savedAt: new Date().toISOString() };
    localStorage.setItem(ME_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* Storage voll oder blockiert — Offline-Komfort, kein Muss. */
  }
}

export function loadMeSnapshot(): Me | null {
  try {
    const raw = localStorage.getItem(ME_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MeSnapshot> | null;
    const me = parsed?.me;
    if (!me || typeof me.id !== 'number' || typeof me.username !== 'string') {
      return null;
    }
    return me;
  } catch {
    return null;
  }
}

export function clearMeSnapshot(): void {
  try {
    localStorage.removeItem(ME_SNAPSHOT_KEY);
  } catch {
    /* siehe oben */
  }
}
