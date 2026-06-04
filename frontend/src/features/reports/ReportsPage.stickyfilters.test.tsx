/**
 * Integrationstests fuer „Filter merken" auf der Auswertungen-Seite. Reports
 * bleibt bewusst AUSSERHALB des geteilten Datumsbereichs (eigenes periodKind-
 * Modell), bekommt aber per-Seite-Session-Memory fuer seine Arbeits-Filter
 * (Dimension, Granularitaet, Periode, kategoriale Filter).
 *
 * Die Seite laedt den Report automatisch beim Mount → die wiederhergestellte
 * Dimension fliesst direkt in die /reports/aggregate-Query (End-to-End-Beleg).
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { ReportsPage } from './ReportsPage';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ me: { id: 1, username: 'admin', role: 'admin', is_active: true } }),
}));

const MP = {
  id: 1,
  name: 'Strom Hauptzähler',
  type: 'electricity',
  location_id: 5,
  location_name: 'Keller',
  main_location_id: 2,
  main_location_name: 'Haus',
  contract_number: null,
  market_location: null,
  installation_location: null,
  current_owner_id: 3,
  current_owner_name: 'Müller',
  kostenstelle: 100,
  is_bidirectional: false,
  has_dual_tariff: false,
  tank_capacity: null,
  transformer_factor: null,
  heating_source: null,
  physical_meters: [],
};

function mockEndpoints(): { dims: string[] } {
  const dims: string[] = [];
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
    http.get('/api/v1/report-configs', () => HttpResponse.json([])),
    http.get('/api/v1/reports/aggregate', ({ request }) => {
      const d = new URL(request.url).searchParams.get('dimension');
      if (d) dims.push(d);
      return HttpResponse.json({ rows: [], partial: false });
    }),
  );
  return { dims };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ReportsPage — Filter merken', () => {
  it('stellt die gemerkte Dimension wieder her (fließt in die /reports/aggregate-Query)', async () => {
    window.localStorage.setItem('filters.remember', '1');
    window.sessionStorage.setItem('filters.reports.dimension', 'owner');
    const { dims } = mockEndpoints();

    renderWithRouter(<ReportsPage />);

    await waitFor(() => expect(dims).toContain('owner'));
    expect(dims).not.toContain('measuring_point');
  });

  it('merkt eine geänderte Dimension je Seite in sessionStorage', async () => {
    window.localStorage.setItem('filters.remember', '1');
    mockEndpoints();

    renderWithRouter(<ReportsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kostenstelle' }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.reports.dimension')).toBe('kostenstelle'),
    );
  });

  it('persistiert nichts, wenn „Filter merken" deaktiviert ist (Default)', async () => {
    mockEndpoints();

    renderWithRouter(<ReportsPage />);
    const pill = await screen.findByRole('button', { name: 'Kostenstelle' });
    fireEvent.click(pill);

    await waitFor(() => expect(pill).toHaveAttribute('aria-pressed', 'true'));
    expect(window.sessionStorage.getItem('filters.reports.dimension')).toBeNull();
  });
});
