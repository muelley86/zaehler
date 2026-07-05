import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
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
