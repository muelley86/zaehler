import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/tests/server';
import { resetOfflineDbForTests } from './db';
import { enqueueGroup, getGroupPhotos, listItems } from './outbox';
import { runSync } from './syncEngine';

const READING = {
  registerId: 12,
  mpName: 'Hauptzähler Strom',
  registerLabel: 'Bezug',
  registerUnit: 'kWh',
  obisCode: '1.8.0',
  value: '100.5',
  readingAt: '2026-07-10T18:00:00Z',
  note: null,
};

interface PostedBody {
  register_id: number;
  value: string;
  reading_at: string;
  acknowledge_warnings: boolean;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
});

describe('syncEngine.runSync', () => {
  it('spielt Items nach readingAt-Reihenfolge ab und schließt sie ab', async () => {
    const posted: PostedBody[] = [];
    let nextId = 100;
    server.use(
      http.post('/api/v1/readings', async ({ request }) => {
        const body = (await request.json()) as PostedBody;
        posted.push(body);
        nextId += 1;
        return HttpResponse.json({ id: nextId }, { status: 201 });
      }),
    );

    await enqueueGroup({
      userId: 1,
      readings: [
        { ...READING, readingAt: '2026-07-11T18:00:00Z' },
        { ...READING, registerId: 13, readingAt: '2026-07-09T18:00:00Z' },
      ],
      photos: [],
    });

    const result = await runSync(1);

    expect(result).toMatchObject({ synced: 2, conflicts: 0, stopped: 'done' });
    expect(posted.map((p) => p.reading_at)).toEqual([
      '2026-07-09T18:00:00Z',
      '2026-07-11T18:00:00Z',
    ]);
    expect(await listItems(1)).toHaveLength(0);
  });

  it('lädt Gruppen-Fotos nach dem Reading hoch und räumt sie ab', async () => {
    const photoUploads: string[] = [];
    server.use(
      http.post('/api/v1/readings', () => HttpResponse.json({ id: 500 }, { status: 201 })),
      http.post('/api/v1/readings/:id/photos', ({ params }) => {
        photoUploads.push(String(params['id']));
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    await enqueueGroup({
      userId: 1,
      readings: [READING],
      photos: [
        { blob: new Blob(['a'], { type: 'image/jpeg' }), gpsLat: 48.1, gpsLon: 11.5 },
        { blob: new Blob(['b'], { type: 'image/jpeg' }), gpsLat: null, gpsLon: null },
      ],
    });
    const [item] = await listItems(1);

    const result = await runSync(1);

    expect(result.synced).toBe(1);
    expect(photoUploads).toEqual(['500', '500']);
    expect(await getGroupPhotos(item?.groupId ?? '')).toHaveLength(0);
  });

  it('400-Plausibilität → conflict_warning und Skip weiterer Items desselben Registers', async () => {
    server.use(
      http.post('/api/v1/readings', () =>
        HttpResponse.json(
          {
            title: 'Plausibilität',
            status: 400,
            warning: 'value_below_previous',
            acknowledge_field: 'acknowledge_warnings',
            previous: { id: 9, reading_at: '2026-07-01T18:00:00Z', value: '200' },
          },
          { status: 400 },
        ),
      ),
    );

    await enqueueGroup({
      userId: 1,
      readings: [
        { ...READING, readingAt: '2026-07-09T18:00:00Z' },
        { ...READING, readingAt: '2026-07-11T18:00:00Z' },
      ],
      photos: [],
    });

    const result = await runSync(1);

    expect(result).toMatchObject({ synced: 0, conflicts: 1, stopped: 'done' });
    const items = await listItems(1);
    expect(items.map((i) => i.status).sort()).toEqual(['conflict_warning', 'pending']);
    // Das zweite Item wurde NICHT versucht (kein Kaskaden-Konflikt).
    expect(items.find((i) => i.status === 'pending')?.attempts).toBe(0);
  });

  it('409 mit wertgleichem Bestand → Auto-Resolve inkl. Foto auf existing.id', async () => {
    const photoUploads: string[] = [];
    server.use(
      http.post('/api/v1/readings', () =>
        HttpResponse.json(
          {
            title: 'Reading already exists at this timestamp',
            status: 409,
            existing: { id: 777, value: '100.50', created_by_user_id: 1 },
          },
          { status: 409 },
        ),
      ),
      http.post('/api/v1/readings/:id/photos', ({ params }) => {
        photoUploads.push(String(params['id']));
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    await enqueueGroup({
      userId: 1,
      readings: [READING], // value '100.5' — numerisch gleich '100.50'
      photos: [{ blob: new Blob(['a'], { type: 'image/jpeg' }), gpsLat: null, gpsLon: null }],
    });

    const result = await runSync(1);

    expect(result).toMatchObject({ synced: 1, conflicts: 0 });
    expect(photoUploads).toEqual(['777']);
    expect(await listItems(1)).toHaveLength(0);
  });

  it('409 mit abweichendem Wert → conflict_duplicate', async () => {
    server.use(
      http.post('/api/v1/readings', () =>
        HttpResponse.json(
          {
            title: 'Reading already exists at this timestamp',
            status: 409,
            existing: { id: 777, value: '999', created_by_user_id: 2 },
          },
          { status: 409 },
        ),
      ),
    );

    await enqueueGroup({ userId: 1, readings: [READING], photos: [] });
    const result = await runSync(1);

    expect(result.conflicts).toBe(1);
    const [item] = await listItems(1);
    expect(item?.status).toBe('conflict_duplicate');
    expect(item?.problem).toMatchObject({ existing: { id: 777 } });
  });

  it('401 → Abbruch, Items bleiben pending, stopped=auth', async () => {
    server.use(
      http.post('/api/v1/readings', () =>
        HttpResponse.json({ title: 'Unauthorized', status: 401 }, { status: 401 }),
      ),
    );

    await enqueueGroup({
      userId: 1,
      readings: [READING, { ...READING, registerId: 13 }],
      photos: [],
    });
    const result = await runSync(1);

    expect(result.stopped).toBe('auth');
    const items = await listItems(1);
    expect(items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('Netzfehler mitten im Lauf → Rest bleibt pending, stopped=offline', async () => {
    let calls = 0;
    server.use(
      http.post('/api/v1/readings', () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ id: 300 }, { status: 201 });
        return HttpResponse.error();
      }),
    );

    await enqueueGroup({
      userId: 1,
      readings: [
        { ...READING, readingAt: '2026-07-09T18:00:00Z' },
        { ...READING, registerId: 13, readingAt: '2026-07-11T18:00:00Z' },
      ],
      photos: [],
    });
    const result = await runSync(1);

    expect(result).toMatchObject({ synced: 1, stopped: 'offline' });
    const items = await listItems(1);
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe('pending');
  });

  it('paralleler zweiter Lauf wird abgewiesen (locked)', async () => {
    server.use(
      http.post(
        '/api/v1/readings',
        async () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(HttpResponse.json({ id: 1 }, { status: 201 })), 30),
          ),
      ),
    );
    await enqueueGroup({ userId: 1, readings: [READING], photos: [] });

    const [first, second] = await Promise.all([runSync(1), runSync(1)]);
    const stops = [first.stopped, second.stopped].sort();
    expect(stops).toContain('locked');
    expect(stops).toContain('done');
  });
});
