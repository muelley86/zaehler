/**
 * Smoke-Tests für das vereinfachte Dashboard: globale View-Controls
 * (Granularität/Diagrammtyp), der einklappbare Filter inkl. neuem
 * Messstellen-Filter, und der Vergleichs-Chart pro (Zählerart, Einheit)-Gruppe.
 * Recharts-Internals werden bewusst NICHT geprüft (ResponsiveContainer hat in
 * jsdom keine Maße) — Fokus liegt auf Steuer-State, localStorage-Persistenz,
 * dem gebündelten `/dashboard`-Refetch und der Gruppen-/Leerzustand-Logik.
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
import type { ConsumptionPoint, MeasuringPointRead } from '@/lib/types';

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

const STROM_MP: MeasuringPointRead = { ...MP, id: 2, name: 'Strom Haus', type: 'electricity' };

function cp(periodEnd: string, consumption: string, unit: string, obis = 'r'): ConsumptionPoint {
  return {
    period_start: periodEnd,
    period_end: periodEnd,
    register_id: 0,
    obis_code: obis,
    consumption,
    unit,
  };
}

/** Registriert die vom Dashboard aufgerufenen Endpoints (MPs, Locations, der
 *  gebündelte /dashboard-Load). Liefert die je /dashboard-Request gesehenen
 *  `granularity`-Werte zurück. */
function mockEndpoints(
  mps: MeasuringPointRead[] = [MP],
  items: unknown[] = [],
): {
  granularityCalls: string[];
} {
  const granularityCalls: string[] = [];
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json(mps)),
    http.get('/api/v1/locations', () => HttpResponse.json([])),
    http.get('/api/v1/dashboard', ({ request }) => {
      const g = new URL(request.url).searchParams.get('granularity');
      if (g) granularityCalls.push(g);
      return HttpResponse.json({ items });
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
  window.sessionStorage.clear();
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

  it('bietet einen Messstellen-Filter, dessen Optionen mit der Zählerart kaskadieren', async () => {
    mockEndpoints([MP, STROM_MP]);
    renderWithRouter(<DashboardPage />);
    await screen.findByRole('button', { name: 'Monat' });

    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));

    // Messstellen-Dropdown listet zunächst beide Messstellen.
    // Hinweis: `Dropdown` schließt nur bei `mousedown` außerhalb — unter jsdom
    // löst `fireEvent.click` das nicht aus, daher jedes Dropdown vor dem
    // nächsten explizit per erneutem Trigger-Klick wieder zuklappen.
    fireEvent.click(await screen.findByRole('button', { name: 'Messstellen' }));
    expect(await screen.findByRole('checkbox', { name: 'Wasser Garten' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Strom Haus' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Messstellen' })); // zuklappen

    // Zählerart = Wasser → die Strom-Messstelle verschwindet aus den Optionen.
    // (Zählerart-Dropdown bleibt offen; die Checkbox-Namen sind eindeutig, daher
    // unkritisch — das Messstellen-Panel wird separat geöffnet.)
    fireEvent.click(screen.getByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));

    fireEvent.click(screen.getByRole('button', { name: 'Messstellen' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Strom Haus' })).toBeNull());
    expect(screen.getByRole('checkbox', { name: 'Wasser Garten' })).toBeInTheDocument();
  });
});

describe('DashboardPage — Vergleichs-Charts', () => {
  it('rendert je (Zählerart, Einheit)-Gruppe eine Section mit Header', async () => {
    mockEndpoints(
      [MP, STROM_MP],
      [
        {
          measuring_point_id: 1,
          consumption: [cp('2024-01-31', '5', 'm³')],
          readings: [],
          state: [],
        },
        {
          measuring_point_id: 2,
          consumption: [cp('2024-01-31', '120', 'kWh', '1.8.0')],
          readings: [],
          state: [],
        },
      ],
    );
    renderWithRouter(<DashboardPage />);

    // Section-Header sind divs (keine heading-Rolle) → per Text prüfen.
    expect(await screen.findByText('Strom · kWh')).toBeInTheDocument();
    expect(screen.getByText('Wasser · m³')).toBeInTheDocument();
  });

  it('zeigt einen Leerzustand, wenn es Messstellen, aber keinen Verbrauch im Zeitraum gibt', async () => {
    mockEndpoints([MP], [{ measuring_point_id: 1, consumption: [], readings: [], state: [] }]);
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText(/Kein Verbrauch im gewählten Zeitraum/)).toBeInTheDocument();
  });

  it('Diagrammtyp auf Balken umschalten crasht nicht (Chart bleibt gerendert)', async () => {
    mockEndpoints(
      [MP],
      [
        {
          measuring_point_id: 1,
          consumption: [cp('2024-01-31', '5', 'm³')],
          readings: [],
          state: [],
        },
      ],
    );
    renderWithRouter(<DashboardPage />);
    await screen.findByText('Wasser · m³');

    fireEvent.click(screen.getByRole('button', { name: 'Balken' }));
    expect(screen.getByText('Wasser · m³')).toBeInTheDocument();
  });
});
