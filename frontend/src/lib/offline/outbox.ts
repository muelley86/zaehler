/**
 * Outbox — CRUD über den offline erfassten Zählerständen (kein React).
 *
 * Ein Queue-Item pro Register-POST, gruppiert per `groupId`; Fotos hängen
 * an der Gruppe und werden erst nach erfolgreichem Sync des jeweiligen
 * Readings hochgeladen (Foto-Upload braucht die Server-ID). UI-Schichten
 * hören über `subscribeOutbox` auf Änderungen (Badge-Zähler etc.).
 */

import type { OutboxPhoto, OutboxReading, OutboxStatus } from './db';
import { getOfflineDb } from './db';

const OPEN_STATUSES: readonly OutboxStatus[] = [
  'pending',
  'photos_pending',
  'conflict_warning',
  'conflict_duplicate',
  'photo_error',
  'error',
];

type OutboxListener = () => void;
const listeners = new Set<OutboxListener>();

function notifyChanged(): void {
  for (const listener of listeners) listener();
}

/** Nach jeder Outbox-Mutation aufgerufen; Rückgabe: unsubscribe. */
export function subscribeOutbox(listener: OutboxListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface EnqueueReadingInput {
  registerId: number;
  mpName: string;
  registerLabel: string;
  registerUnit: string;
  obisCode: string;
  value: string;
  readingAt: string;
  note: string | null;
}

export interface EnqueuePhotoInput {
  blob: Blob;
  gpsLat: number | null;
  gpsLon: number | null;
}

export interface EnqueueResult {
  /** true, wenn Fotos wegen Speicher-Quota NICHT gesichert werden konnten. */
  photosDropped: boolean;
}

/**
 * Ein kompletter Offline-Submit: N Readings (ein Item je Register) + die
 * gemeinsamen Fotos der Gruppe. Bei Quota-Fehlern beim Foto-Put werden die
 * Readings trotzdem gesichert (Werte sind wichtiger als Fotos).
 */
export async function enqueueGroup(input: {
  userId: number;
  readings: EnqueueReadingInput[];
  photos: EnqueuePhotoInput[];
}): Promise<EnqueueResult> {
  const db = await getOfflineDb();
  const groupId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const tx = db.transaction('outbox-readings', 'readwrite');
  for (const reading of input.readings) {
    const item: OutboxReading = {
      id: crypto.randomUUID(),
      groupId,
      userId: input.userId,
      registerId: reading.registerId,
      mpName: reading.mpName,
      registerLabel: reading.registerLabel,
      registerUnit: reading.registerUnit,
      obisCode: reading.obisCode,
      value: reading.value,
      readingAt: reading.readingAt,
      note: reading.note,
      acknowledgeWarnings: false,
      status: 'pending',
      problem: null,
      serverId: null,
      uploadedPhotoIds: [],
      attempts: 0,
      lastError: null,
      createdAt,
    };
    await tx.store.put(item);
  }
  await tx.done;

  let photosDropped = false;
  if (input.photos.length > 0) {
    try {
      const photoTx = db.transaction('outbox-photos', 'readwrite');
      for (const photo of input.photos) {
        const record: OutboxPhoto = {
          id: crypto.randomUUID(),
          groupId,
          blob: photo.blob,
          gpsLat: photo.gpsLat,
          gpsLon: photo.gpsLon,
          createdAt,
        };
        await photoTx.store.put(record);
      }
      await photoTx.done;
    } catch {
      // Typisch QuotaExceededError — Readings bleiben gesichert, nur die
      // Fotos entfallen; der Aufrufer zeigt eine Warnung.
      photosDropped = true;
    }
  }

  notifyChanged();
  return { photosDropped };
}

/** Alle Items des Users, sortiert nach readingAt asc, dann createdAt asc. */
export async function listItems(userId: number): Promise<OutboxReading[]> {
  const db = await getOfflineDb();
  const items = await db.getAllFromIndex('outbox-readings', 'by-userId', userId);
  return items.sort(
    (a, b) => a.readingAt.localeCompare(b.readingAt) || a.createdAt.localeCompare(b.createdAt),
  );
}

/** Stati, die ein Auto-Retry sinnvoll erneut versuchen kann — Konflikte
 * und Fehler brauchen dagegen eine Nutzer-Entscheidung auf /sync. */
const RETRYABLE_STATUSES: readonly OutboxStatus[] = ['pending', 'photos_pending'];

export interface OpenSummary {
  count: number;
  /** Teilmenge von count mit Status pending/photos_pending — Auto-Retry-Basis. */
  retryableCount: number;
  /** createdAt des ältesten offenen Items (ISO) — Basis der Alters-Warnung. */
  oldestCreatedAt: string | null;
}

/** Anzahl + ältestes createdAt der offenen Items — Badge und Alters-Warnung. */
export async function openSummary(userId: number): Promise<OpenSummary> {
  const items = await listItems(userId);
  const open = items.filter((item) => OPEN_STATUSES.includes(item.status));
  const retryableCount = open.filter((item) => RETRYABLE_STATUSES.includes(item.status)).length;
  const oldestCreatedAt = open.reduce<string | null>(
    (oldest, item) => (oldest === null || item.createdAt < oldest ? item.createdAt : oldest),
    null,
  );
  return { count: open.length, retryableCount, oldestCreatedAt };
}

/** Anzahl offener (nicht abgeschlossener) Items des Users — Badge-Zähler. */
export async function countOpen(userId: number): Promise<number> {
  return (await openSummary(userId)).count;
}

export interface PendingRegisterValue {
  value: string;
  readingAt: string;
}

/** Werte, die als „letzter bekannter Stand" taugen: noch nicht versucht
 * (pending/photos_pending) oder vom Server bereits akzeptiert (photo_error =
 * Reading gespeichert, nur das Foto fehlt). Vom Server abgelehnte bzw.
 * bestrittene Werte (conflict_*, error) dürfen NICHT überlagern. */
const OVERLAY_STATUSES: readonly OutboxStatus[] = ['pending', 'photos_pending', 'photo_error'];

/**
 * Neuester überlagerungsfähiger Wert je Register (nach readingAt) —
 * überlagert beim Erfassen den Server-„letzten Stand", solange der Sync
 * aussteht.
 */
export async function latestPendingByRegister(
  userId: number,
): Promise<Map<number, PendingRegisterValue>> {
  const items = await listItems(userId); // sortiert nach readingAt aufsteigend
  const map = new Map<number, PendingRegisterValue>();
  for (const item of items) {
    if (!OVERLAY_STATUSES.includes(item.status)) continue;
    map.set(item.registerId, { value: item.value, readingAt: item.readingAt });
  }
  return map;
}

export async function getItem(id: string): Promise<OutboxReading | undefined> {
  const db = await getOfflineDb();
  return db.get('outbox-readings', id);
}

/** Fotos einer Gruppe (für Sync-Upload und Anzeige). */
export async function getGroupPhotos(groupId: string): Promise<OutboxPhoto[]> {
  const db = await getOfflineDb();
  return db.getAllFromIndex('outbox-photos', 'by-groupId', groupId);
}

/** Immutable Patch: liest das Item und schreibt eine neue Kopie zurück. */
export async function updateItem(
  id: string,
  patch: Partial<Omit<OutboxReading, 'id' | 'groupId' | 'userId'>>,
): Promise<void> {
  const db = await getOfflineDb();
  const existing = await db.get('outbox-readings', id);
  if (!existing) return;
  await db.put('outbox-readings', { ...existing, ...patch });
  notifyChanged();
}

/**
 * Item erfolgreich abgeschlossen: löschen; war es das letzte der Gruppe,
 * werden auch die Gruppen-Fotos entsorgt (GC).
 */
export async function completeItem(id: string): Promise<void> {
  const db = await getOfflineDb();
  const item = await db.get('outbox-readings', id);
  if (!item) return;
  await db.delete('outbox-readings', id);

  const remaining = await db.getAll('outbox-readings');
  const groupStillUsed = remaining.some((r) => r.groupId === item.groupId);
  if (!groupStillUsed) {
    const photos = await db.getAllFromIndex('outbox-photos', 'by-groupId', item.groupId);
    const tx = db.transaction('outbox-photos', 'readwrite');
    for (const photo of photos) {
      await tx.store.delete(photo.id);
    }
    await tx.done;
  }
  notifyChanged();
}

/** Konflikt bestätigt: erneut versuchen, diesmal mit acknowledge_warnings. */
export async function acknowledgeConflict(id: string): Promise<void> {
  await updateItem(id, {
    status: 'pending',
    acknowledgeWarnings: true,
    problem: null,
    lastError: null,
  });
}

/** Foto-Fehler: Upload erneut versuchen. */
export async function retryPhotos(id: string): Promise<void> {
  await updateItem(id, { status: 'photos_pending', lastError: null });
}

/** Foto-Fehler: ohne (restliche) Fotos abschließen. */
export async function completeWithoutPhotos(id: string): Promise<void> {
  await completeItem(id);
}

/** Item verwerfen (Konflikt/Fehler) — wie completeItem inkl. Foto-GC. */
export async function discardItem(id: string): Promise<void> {
  await completeItem(id);
}

/** Logout-Purge: Outbox, Fotos und Stammdaten-Snapshots restlos löschen. */
export async function clearAll(): Promise<void> {
  const db = await getOfflineDb();
  await db.clear('outbox-readings');
  await db.clear('outbox-photos');
  await db.clear('master-data');
  notifyChanged();
}
