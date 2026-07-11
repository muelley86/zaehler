import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, NetworkError, api } from './api';
import { getIsOnline, reportOnline } from './offline/connectivity';

afterEach(() => {
  vi.unstubAllGlobals();
  // Konnektivitäts-Zustand normalisieren, damit Tests sich nicht beeinflussen.
  reportOnline();
});

function stubFetch(status: number, body?: unknown): void {
  const text = body === undefined ? '' : JSON.stringify(body);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(text || null, { status }))),
  );
}

describe('api — gemeinsames Response-Handling (parseJsonResponse)', () => {
  it('204 → undefined', async () => {
    stubFetch(204);
    await expect(api.delete('/x')).resolves.toBeUndefined();
  });

  it('ok → geparste Daten', async () => {
    stubFetch(200, { id: 1, name: 'A' });
    await expect(api.get<{ id: number; name: string }>('/x')).resolves.toEqual({
      id: 1,
      name: 'A',
    });
  });

  it('Fehler-Response → ApiError mit ProblemDetails', async () => {
    stubFetch(409, { title: 'Konflikt', status: 409, detail: 'schon da' });
    await expect(api.post('/x', {})).rejects.toMatchObject({
      status: 409,
      problem: { detail: 'schon da' },
    });
  });

  it('Fehler ohne Body → Fallback aus statusText/status', async () => {
    stubFetch(500);
    const err = await api.get('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
  });

  it('upload teilt dieselbe Fehlerbehandlung', async () => {
    stubFetch(400, { title: 'Bad', status: 400 });
    await expect(api.upload('/x', new FormData())).rejects.toBeInstanceOf(ApiError);
  });
});

describe('api — Netzfehler (Offline-Erkennung)', () => {
  it('fetch-Rejection → typisierter NetworkError statt rohem TypeError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const err = await api.get('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).not.toBeInstanceOf(ApiError);
  });

  it('AbortError wird NICHT gewrappt (Abort-Flows bleiben intakt)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))),
    );
    const err = await api.get('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');
    expect(err).not.toBeInstanceOf(NetworkError);
  });

  it('Netzfehler meldet offline, erfolgreiche Response meldet online', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await api.get('/x').catch(() => undefined);
    expect(getIsOnline()).toBe(false);

    stubFetch(200, { ok: true });
    await api.get('/x');
    expect(getIsOnline()).toBe(true);
  });

  it('auch eine Fehler-Response (4xx) meldet online — der Server hat geantwortet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await api.get('/x').catch(() => undefined);
    expect(getIsOnline()).toBe(false);

    stubFetch(500);
    await api.get('/x').catch(() => undefined);
    expect(getIsOnline()).toBe(true);
  });

  it('upload wrappt Netzfehler ebenfalls in NetworkError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(api.upload('/x', new FormData())).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('api.getWithMeta — Antwort mit Zeitstempel des Servers/Caches', () => {
  it('liefert Daten + servedAt aus dem Date-Header', async () => {
    const headers = { date: 'Sat, 11 Jul 2026 10:00:00 GMT' };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 200, headers })),
      ),
    );
    const result = await api.getWithMeta<{ id: number }>('/x');
    expect(result.data).toEqual({ id: 1 });
    expect(result.servedAt).toEqual(new Date('2026-07-11T10:00:00Z'));
  });

  it('fehlender/ungültiger Date-Header → servedAt null', async () => {
    stubFetch(200, { id: 1 });
    const result = await api.getWithMeta<{ id: number }>('/x');
    expect(result.data).toEqual({ id: 1 });
    expect(result.servedAt).toBeNull();
  });
});
