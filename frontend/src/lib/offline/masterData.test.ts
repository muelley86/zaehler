import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/tests/server';
import { resetOfflineDbForTests } from './db';
import {
  loadMasterDataSnapshot,
  refreshMasterDataSnapshot,
  refreshMasterDataSnapshotIfStale,
} from './masterData';

const MP = { id: 42, name: 'Hauptzähler Strom' };
const STATE = { register_id: 12, current_value: '12345.6' };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
});

describe('masterData — aktiver Stammdaten-Snapshot', () => {
  it('refresh schreibt points + statesByMpId + fetchedAt', async () => {
    server.use(
      http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
      http.get('/api/v1/measuring-points/42/state', () => HttpResponse.json([STATE])),
    );

    await refreshMasterDataSnapshot(1);

    const snapshot = await loadMasterDataSnapshot(1);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.points).toEqual([MP]);
    expect(snapshot?.statesByMpId[42]).toEqual([STATE]);
    expect(snapshot?.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('load liefert nur den Snapshot des passenden Users', async () => {
    server.use(
      http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
      http.get('/api/v1/measuring-points/42/state', () => HttpResponse.json([STATE])),
    );
    await refreshMasterDataSnapshot(1);

    expect(await loadMasterDataSnapshot(2)).toBeNull();
  });

  it('IfStale lädt nur bei fehlendem oder überaltertem Snapshot', async () => {
    let fetches = 0;
    server.use(
      http.get('/api/v1/measuring-points', () => {
        fetches += 1;
        return HttpResponse.json([MP]);
      }),
      http.get('/api/v1/measuring-points/42/state', () => HttpResponse.json([STATE])),
    );

    // Kein Snapshot vorhanden → lädt.
    await refreshMasterDataSnapshotIfStale(1, 60_000);
    expect(fetches).toBe(1);

    // Frischer Snapshot → kein erneuter Fetch.
    await refreshMasterDataSnapshotIfStale(1, 60_000);
    expect(fetches).toBe(1);

    // maxAge 0 ⇒ gilt sofort als veraltet → lädt erneut.
    await refreshMasterDataSnapshotIfStale(1, 0);
    expect(fetches).toBe(2);
  });

  it('Netzfehler beim Refresh wird geschluckt — alter Snapshot bleibt', async () => {
    server.use(
      http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
      http.get('/api/v1/measuring-points/42/state', () => HttpResponse.json([STATE])),
    );
    await refreshMasterDataSnapshot(1);

    server.use(http.get('/api/v1/measuring-points', () => HttpResponse.error()));
    await expect(refreshMasterDataSnapshot(1)).resolves.toBeUndefined();

    const snapshot = await loadMasterDataSnapshot(1);
    expect(snapshot?.points).toEqual([MP]);
  });
});
