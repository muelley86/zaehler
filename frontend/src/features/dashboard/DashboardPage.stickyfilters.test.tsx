/**
 * Integrationstests fuer „Filter merken" auf dem Dashboard: bei aktiver Option
 * werden die kategorialen Filter in sessionStorage gespiegelt und beim Laden
 * daraus wiederhergestellt; „Filter zuruecksetzen" raeumt sie wieder. Bei
 * deaktivierter Option (Default) wird nichts persistiert (Regressions-Guard).
 *
 * Die Testumgebung ist mobil (matchMedia matcht nie) — die Filter-Dropdowns
 * liegen deshalb im Sheet.
 *
 * AbortSignal-Strip wie in DashboardPage.test.tsx (jsdom + undici-fetch).
 */

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import { api } from '@/lib/api';

import { dashboardItem, dashboardResponse } from './testFixtures';
import { clearDashboardCache } from './useDashboardData';
import { DashboardPage } from './DashboardPage';

const MP = dashboardItem({ id: 1, name: 'Wasser Garten', type: 'water' });

function mockEndpoints(): void {
  server.use(
    http.get('/api/v1/dashboard', () => HttpResponse.json(dashboardResponse({ items: [MP] }))),
  );
}

/** Öffnet die mobile Filter-Leiste und liefert den Sheet-Dialog. */
async function openFilterSheet(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /^Filter/ }));
  return screen.getByRole('dialog');
}

beforeEach(() => {
  clearDashboardCache();
  const realGetWithMeta = api.getWithMeta;
  vi.spyOn(api, 'getWithMeta').mockImplementation(<T,>(path: string) => realGetWithMeta<T>(path));
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
    const dialog = await openFilterSheet();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));
    expect(await screen.findByRole('button', { name: 'Filter (1 aktiv)' })).toBeInTheDocument();

    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.dashboard.type')).toContain('water'),
    );
  });

  it('spiegelt den Messstellen-Filter (IDs) in sessionStorage, wenn die Option aktiv ist', async () => {
    window.localStorage.setItem('filters.remember', '1');
    mockEndpoints();

    renderWithRouter(<DashboardPage />);
    const dialog = await openFilterSheet();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Messstellen' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser Garten' }));
    expect(await screen.findByRole('button', { name: 'Filter (1 aktiv)' })).toBeInTheDocument();

    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.dashboard.measuringPoint')).toContain('1'),
    );
  });

  it('stellt einen gemerkten Filter beim Laden wieder her und der Reset räumt ihn', async () => {
    window.localStorage.setItem('filters.remember', '1');
    window.sessionStorage.setItem('filters.dashboard.type', JSON.stringify(['water']));
    mockEndpoints();

    renderWithRouter(<DashboardPage />);

    // Wiederhergestellt: der Filter-Button nennt die aktive Auswahl sofort.
    const dialog = await openFilterSheet();
    expect(screen.getByRole('button', { name: 'Filter (1 aktiv)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zählerart: Wasser entfernen' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Filter zurücksetzen' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Filter (1 aktiv)' })).toBeNull(),
    );
    expect(window.sessionStorage.getItem('filters.dashboard.type')).not.toContain('water');
  });

  it('persistiert nichts, wenn „Filter merken" deaktiviert ist (Default)', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    const dialog = await openFilterSheet();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));
    expect(await screen.findByRole('button', { name: 'Filter (1 aktiv)' })).toBeInTheDocument();

    expect(window.sessionStorage.getItem('filters.dashboard.type')).toBeNull();
  });
});
