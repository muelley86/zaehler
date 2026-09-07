/**
 * Smoke-Tests für das Dashboard: Diagramm-Einstellungen (Granularität/
 * Diagrammtyp), die Filterleiste (mobil im Sheet, auf Desktop inline), die
 * KPI-Kacheln inkl. Vorperioden-Delta, Hinweise, Top-Verbraucher und der
 * Vergleichs-Chart pro (Zählerart, Einheit)-Gruppe.
 *
 * `ComparisonChart` ist gemockt: Recharts-Internals werden hier bewusst NICHT
 * geprüft (ResponsiveContainer hat in jsdom keine Maße und ist in der vollen
 * Suite spürbar langsam) — das Diagramm selbst deckt `ComparisonChart.test.tsx`
 * ab. Fokus liegt auf Steuer-State, localStorage-Persistenz, dem gebündelten
 * `/dashboard`-Refetch und der Gruppen-/Leerzustand-Logik.
 *
 * Die Seite spricht ausschließlich `/api/v1/dashboard` an; der MSW-Server läuft
 * mit `onUnhandledRequest: 'error'` und schlägt bei jedem anderen Request an.
 *
 * AbortSignal-Strip: Das Dashboard lädt `/dashboard` mit einem AbortSignal; unter
 * jsdom akzeptiert undici-`fetch` (MSW) die jsdom-AbortSignal-Instanz nicht — wir
 * strippen es pro Test über einen `api.getWithMeta`-Spy.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import { api } from '@/lib/api';
import { DESKTOP_QUERY } from '@/lib/useMediaQuery';
import type { DashboardMeasuringPoint, DashboardVirtualMeasuringPoint } from '@/lib/types';

import { cp, dashboardItem, dashboardResponse, virtualItem } from './testFixtures';
import { clearDashboardCache } from './useDashboardData';
import { DashboardPage } from './DashboardPage';

vi.mock('./ComparisonChart', () => ({
  ComparisonChart: ({ groupId, chartType }: { groupId: string; chartType: string }) => (
    <div data-testid="comparison-chart" data-chart-type={chartType}>
      {groupId}
    </div>
  ),
}));

const MP = dashboardItem({ id: 1, name: 'Wasser Garten', type: 'water' });
const STROM_MP = dashboardItem({ id: 2, name: 'Strom Haus', type: 'electricity' });

/** Verrechnete Messstelle: Netto-Reihe 120 − 20 = 100 kWh, keine Vorperiode. */
const VMP = virtualItem({
  id: 9,
  name: 'PV-Saldo',
  type: 'electricity',
  consumption: [
    cp('2024-01-31', '120', 'kWh', 'virtual'),
    cp('2024-02-29', '-20', 'kWh', 'virtual'),
  ],
  totals: [
    { obis_code: 'virtual', unit: 'kWh', direction: 'bezug', current: '100', previous: '0' },
  ],
});

/** Registriert den einzigen vom Dashboard genutzten Endpoint und protokolliert die Granularitäten. */
function mockEndpoints(
  items: DashboardMeasuringPoint[] = [MP],
  virtualItems: DashboardVirtualMeasuringPoint[] = [],
): { granularityCalls: string[] } {
  const granularityCalls: string[] = [];
  server.use(
    http.get('/api/v1/dashboard', ({ request }) => {
      const g = new URL(request.url).searchParams.get('granularity');
      if (g) granularityCalls.push(g);
      return HttpResponse.json(dashboardResponse({ items, virtual_items: virtualItems }));
    }),
  );
  return { granularityCalls };
}

/** Stellt `matchMedia` so, dass `useIsDesktop()` true liefert. */
function mockDesktop(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const mql = {
      matches: query === DESKTOP_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    return mql as unknown as MediaQueryList;
  });
}

async function openChartSettings(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Diagramm-Einstellungen' }));
}

/** Öffnet die mobile Filter-Leiste und liefert den Sheet-Dialog. */
async function openFilterSheet(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /^Filter( \(\d+ aktiv\))?$/ }));
  return screen.getByRole('dialog');
}

