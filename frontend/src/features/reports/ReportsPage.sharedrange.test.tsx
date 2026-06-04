/**
 * „Aktueller Zeitraum" (shared_range) in den Auswertungen: bei Auswahl folgt der
 * Report dem globalen Datumsbereich (sessionStorage `app.dateRange`) und sendet
 * dessen from_at/to_at an /reports/aggregate.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointRead } from '@/lib/types';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ me: { role: 'admin' } }),
}));

import { ReportsPage } from './ReportsPage';

const MP: MeasuringPointRead = {
  id: 1,
  name: 'Strom Halle',
  type: 'electricity',
  location_id: null,
  location_name: null,
  main_location_id: null,
  main_location_name: null,
  is_bidirectional: false,
  has_dual_tariff: false,
  tank_capacity: null,
  transformer_factor: null,
  heating_source: null,
  contract_number: null,
  market_location: null,
  installation_location: null,
  current_owner_id: null,
  current_owner_name: null,
  kostenstelle: 10001,
  physical_meters: [],
};

function mockEndpoints(): { dateParams: Array<{ from: string | null; to: string | null }> } {
  const dateParams: Array<{ from: string | null; to: string | null }> = [];
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
    http.get('/api/v1/report-configs', () => HttpResponse.json([])),
    http.get('/api/v1/reports/aggregate', ({ request }) => {
      const sp = new URL(request.url).searchParams;
      dateParams.push({ from: sp.get('from_at'), to: sp.get('to_at') });
      return HttpResponse.json({
        dimension: 'measuring_point',
        granularity: 'total',
        from_date: null,
        to_date: null,
        partial: false,
        rows: [],
      });
    }),
  );
  return { dateParams };
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ReportsPage — Aktueller Zeitraum (shared_range)', () => {
  it('übernimmt den globalen Datumsbereich in die /reports/aggregate-Query', async () => {
    window.sessionStorage.setItem(
      'app.dateRange',
      JSON.stringify({ from: '2023-01-01', to: '2023-12-31' }),
    );
    const { dateParams } = mockEndpoints();

    renderWithRouter(<ReportsPage />);
    // Erst-Load (Default „Laufendes Jahr") abwarten.
    await waitFor(() => expect(dateParams.length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('Zeitraum'), { target: { value: 'shared_range' } });

    await waitFor(() =>
      expect(dateParams.some((p) => p.from === '2023-01-01' && p.to === '2023-12-31')).toBe(true),
    );
  });
});
