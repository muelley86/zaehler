/**
 * Smoke-Tests für die globalen Dashboard-View-Controls und den einklappbaren
 * Filter. Recharts-Internals werden bewusst NICHT geprüft (ResponsiveContainer
 * hat in jsdom keine Maße) — Fokus liegt auf Steuer-State, localStorage-
 * Persistenz, Refetch-Query-Parametern und der Filter-Collapse-Mechanik.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointRead } from '@/lib/types';

import { DashboardPage } from './DashboardPage';

const MP: MeasuringPointRead = {
  id: 1,
  name: 'Wasser Garten',
  type: 'water',
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
  physical_meters: [],
};

/** Registriert alle vom Dashboard aufgerufenen Endpoints. Liefert die Liste
 *  der je consumption-Request gesehenen `granularity`-Werte zurück. */
function mockEndpoints(): { granularityCalls: string[] } {
  const granularityCalls: string[] = [];
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
    http.get('/api/v1/locations', () => HttpResponse.json([])),
    http.get('/api/v1/measuring-points/:id/state', () => HttpResponse.json([])),
    http.get('/api/v1/measuring-points/:id/consumption', ({ request }) => {
      const g = new URL(request.url).searchParams.get('granularity');
      if (g) granularityCalls.push(g);
      return HttpResponse.json([]);
    }),
    http.get('/api/v1/readings', () => HttpResponse.json([])),
  );
  return { granularityCalls };
}

afterEach(() => {
  window.localStorage.clear();
});

describe('DashboardPage — globale View-Controls', () => {
  it('Default-Granularität für das laufende Jahr ist Monat', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    const monat = await screen.findByRole('button', { name: 'Monat' });
    expect(monat).toHaveAttribute('aria-pressed', 'true');
  });

  it('Granularität umschalten persistiert und löst Refetch mit dem Query-Param aus', async () => {
    const { granularityCalls } = mockEndpoints();
    renderWithRouter(<DashboardPage />);
    const tag = await screen.findByRole('button', { name: 'Tag' });

    fireEvent.click(tag);

    await waitFor(() => expect(granularityCalls).toContain('day'));
    expect(window.localStorage.getItem('dashboard.granularity')).toBe('day');
    expect(tag).toHaveAttribute('aria-pressed', 'true');
  });

  it('Diagrammtyp umschalten persistiert', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    const balken = await screen.findByRole('button', { name: 'Balken' });

    fireEvent.click(balken);

    await waitFor(() => expect(window.localStorage.getItem('dashboard.chartType')).toBe('bar'));
    expect(balken).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('DashboardPage — einklappbarer Filter', () => {
  it('ist per Default eingeklappt und zeigt nach Aufklappen alle Filter; Badge zählt aktive', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    await screen.findByRole('button', { name: 'Monat' });

    // Eingeklappt: kategoriale Filter-Pills sind nicht im DOM.
    expect(screen.queryByRole('button', { name: 'Wasser' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));

    const wasser = await screen.findByRole('button', { name: 'Wasser' });
    expect(wasser).toBeInTheDocument();

    // Filter aktivieren → Badge erscheint.
    fireEvent.click(wasser);
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();
  });
});
