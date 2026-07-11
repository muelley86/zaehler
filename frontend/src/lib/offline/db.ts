/**
 * IndexedDB-Schema für den Offline-Modus (DB `zaehler-offline`).
 *
 * Drei Stores:
 * - `outbox-readings`: offline erfasste Zählerstände, ein Item pro
 *   Register-POST, gruppiert über `groupId` (ein Submit = eine Gruppe).
 * - `outbox-photos`: Foto-Blobs je Gruppe (VOR dem Enqueue komprimiert);
 *   werden nach dem Sync auf JEDES Reading der Gruppe hochgeladen —
 *   spiegelt das Online-Verhalten der Erfassen-Seite.
 * - `master-data`: aktiver Stammdaten-Snapshot (Messstellen + letzte
 *   Stände) pro User, damit die Erfassung offline GARANTIERT möglich ist.
 *
 * Migrations-Story: DB_VERSION erhöhen und im `upgrade`-Callback mit
 * `if (oldVersion < n)`-Blöcken nachziehen.
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

import type { MeasuringPointRead, ProblemDetails, RegisterStateRead } from '@/lib/types';

export type OutboxStatus =
  | 'pending' // wartet auf POST /readings
  | 'photos_pending' // Reading gespeichert (serverId gesetzt), Fotos offen
  | 'conflict_warning' // HTTP 400 Plausibilität — Nutzer bestätigt/verwirft
  | 'conflict_duplicate' // HTTP 409 mit abweichendem Wert — nur Verwerfen
  | 'photo_error' // Foto-Upload mit ApiError — erneut versuchen / ohne Foto
  | 'error'; // sonstiger ApiError (z. B. 422) — nur Verwerfen

export interface OutboxReading {
  id: string; // crypto.randomUUID()
  groupId: string;
  userId: number; // nur eigene Items anzeigen/syncen
  registerId: number;
  // Display-Snapshots für die Queue-UI (offline verfügbar, ohne Server):
  mpName: string;
  registerLabel: string;
  registerUnit: string;
  obisCode: string;
  value: string; // parseDe-normalisiert (Punkt-Dezimal)
  readingAt: string; // ISO-8601
  note: string | null;
  acknowledgeWarnings: boolean;
  status: OutboxStatus;
  problem: ProblemDetails | null; // Server-Payload für die Konfliktanzeige
  serverId: number | null; // nach erfolgreichem POST
  uploadedPhotoIds: string[]; // Crash-sicherer Foto-Dedupe beim Retry
  attempts: number;
  lastError: string | null;
  createdAt: string; // ISO-8601
}

export interface OutboxPhoto {
  id: string; // UUID
  groupId: string;
  blob: Blob; // bereits komprimiert (compressImage)
  gpsLat: number | null; // bei der ERFASSUNG ermittelt (Gerät steht am Zähler)
  gpsLon: number | null;
  createdAt: string;
}

export interface MasterDataSnapshot {
  userId: number; // keyPath — ein Snapshot pro User
  fetchedAt: string; // ISO-8601
  points: MeasuringPointRead[];
  statesByMpId: Record<number, RegisterStateRead[]>;
}

interface ZaehlerOfflineDB extends DBSchema {
  'outbox-readings': {
    key: string;
    value: OutboxReading;
    indexes: { 'by-status': string; 'by-userId': number };
  };
  'outbox-photos': {
    key: string;
    value: OutboxPhoto;
    indexes: { 'by-groupId': string };
  };
  'master-data': {
    key: number;
    value: MasterDataSnapshot;
  };
}

const DB_NAME = 'zaehler-offline';
const DB_VERSION = 1;

export type OfflineDB = IDBPDatabase<ZaehlerOfflineDB>;

let dbPromise: Promise<OfflineDB> | null = null;

export function getOfflineDb(): Promise<OfflineDB> {
  dbPromise ??= openDB<ZaehlerOfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const readings = db.createObjectStore('outbox-readings', { keyPath: 'id' });
        readings.createIndex('by-status', 'status');
        readings.createIndex('by-userId', 'userId');
        const photos = db.createObjectStore('outbox-photos', { keyPath: 'id' });
        photos.createIndex('by-groupId', 'groupId');
        db.createObjectStore('master-data', { keyPath: 'userId' });
      }
    },
  });
  return dbPromise;
}

/** Nur für Tests: erzwingt eine frische DB-Verbindung (fake-indexeddb-Reset). */
export function resetOfflineDbForTests(): void {
  dbPromise = null;
}
