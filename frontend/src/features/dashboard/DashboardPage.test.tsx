/**
 * Smoke-Tests für die globalen Dashboard-View-Controls und den einklappbaren
 * Filter. Recharts-Internals werden bewusst NICHT geprüft (ResponsiveContainer
 * hat in jsdom keine Maße) — Fokus liegt auf Steuer-State, localStorage-
 * Persistenz, dem gebündelten `/dashboard`-Refetch und der Collapse-Mechanik.
 *
 * AbortSignal-Strip: Das Dashboard lädt `/dashboard` mit einem AbortSignal; unter
 * jsdom akzeptiert undici-`fetch` (MSW) die jsdom-AbortSignal-Instanz nicht — wir
 * strippen es pro Test über einen `api.get`-Spy (siehe ReadingsListPage.test.tsx).
 */

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import { api } from '@/lib/api';
import type { MeasuringPointRead, RegisterStateRead } from '@/lib/types';

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
  kostenstelle: null,
  physical_meters: [],
};

/** Registriert die vom Dashboard aufgerufenen Endpoints (MPs, Locations, der
 *  gebündelte /dashboard-Load). Liefert die je /dashboard-Request gesehenen
 *  `granularity`-Werte zurück. */
function mockEndpoints(): { granularityCalls: string[] } {
  const granularityCalls: string[] = [];
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
    http.get('/api/v1/locations', () => HttpResponse.json([])),
    http.get('/api/v1/dashboard', ({ request }) => {
      const g = new URL(request.url).searchParams.get('granularity');
      if (g) granularityCalls.push(g);
      return HttpResponse.json({ items: [] });
    }),
  );
  return { granularityCalls };
}

beforeEach(() => {
  // AbortSignal unter jsdom strippen (siehe Datei-Kommentar).
  const realGet = api.get;
  vi.spyOn(api, 'get').mockImplementation(<T,>(path: string): Promise<T> => realGet<T>(path));
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('DashboardPage — globale View-Controls', () => {
  it('Default-Granularität für das laufende Jahr ist Monat', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    const monat = await screen.findByRole('button', { name: 'Monat' });
    expect(monat).toHaveAttribute('aria-pressed', 'true');
  });

  it('Granularität umschalten persistiert und löst /dashboard-Refetch mit dem Query-Param aus', async () => {
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

  it('zeigt während eines Refetch ein Lade-Feedback, das danach verschwindet', async () => {
    // Den zweiten /dashboard-Request (nach dem Granularitäts-Klick) gaten, damit
    // das „Aktualisiere…"-Feedback deterministisch sichtbar wird — kein Timing.
    let calls = 0;
    let release: () => void = () => {};
    server.use(
      http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
      http.get('/api/v1/locations', () => HttpResponse.json([])),
      http.get('/api/v1/dashboard', async () => {
        calls += 1;
        if (calls >= 2) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return HttpResponse.json({ items: [] });
      }),
    );

    renderWithRouter(<DashboardPage />);
    const tag = await screen.findByRole('button', { name: 'Tag' });
    await waitFor(() => expect(screen.queryByText('Aktualisiere…')).toBeNull());

    fireEvent.click(tag);
    expect(await screen.findByText('Aktualisiere…')).toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.queryByText('Aktualisiere…')).toBeNull());
  });
});

const TANK_MP: MeasuringPointRead = {
  ...MP,
  name: 'Heizöl Tank',
  type: 'heating',
  heating_source: 'oil',
};

const TANK_STATE: RegisterStateRead = {
  register_id: 99,
  physical_meter_id: 9,
  obis_code: 'heat.1',
  label: 'Tankstand',
  unit: 'L',
  is_active: true,
  accepts_deliveries: true,
  last_reading_at: '2026-05-01T08:00:00Z',
  last_reading_value: '2000',
  refilled_since: '0',
  current_value: '1800',
};

describe('DashboardPage — Bestandskorrektur', () => {
  it('sendet reading_at als UTC-ISO (…Z), nicht als lokale Wanduhrzeit', async () => {
    // Akkordeon (Ohne Hauptstandort → Ohne Zählerstandort) vorab aufklappen,
    // damit die Karte + Tank-Kachel rendern.
    window.localStorage.setItem(
      'dashboard.expandedMainLocations',
      JSON.stringify(['__no_main_location__']),
    );
    window.localStorage.setItem(
      'dashboard.expandedLocations',
      JSON.stringify(['__no_main_location__::__no_location__']),
    );

    const readingBodies: Array<{ reading_at?: string }> = [];
    server.use(
      http.get('/api/v1/measuring-points', () => HttpResponse.json([TANK_MP])),
      http.get('/api/v1/locations', () => HttpResponse.json([])),
      http.get('/api/v1/dashboard', () =>
        HttpResponse.json({
          items: [{ measuring_point_id: 1, consumption: [], readings: [], state: [TANK_STATE] }],
        }),
      ),
      http.post('/api/v1/readings', async ({ request }) => {
        readingBodies.push((await request.json()) as { reading_at?: string });
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    renderWithRouter(<DashboardPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Bestand korrigieren' }));
    // Wert ist aus current_value vorbefüllt → direkt speichern.
    fireEvent.click(await screen.findByRole('button', { name: /Korrektur speichern/ }));

    await waitFor(() => expect(readingBodies.length).toBe(1));
    expect(readingBodies[0]?.reading_at).toMatch(/Z$/);
  });
});

describe('DashboardPage — einklappbarer Filter', () => {
  it('ist per Default eingeklappt; nach Aufklappen filtert das Dropdown, Badge zählt aktive', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    await screen.findByRole('button', { name: 'Monat' });

    // Eingeklappt: die Filter-Dropdowns sind nicht im DOM.
    expect(screen.queryByRole('button', { name: 'Zählerart' })).toBeNull();

    // Filter-Sektion aufklappen.
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));

    // Zählerart-Dropdown öffnen und "Wasser" ankreuzen → Badge "1 aktiv".
    fireEvent.click(await screen.findByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();
  });
});
