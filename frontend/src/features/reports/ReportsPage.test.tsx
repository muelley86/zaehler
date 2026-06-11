/**
 * Tests für die Auswertungen-Seite: Rendering der Ergebnis-Tabelle,
 * Refetch bei Dimensionswechsel, partial-Hinweis und Admin-Gating des
 * Speichern-Buttons. Backend-Endpoints via MSW gemockt.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointRead, ReportAggregateResponse } from '@/lib/types';

const auth = vi.hoisted((): { role: 'admin' | 'recorder' } => ({ role: 'admin' }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ me: { role: auth.role } }),
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

function response(partial = false): ReportAggregateResponse {
  return {
    dimension: 'kostenstelle',
    granularity: 'total',
    from_date: null,
    to_date: null,
    partial,
    rows: [
      {
        group_key: 10001,
        group_label: '10001',
        meter_type: 'electricity',
        unit: 'kWh',
        direction: 'bezug',
        period_start: null,
        period_end: null,
        consumption: '1234',
      },
    ],
  };
}

function mockEndpoints(opts: { partial?: boolean } = {}): { dimensionCalls: string[] } {
  const dimensionCalls: string[] = [];
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
    http.get('/api/v1/report-configs', () => HttpResponse.json([])),
    http.get('/api/v1/reports/aggregate', ({ request }) => {
      const d = new URL(request.url).searchParams.get('dimension');
      if (d) dimensionCalls.push(d);
      return HttpResponse.json(response(opts.partial ?? false));
    }),
  );
  return { dimensionCalls };
}

afterEach(() => {
  auth.role = 'admin';
});

describe('ReportsPage', () => {
  it('rendert die Ergebnis-Tabelle aus der Aggregation', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    expect(await screen.findByText('10001')).toBeInTheDocument();
    expect(screen.getByText(/1\.234\s*kWh/)).toBeInTheDocument();
  });

  it('Dimensionswechsel löst Refetch mit neuem dimension-Param aus', async () => {
    const { dimensionCalls } = mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await screen.findByText('10001');
    fireEvent.click(screen.getByRole('button', { name: 'Eigentümer' }));
    await waitFor(() => expect(dimensionCalls).toContain('owner'));
  });

  it('Default-Dimension ist Messstelle (erster Aggregat-Call + aktive Pill)', async () => {
    const { dimensionCalls } = mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await screen.findByText('10001');
    expect(dimensionCalls[0]).toBe('measuring_point');
    expect(screen.getByRole('button', { name: 'Messstelle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('zeigt den partial-Hinweis, wenn das Backend partial=true meldet', async () => {
    mockEndpoints({ partial: true });
    renderWithRouter(<ReportsPage />);
    expect(await screen.findByText(/nur Messstellen mit Zugriff/i)).toBeInTheDocument();
  });

  it('Speichern-Button nur für Admin sichtbar', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    expect(await screen.findByRole('button', { name: /Speichern/ })).toBeInTheDocument();
  });

  it('Erfasser sieht keinen Speichern-Button', async () => {
    auth.role = 'recorder';
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await screen.findByText('10001');
    expect(screen.queryByRole('button', { name: /Speichern/ })).not.toBeInTheDocument();
  });

  it('Einspeise-Zeilen tragen den Zusatz „· Einspeisung"', async () => {
    const body: ReportAggregateResponse = {
      ...response(),
      rows: [
        {
          group_key: 1,
          group_label: 'Solar PV',
          meter_type: 'electricity',
          unit: 'kWh',
          direction: 'einspeisung',
          period_start: null,
          period_end: null,
          consumption: '280',
        },
      ],
    };
    server.use(
      http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
      http.get('/api/v1/report-configs', () => HttpResponse.json([])),
      http.get('/api/v1/reports/aggregate', () => HttpResponse.json(body)),
    );
    renderWithRouter(<ReportsPage />);
    expect(await screen.findByText('Solar PV')).toBeInTheDocument();
    expect(screen.getByText(/· Einspeisung/)).toBeInTheDocument();
  });

  it('Filter-Dropdown sendet den gewählten Filter als Query-Param', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
      http.get('/api/v1/report-configs', () => HttpResponse.json([])),
      http.get('/api/v1/reports/aggregate', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(response());
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<ReportsPage />);
    await screen.findByText('10001');

    // Filter aufklappen und das Kostenstelle-Dropdown im Filterbereich öffnen
    // (entkoppelt von der gleichnamigen Gruppierungs-Dimension-Pill).
    await user.click(screen.getByRole('button', { name: /Messstellen eingrenzen/ }));
    const filterSection = screen.getByText('Messstellen eingrenzen').closest('section')!;
    await user.click(within(filterSection).getByRole('button', { name: 'Kostenstelle' }));
    await user.click(await screen.findByRole('checkbox', { name: '10001' }));

    await waitFor(() => expect(urls.some((u) => u.includes('kostenstelle=10001'))).toBe(true));
  });
});