beforeEach(() => {
  clearDashboardCache();
  // AbortSignal unter jsdom strippen (siehe Datei-Kommentar).
  const realGetWithMeta = api.getWithMeta;
  vi.spyOn(api, 'getWithMeta').mockImplementation(<T,>(path: string) => realGetWithMeta<T>(path));
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('DashboardPage — Diagramm-Einstellungen', () => {
  it('Default-Granularität für den Standard-Bereich (letzter + laufender Monat) ist Woche', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    await openChartSettings();

    expect(screen.getByRole('button', { name: 'Woche' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Default-Granularität für einen Jahres-Bereich ist Monat', async () => {
    window.sessionStorage.setItem(
      'app.dateRange',
      JSON.stringify({ from: '2026-01-01', to: '2026-12-31' }),
    );
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    await openChartSettings();

    expect(screen.getByRole('button', { name: 'Monat' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Granularität umschalten persistiert und löst /dashboard-Refetch mit dem Query-Param aus', async () => {
    const { granularityCalls } = mockEndpoints();
    renderWithRouter(<DashboardPage />);
    await openChartSettings();
    const tag = screen.getByRole('button', { name: 'Tag' });

    fireEvent.click(tag);

    await waitFor(() => expect(granularityCalls).toContain('day'));
    expect(window.localStorage.getItem('dashboard.granularity')).toBe('day');
    expect(tag).toHaveAttribute('aria-pressed', 'true');
  });

  it('Diagrammtyp umschalten persistiert', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    await openChartSettings();
    const balken = screen.getByRole('button', { name: 'Balken' });

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
      http.get('/api/v1/dashboard', async () => {
        calls += 1;
        if (calls >= 2) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return HttpResponse.json(dashboardResponse({ items: [MP] }));
      }),
    );

    renderWithRouter(<DashboardPage />);
    await openChartSettings();
    await waitFor(() => expect(screen.queryByText('Aktualisiere…')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Tag' }));
    expect(await screen.findByText('Aktualisiere…')).toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.queryByText('Aktualisiere…')).toBeNull());
  });
});

describe('DashboardPage — Filter', () => {
  it('zeigt die Dropdowns erst im Sheet; die Auswahl erscheint als Chip und im Button-Namen', async () => {
    mockEndpoints();
    renderWithRouter(<DashboardPage />);
    const dialog = await openFilterSheet();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));

    expect(await screen.findByRole('button', { name: 'Filter (1 aktiv)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zählerart: Wasser entfernen' })).toBeInTheDocument();
  });

  it('bietet einen Messstellen-Filter, dessen Optionen mit der Zählerart kaskadieren', async () => {
    mockEndpoints([MP, STROM_MP]);
    renderWithRouter(<DashboardPage />);
    const dialog = await openFilterSheet();

    // Messstellen-Dropdown listet zunächst beide Messstellen.
    // Hinweis: `Dropdown` schließt nur bei `mousedown` außerhalb — unter jsdom
    // löst `fireEvent.click` das nicht aus, daher jedes Dropdown vor dem
    // nächsten explizit per erneutem Trigger-Klick wieder zuklappen.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Messstellen' }));
    expect(await screen.findByRole('checkbox', { name: 'Wasser Garten' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Strom Haus' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Messstellen' })); // zuklappen

    fireEvent.click(within(dialog).getByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser' }));
    // Nach der Auswahl trägt der Trigger zusätzlich das Aktiv-Badge im Namen.
    fireEvent.click(within(dialog).getByRole('button', { name: /^Zählerart/ })); // zuklappen

    fireEvent.click(within(dialog).getByRole('button', { name: 'Messstellen' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Strom Haus' })).toBeNull());
    expect(screen.getByRole('checkbox', { name: 'Wasser Garten' })).toBeInTheDocument();
  });

  it('zeigt die Filter auf Desktop inline statt im Sheet', async () => {
    mockDesktop();
    mockEndpoints();
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByRole('button', { name: 'Zählerart' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Filter$/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('DashboardPage — Leerzustände', () => {
  it('zeigt einen Leerzustand, wenn es noch keine Messstellen gibt', async () => {
    mockEndpoints([]);
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('Noch keine Messstellen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Messstelle anlegen' })).toHaveAttribute(
      'href',
      '/admin/messstellen',
    );
  });

  it('zeigt einen Leerzustand, wenn der Filter alle Messstellen ausblendet', async () => {
    mockEndpoints([MP]);
    renderWithRouter(<DashboardPage />);
    const dialog = await openFilterSheet();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Zählerart' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Strom' }));

    expect(await screen.findByText('Keine Messstellen entsprechen dem Filter')).toBeInTheDocument();
  });

  it('zeigt einen Leerzustand, wenn es Messstellen, aber keinen Verbrauch im Zeitraum gibt', async () => {
    mockEndpoints([MP]);
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText(/Kein Verbrauch im gewählten Zeitraum/)).toBeInTheDocument();
  });
});

describe('DashboardPage — Vergleichs-Charts', () => {
  const WASSER_MIT_VERBRAUCH = dashboardItem({
    id: 1,
    name: 'Wasser Garten',
    type: 'water',
    consumption: [cp('2024-01-31', '5', 'm³')],
  });

  it('rendert je (Zählerart, Einheit)-Gruppe eine Section mit Header', async () => {
    mockEndpoints([
      WASSER_MIT_VERBRAUCH,
      dashboardItem({
        id: 2,
        name: 'Strom Haus',
        type: 'electricity',
        consumption: [cp('2024-01-31', '120', 'kWh', '1.8.0')],
      }),
    ]);
    renderWithRouter(<DashboardPage />);

    // Section-Header sind divs (keine heading-Rolle) → per Text prüfen.
    expect(await screen.findByText('Strom · kWh')).toBeInTheDocument();
    expect(screen.getByText('Wasser · m³')).toBeInTheDocument();
  });

  it('Filter ausschließlich auf eine verrechnete Messstelle blendet echte Messstellen aus', async () => {
    mockEndpoints([WASSER_MIT_VERBRAUCH], [VMP]);
    renderWithRouter(<DashboardPage />);

    // Ungefiltert: beide Gruppen sichtbar (echte Wasser-MP + verrechnete Strom-vmp).
    expect(await screen.findByText('Wasser · m³')).toBeInTheDocument();
    expect(screen.getByText('Strom · kWh')).toBeInTheDocument();

    const dialog = await openFilterSheet();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verrechnete Messstellen' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'PV-Saldo' }));

    await waitFor(() => expect(screen.queryByText('Wasser · m³')).toBeNull());
    expect(screen.getByText('Strom · kWh')).toBeInTheDocument();
  });

  it('Filter auf eine echte Messstelle blendet verrechnete Messstellen aus', async () => {
    mockEndpoints([WASSER_MIT_VERBRAUCH], [VMP]);
    renderWithRouter(<DashboardPage />);
    expect(await screen.findByText('Strom · kWh')).toBeInTheDocument();

    const dialog = await openFilterSheet();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Messstellen' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser Garten' }));

    await waitFor(() => expect(screen.queryByText('Strom · kWh')).toBeNull());
    expect(screen.getByText('Wasser · m³')).toBeInTheDocument();
  });

  it('reicht den gewählten Diagrammtyp an den Chart durch', async () => {
    mockEndpoints([WASSER_MIT_VERBRAUCH]);
    renderWithRouter(<DashboardPage />);
    expect(await screen.findByTestId('comparison-chart')).toHaveAttribute(
      'data-chart-type',
      'line',
    );

    await openChartSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Balken' }));

    expect(screen.getByTestId('comparison-chart')).toHaveAttribute('data-chart-type', 'bar');
    expect(screen.getByText('Wasser · m³')).toBeInTheDocument();
  });
});

describe('DashboardPage — KPI, Hinweise, Top-Verbraucher', () => {
  it('zeigt eine KPI-Kachel je verrechneter Messstelle', async () => {
    mockEndpoints([MP], [VMP]);
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('PV-Saldo (verrechnet)')).toBeInTheDocument();
    // Netto-Summe: 120 − 20 = 100, keine Vorperiode (previous = 0).
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('keine Vergleichsdaten')).toBeInTheDocument();
    // Die Kachel verlinkt auf die Detail-Seite (Komponenten-Aufschlüsselung).
    expect(screen.getByRole('link', { name: 'PV-Saldo (verrechnet)' })).toHaveAttribute(
      'href',
      '/verrechnung/9',
    );
  });

  it('zeigt das Delta einer KPI-Kachel gegenüber der Vorperiode', async () => {
    mockEndpoints([
      dashboardItem({
        id: 2,
        name: 'Strom Haus',
        type: 'electricity',
        totals: [
          { obis_code: '1.8.0', unit: 'kWh', direction: 'bezug', current: '120', previous: '100' },
        ],
      }),
    ]);
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('+20 %')).toBeInTheDocument();
    expect(screen.getByText('Vergleich mit 01.06.2026 – 31.07.2026')).toBeInTheDocument();
  });

  it('weist auf eine lange nicht abgelesene Messstelle hin', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    mockEndpoints([
      dashboardItem({
        id: 1,
        name: 'Wasser Garten',
        type: 'water',
        last_reading_at: sixtyDaysAgo,
      }),
    ]);
    renderWithRouter(<DashboardPage />);

    expect(
      await screen.findByText(/Wasser Garten: letzte Ablesung vor 60 Tagen/),
    ).toBeInTheDocument();
  });

  it('zeigt die Top-Verbraucher mit ihren Anteilen', async () => {
    mockEndpoints([
      dashboardItem({
        id: 1,
        name: 'Wasser Garten',
        type: 'water',
        totals: [{ obis_code: 'r', unit: 'm³', direction: 'bezug', current: '75', previous: null }],
      }),
      dashboardItem({
        id: 2,
        name: 'Wasser Haus',
        type: 'water',
        totals: [{ obis_code: 'r', unit: 'm³', direction: 'bezug', current: '25', previous: null }],
      }),
    ]);
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('Top-Verbraucher · Wasser · m³')).toBeInTheDocument();
    expect(screen.getByText('75 %')).toBeInTheDocument();
    expect(screen.getByText('25 %')).toBeInTheDocument();
  });
});
