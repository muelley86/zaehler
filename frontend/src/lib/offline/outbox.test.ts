import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetOfflineDbForTests } from './db';
import {
  acknowledgeConflict,
  clearAll,
  completeItem,
  countOpen,
  enqueueGroup,
  getGroupPhotos,
  listItems,
  openSummary,
  updateItem,
} from './outbox';

const READING = {
  registerId: 12,
  mpName: 'Hauptzähler Strom',
  registerLabel: 'Bezug',
  registerUnit: 'kWh',
  obisCode: '1.8.0',
  value: '12345.6',
  readingAt: '2026-07-11T18:00:00Z',
  note: null,
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
});

describe('outbox', () => {
  it('enqueueGroup legt Items an; listItems sortiert nach readingAt', async () => {
    await enqueueGroup({
      userId: 1,
      readings: [
        { ...READING, readingAt: '2026-07-11T18:00:00Z' },
        { ...READING, registerId: 13, readingAt: '2026-07-09T18:00:00Z' },
      ],
      photos: [],
    });

    const items = await listItems(1);
    expect(items).toHaveLength(2);
    expect(items[0]?.readingAt).toBe('2026-07-09T18:00:00Z');
    expect(items[0]?.status).toBe('pending');
    expect(items[0]?.groupId).toBe(items[1]?.groupId);
    expect(await countOpen(1)).toBe(2);
    // Fremde User sehen nichts.
    expect(await listItems(2)).toHaveLength(0);
  });

  it('acknowledgeConflict setzt pending + acknowledgeWarnings', async () => {
    await enqueueGroup({ userId: 1, readings: [READING], photos: [] });
    const [item] = await listItems(1);
    if (!item) throw new Error('Item fehlt');
    await updateItem(item.id, {
      status: 'conflict_warning',
      problem: { title: 'Warnung', status: 400 },
    });

    await acknowledgeConflict(item.id);

    const [updated] = await listItems(1);
    expect(updated?.status).toBe('pending');
    expect(updated?.acknowledgeWarnings).toBe(true);
    expect(updated?.problem).toBeNull();
  });

  it('completeItem räumt Gruppen-Fotos erst mit dem LETZTEN Item ab', async () => {
    await enqueueGroup({
      userId: 1,
      readings: [READING, { ...READING, registerId: 13 }],
      photos: [{ blob: new Blob(['x'], { type: 'image/jpeg' }), gpsLat: null, gpsLon: null }],
    });
    const items = await listItems(1);
    const groupId = items[0]?.groupId ?? '';

    await completeItem(items[0]?.id ?? '');
    expect(await getGroupPhotos(groupId)).toHaveLength(1);

    await completeItem(items[1]?.id ?? '');
    expect(await getGroupPhotos(groupId)).toHaveLength(0);
    expect(await countOpen(1)).toBe(0);
  });

  it('openSummary zählt offene Items und liefert das älteste createdAt', async () => {
    expect(await openSummary(1)).toEqual({ count: 0, oldestCreatedAt: null });

    await enqueueGroup({
      userId: 1,
      readings: [READING, { ...READING, registerId: 13 }],
      photos: [],
    });
    const items = await listItems(1);
    await updateItem(items[0]?.id ?? '', { createdAt: '2026-07-01T06:00:00Z' });

    expect(await openSummary(1)).toEqual({ count: 2, oldestCreatedAt: '2026-07-01T06:00:00Z' });
    // Fremde User sehen nichts.
    expect(await openSummary(2)).toEqual({ count: 0, oldestCreatedAt: null });
  });

  it('clearAll leert Outbox und Fotos (Logout-Purge)', async () => {
    await enqueueGroup({
      userId: 1,
      readings: [READING],
      photos: [{ blob: new Blob(['x'], { type: 'image/jpeg' }), gpsLat: null, gpsLon: null }],
    });
    await clearAll();
    expect(await listItems(1)).toHaveLength(0);
    expect(await countOpen(1)).toBe(0);
  });
});
