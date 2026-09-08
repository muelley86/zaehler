/**
 * Tests für useReportQuery: kein Auto-Load, `execute()` lädt und setzt `run`,
 * ein zweiter Lauf verdrängt den ersten (nur die jüngste Antwort zählt),
 * Fehler lassen den letzten Lauf stehen, `stale` folgt der anstehenden Query.
 *
 * AbortSignal-Strip: MSW/undici unter jsdom akzeptiert die jsdom-
 * AbortSignal-Instanz nicht zuverlässig — wir strippen sie über einen
 * `api.get`-Spy (Muster `useDashboardData.test.tsx`).
 */

import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { server } from '@/tests/server';
import { api } from '@/lib/api';
import type { ReportAggregateResponse } from '@/lib/types';

import { useReportQuery } from './useReportQuery';
import type { ReportRunInput } from './useReportQuery';

function body(label: string): ReportAggregateResponse {
  return {
    dimension: 'measuring_point',
    granularity: 'total',
    from_date: null,
    to_date: null,
    partial: false,
    rows: [
      {
        group_key: 1,
        group_label: label,
        meter_type: 'electricity',
        unit: 'kWh',
        direction: 'bezug',
        period_start: null,
        period_end: null,
        consumption: '1',
      },
    ],
  };
}

function input(queryA: string, queryB: string | null = null): ReportRunInput {
  return { queryA, queryB, dimension: 'measuring_point', granularity: 'total' };
}

beforeEach(() => {
  const real = api.get;
  vi.spyOn(api, 'get').mockImplementation(<T,>(path: string) => real<T>(path));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useReportQuery', () => {
  it('lädt nichts, solange execute() nicht aufgerufen wurde', () => {
    const { result } = renderHook(() => useReportQuery(input('dimension=measuring_point')));

    expect(result.current.run).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.stale).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('execute() lädt Haupt- und Vergleichsquery und setzt run', async () => {
    server.use(
      http.get('/api/v1/reports/aggregate', ({ request }) => {
        const g = new URL(request.url).searchParams.get('granularity');
        return HttpResponse.json(body(g === 'total' ? 'A' : 'B'));
      }),
    );
    const { result } = renderHook(() =>
      useReportQuery(input('granularity=total', 'granularity=month')),
    );

    act(() => result.current.execute());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.run).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.run?.result.rows[0]?.group_label).toBe('A');
    expect(result.current.run?.resultB?.rows[0]?.group_label).toBe('B');
    expect(result.current.run?.input.queryA).toBe('granularity=total');
  });

  it('stale kippt, wenn sich die anstehende Query nach dem Lauf ändert', async () => {
    server.use(http.get('/api/v1/reports/aggregate', () => HttpResponse.json(body('A'))));
    const { result, rerender } = renderHook(({ q }: { q: string }) => useReportQuery(input(q)), {
      initialProps: { q: 'dimension=owner' },
    });

    act(() => result.current.execute());
    await waitFor(() => expect(result.current.run).not.toBeNull());
    expect(result.current.stale).toBe(false);

    rerender({ q: 'dimension=location' });
    expect(result.current.stale).toBe(true);
    // Der alte Lauf bleibt sichtbar, bis erneut ausgewertet wird.
    expect(result.current.run?.input.queryA).toBe('dimension=owner');

    act(() => result.current.execute());
    await waitFor(() => expect(result.current.run?.input.queryA).toBe('dimension=location'));
    expect(result.current.stale).toBe(false);
  });

  it('ein zweiter execute() verdrängt den ersten — nur die jüngste Antwort zählt', async () => {
    server.use(
      http.get('/api/v1/reports/aggregate', async ({ request }) => {
        const d = new URL(request.url).searchParams.get('dimension');
        if (d === 'owner') {
          await delay(50);
          return HttpResponse.json(body('langsam'));
        }
        return HttpResponse.json(body('schnell'));
      }),
    );
    const { result, rerender } = renderHook(({ q }: { q: string }) => useReportQuery(input(q)), {
      initialProps: { q: 'dimension=owner' },
    });

    act(() => result.current.execute());
    rerender({ q: 'dimension=location' });
    act(() => result.current.execute());

    await waitFor(() => expect(result.current.run?.result.rows[0]?.group_label).toBe('schnell'));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(result.current.run?.result.rows[0]?.group_label).toBe('schnell');
  });

  it('ein Fehler setzt error und lässt den letzten Lauf stehen', async () => {
    server.use(http.get('/api/v1/reports/aggregate', () => HttpResponse.json(body('A'))));
    const { result } = renderHook(() => useReportQuery(input('dimension=owner')));
    act(() => result.current.execute());
    await waitFor(() => expect(result.current.run).not.toBeNull());

    server.use(
      http.get('/api/v1/reports/aggregate', () =>
        HttpResponse.json({ title: 'Serverfehler', status: 500 }, { status: 500 }),
      ),
    );
    act(() => result.current.execute());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.run?.result.rows[0]?.group_label).toBe('A');
  });
});
