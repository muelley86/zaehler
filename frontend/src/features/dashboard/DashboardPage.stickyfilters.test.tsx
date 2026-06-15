/**
 * Integrationstests fuer „Filter merken" auf dem Dashboard: bei aktiver Option
 * werden die kategorialen Filter in sessionStorage gespiegelt und beim Laden
 * daraus wiederhergestellt; „Filter zuruecksetzen" raeumt sie wieder. Bei
 * deaktivierter Option (Default) wird nichts persistiert (Regressions-Guard).
 *
 * AbortSignal-Strip wie in DashboardPage.test.tsx (jsdom + undici-fetch).
 */

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import { api } from '@/lib/api';
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
  current_supplier_id: null,
  current_supplier_name: null,
  current_mieter_id: null,
  current_mieter_name: null,
  kostenstelle: null,
  physical_meters: [],
};

function mockEndpoints(): void {
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
    http.get('/api/v1/locations', () => HttpResponse.json([])),
    http.get('/api/v1/dashboard', () => HttpResponse.json({ items: [] })),
  );
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

describe('DashboardPage — Filter merken', () => {
  it('spiegelt den Zählerart-Filter in sessionStorage, wenn die Option aktiv ist', async () => {
    window.localStorage.setItem('filters.remember', '1');
    mockEndpoints();

    renderWithRouter(<DashboardPage />);
    await screen.findByRole('button', { name: 'Monat' });

    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();

    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.dashboard.type')).toContain('water'),
    );
  });

  it('spiegelt den Messstellen-Filter (IDs) in sessionStorage, wenn die Option aktiv ist', async () => {
    window.localStorage.setItem('filters.remember', '1');
    mockEndpoints();

    renderWithRouter(<DashboardPage />);
    await screen.findByRole('button', { name: 'Monat' });

    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Messstellen' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser Garten' }));
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();

    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.dashboard.measuringPoint')).toContain('1'),
    );
  });

  it('stellt einen gemerkten Filter beim Laden wieder her und der Reset räumt ihn', async () => {
    window.localStorage.setItem('filters.remember', '1');
    window.sessionStorage.setItem('filters.dashboard.type', JSON.stringify(['water']));
    mockEndpoints();

    renderWithRouter(<DashboardPage />);
    await screen.findByRole('button', { name: 'Monat' });

    // Wiederhergestellt: Badge sofort sichtbar (Filter-Sektion noch eingeklappt).
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();

    // Aufklappen (eingeklappt → genau ein /Filter/-Button) und zurücksetzen.
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Filter zurücksetzen' }));

    await waitFor(() => expect(screen.queryByText('1 aktiv')).toBeNull());
    expect(window.sessionStorage.getItem('filters.dashboard.type')).not.toContain('water');
  });

  it('persistiert nichts, wenn „Filter merken" deaktiviert ist (Default)', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    await screen.findByRole('button', { name: 'Monat' });

    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();

    expect(window.sessionStorage.getItem('filters.dashboard.type')).toBeNull();
  });
});
