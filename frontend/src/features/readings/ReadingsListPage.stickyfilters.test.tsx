/**
 * Integrationstests fuer „Filter merken" auf der Erfassungs-Liste:
 *  - der geteilte Datumsbereich (sessionStorage) fliesst in die /entries-Query,
 *  - kategoriale Filter werden je Seite in sessionStorage gespiegelt,
 *  - bei deaktivierter Option wird nichts persistiert (Regressions-Guard).
 *
 * Auth + AbortSignal-Strip wie in ReadingsListPage.test.tsx.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import { api } from '@/lib/api';

import { ReadingsListPage } from './ReadingsListPage';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const MP = {
  id: 1,
  name: 'Strom Hauptzähler',
  type: 'electricity',
  location_id: null,
  location_name: null,
  main_location_id: null,
  main_location_name: null,
  contract_number: null,
  market_location: null,
  installation_location: null,
  current_owner_id: null,
  current_owner_name: null,
  is_bidirectional: false,
  has_dual_tariff: false,
  tank_capacity: null,
  transformer_factor: null,
  heating_source: null,
  physical_meters: [
    {
      id: 10,
      serial_number: 'SN-1',
      installed_at: '2024-01-01',
      removed_at: null,
      registers: [
        {
          id: 100,
          obis_code: '1.8.0',
          label: 'Bezug',
          unit: 'kWh',
          is_active: true,
          max_value: '0',
          accepts_deliveries: false,
        },
      ],
    },
  ],
};

/** Query-aware /entries-Mock, der die gesehenen from_at/to_at festhaelt. */
function mockEndpoints(): { dateParams: Array<{ from: string | null; to: string | null }> } {
  const dateParams: Array<{ from: string | null; to: string | null }> = [];
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
    http.get('/api/v1/entries', ({ request }) => {
      const sp = new URL(request.url).searchParams;
      dateParams.push({ from: sp.get('from_at'), to: sp.get('to_at') });
      return HttpResponse.json({ items: [], total: 0 });
    }),
  );
  return { dateParams };
}

beforeEach(() => {
  const realGet = api.get;
  vi.spyOn(api, 'get').mockImplementation(<T,>(path: string): Promise<T> => realGet<T>(path));
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ReadingsListPage — Filter merken', () => {
  it('konsumiert den globalen Datumsbereich in der /entries-Query', async () => {
    // Globaler Datumsbereich ist immer aktiv (unabhängig von „Filter merken").
    window.sessionStorage.setItem(
      'app.dateRange',
      JSON.stringify({ from: '2025-06-01', to: '2025-06-30' }),
    );
    const { dateParams } = mockEndpoints();

    renderWithRouter(<ReadingsListPage />);

    await waitFor(() =>
      expect(dateParams.some((p) => p.from === '2025-06-01T00:00:00')).toBe(true),
    );
    expect(dateParams.some((p) => p.to === '2025-06-30T23:59:59')).toBe(true);
  });

  it('spiegelt den Zählerart-Filter je Seite in sessionStorage, wenn die Option aktiv ist', async () => {
    window.localStorage.setItem('filters.remember', '1');
    mockEndpoints();

    renderWithRouter(<ReadingsListPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.readings.type')).toContain('water'),
    );
  });

  it('persistiert nichts, wenn „Filter merken" deaktiviert ist (Default)', async () => {
    mockEndpoints();

    renderWithRouter(<ReadingsListPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));

    // Kurz warten, damit ein etwaiger Persist-Effekt liefe — und dann pruefen,
    // dass nichts geschrieben wurde.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Wasser' })).toBeChecked());
    expect(window.sessionStorage.getItem('filters.readings.type')).toBeNull();
  });
});

describe('ReadingsListPage — Deep-Link aus der MP-Detailansicht', () => {
  it('konsumiert ?mp=&obis= aus der URL und filtert die /entries-Query danach', async () => {
    const seen: Array<{ mp: string[]; obis: string[] }> = [];
    server.use(
      http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
      http.get('/api/v1/entries', ({ request }) => {
        const sp = new URL(request.url).searchParams;
        seen.push({ mp: sp.getAll('measuring_point_id'), obis: sp.getAll('obis') });
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );

    renderWithRouter(<ReadingsListPage />, {
      initialEntries: ['/erfassungen?mp=1&obis=1.8.0'],
    });

    await waitFor(() =>
      expect(seen.some((s) => s.mp.includes('1') && s.obis.includes('1.8.0'))).toBe(true),
    );
  });
});
