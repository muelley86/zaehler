/**
 * Tests für useDashboardData: Cache-Hit/-Miss, Hintergrund-Refetch,
 * Key-Wechsel während eines offenen Requests, LRU-Cap und Fehlerverhalten
 * mit/ohne Cache.
 *
 * AbortSignal-Strip: MSW/undici unter jsdom akzeptiert die jsdom-
 * AbortSignal-Instanz nicht zuverlässig — wir strippen sie über einen
 * `api.getWithMeta`-Spy (Muster `DashboardPage.test.tsx`).
 */

import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { server } from '@/tests/server';
import { api } from '@/lib/api';

import { dashboardItem, dashboardResponse } from './testFixtures';
import { clearDashboardCache, dashboardCacheKey, useDashboardData } from './useDashboardData';

/** Index-Zugriff mit Narrowing (tsconfig: noUncheckedIndexedAccess). */
function at<T>(arr: T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`kein Element an Index ${i}`);
  return v;
}

beforeEach(() => {
  clearDashboardCache();
  const real = api.getWithMeta;
  vi.spyOn(api, 'getWithMeta').mockImplementation(<T,>(path: string) => real<T>(path));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dashboardCacheKey', () => {
  it('kombiniert from/to mit "|"', () => {
    expect(dashboardCacheKey('2026-08-01', '2026-09-30')).toBe('2026-08-01|2026-09-30');
  });
});

describe('useDashboardData', () => {
  it('lädt bei einem Cache-Miss: loading → data', async () => {
    server.use(http.get('/api/v1/dashboard', () => HttpResponse.json(dashboardResponse())));

    const { result } = renderHook(() => useDashboardData('2026-08-01', '2026-09-30'));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.refreshing).toBe(false);
  });

  it('ruft api.getWithMeta mit fester Monats-Granularität, Zeitraum und AbortSignal auf', async () => {
    server.use(http.get('/api/v1/dashboard', () => HttpResponse.json(dashboardResponse())));

    const { result } = renderHook(() => useDashboardData('2026-08-01', '2026-09-30'));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(api.getWithMeta).toHaveBeenCalledTimes(1);
    const [path, signal] = at(vi.mocked(api.getWithMeta).mock.calls, 0);
    expect(path).toContain('/dashboard?');
    // Ohne Diagramme ist die Granularität fix — die KPI-Totals hängen nicht
    // davon ab, `month` ist der günstigste Backend-Pfad.
    expect(path).toContain('granularity=month');
    expect(path).toContain('from_at=2026-08-01');
    expect(path).toContain('to_at=2026-09-30');
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('zeigt bei Remount mit demselben Key sofort die gecachten Daten (refreshing=true) und aktualisiert im Hintergrund', async () => {
    let call = 0;
    server.use(
      http.get('/api/v1/dashboard', () => {
        call += 1;
        return HttpResponse.json(
          dashboardResponse({ items: [dashboardItem({ id: call, name: `Item ${call}` })] }),
        );
      }),
    );

    const first = renderHook(() => useDashboardData('2026-08-01', '2026-09-30'));
    await waitFor(() => expect(first.result.current.data).not.toBeNull());
    first.unmount();

    const second = renderHook(() => useDashboardData('2026-08-01', '2026-09-30'));
    // Cache-Hit: Daten sofort da, Hintergrund-Refetch läuft.
    expect(second.result.current.data).not.toBeNull();
    expect(at(second.result.current.data?.items ?? [], 0).name).toBe('Item 1');
    expect(second.result.current.refreshing).toBe(true);

    await waitFor(() => expect(second.result.current.refreshing).toBe(false));
    expect(at(second.result.current.data?.items ?? [], 0).name).toBe('Item 2');
  });

  it('bei Key-Wechsel während eines offenen Requests zählt nur das jüngste Ergebnis', async () => {
    server.use(
      http.get('/api/v1/dashboard', async ({ request }) => {
        const from = new URL(request.url).searchParams.get('from_at');
        if (from === '2026-08-01') {
          await delay(50);
          return HttpResponse.json(
            dashboardResponse({ items: [dashboardItem({ id: 1, name: 'august' })] }),
          );
        }
        return HttpResponse.json(
          dashboardResponse({ items: [dashboardItem({ id: 2, name: 'september' })] }),
        );
      }),
    );

    const { result, rerender } = renderHook(
      ({ from }: { from: string }) => useDashboardData(from, '2026-09-30'),
      { initialProps: { from: '2026-08-01' } },
    );
    rerender({ from: '2026-09-01' });

    await waitFor(() => expect(at(result.current.data?.items ?? [], 0).name).toBe('september'));
    // Die verzögerte August-Antwort darf das Ergebnis nicht mehr überschreiben.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(at(result.current.data?.items ?? [], 0).name).toBe('september');
  });

  it('begrenzt den Cache auf 12 Einträge (LRU) — der älteste Key wird verdrängt', async () => {
    server.use(http.get('/api/v1/dashboard', () => HttpResponse.json(dashboardResponse())));

    for (let i = 0; i < 13; i++) {
      const from = `2026-08-${String(i + 1).padStart(2, '0')}`;
      const { result, unmount } = renderHook(() => useDashboardData(from, '2026-09-30'));
      await waitFor(() => expect(result.current.data).not.toBeNull());
      unmount();
    }

    // Der zuerst eingefügte Key (Tag 01) wurde verdrängt -> erneuter Cache-Miss.
    const { result } = renderHook(() => useDashboardData('2026-08-01', '2026-09-30'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('setzt bei einem Fehler ohne Cache `error`', async () => {
    server.use(
      http.get('/api/v1/dashboard', () =>
        HttpResponse.json({ title: 'Serverfehler', status: 500 }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useDashboardData('2026-08-01', '2026-09-30'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data).toBeNull();
    expect(result.current.refreshing).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('behält bei einem Fehler MIT gecachten Daten die Daten und setzt keinen Fehler', async () => {
    server.use(http.get('/api/v1/dashboard', () => HttpResponse.json(dashboardResponse())));
    const first = renderHook(() => useDashboardData('2026-08-01', '2026-09-30'));
    await waitFor(() => expect(first.result.current.data).not.toBeNull());
    first.unmount();

    server.use(
      http.get('/api/v1/dashboard', () =>
        HttpResponse.json({ title: 'Serverfehler', status: 500 }, { status: 500 }),
      ),
    );
    const second = renderHook(() => useDashboardData('2026-08-01', '2026-09-30'));
    expect(second.result.current.data).not.toBeNull();

    await waitFor(() => expect(second.result.current.refreshing).toBe(false));
    expect(second.result.current.error).toBeNull();
    expect(second.result.current.data).not.toBeNull();
  });

  it('retry() löst einen erneuten Request für denselben Key aus', async () => {
    let call = 0;
    server.use(
      http.get('/api/v1/dashboard', () => {
        call += 1;
        return HttpResponse.json(
          dashboardResponse({ items: [dashboardItem({ id: call, name: `Item ${call}` })] }),
        );
      }),
    );

    const { result } = renderHook(() => useDashboardData('2026-08-01', '2026-09-30'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(at(result.current.data?.items ?? [], 0).name).toBe('Item 1');

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(at(result.current.data?.items ?? [], 0).name).toBe('Item 2'));
  });
});
