/**
 * Smoke-Tests für das Dashboard: die Filterleiste (mobil im Sheet, auf
 * Desktop inline), die KPI-Kacheln inkl. Vorperioden-Delta, Hinweise,
 * Top-Verbraucher, Leerzustände und das Refetch-Feedback.
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

/** Wasser-Messstelle mit Bezugs-Total → erscheint als KPI-Kachel und Top-Verbraucher. */
function wasserMitVerbrauch(id: number, name: string): DashboardMeasuringPoint {
  return dashboardItem({
    id,
    name,
    type: 'water',
    totals: [
      { obis_code: 'r', unit: 'm³', direction: 'bezug', current: String(id * 10), previous: null },
    ],
  });
}

/** Registriert den einzigen vom Dashboard genutzten Endpoint und protokolliert die Granularitäten. */
function mockEndpoints(
  items: DashboardMeasuringPoint[] = [MP],
  virtualItems: DashboardVirtualMeasuringPoint[] = [],
  opts: { partial?: boolean } = {},
): { granularityCalls: string[] } {
  const granularityCalls: string[] = [];
  server.use(
    http.get('/api/v1/dashboard', ({ request }) => {
      const g = new URL(request.url).searchParams.get('granularity');
      if (g) granularityCalls.push(g);
      return HttpResponse.json(
        dashboardResponse({ items, virtual_items: virtualItems, partial: opts.partial ?? false }),
      );
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
    // Partial-Mock: `useMediaQuery` liest nur `matches` und meldet sich per
    // add/removeEventListener an — der Rest der MediaQueryList-Schnittstelle
    // wird nie berührt, daher der Doppel-Cast über `unknown`.
    return mql as unknown as MediaQueryList;
  });
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

describe('DashboardPage — Datenabruf', () => {
  it('lädt /dashboard mit fester Monats-Granularität (keine Diagramm-Einstellungen mehr)', async () => {
    const { granularityCalls } = mockEndpoints();
    renderWithRouter(<DashboardPage />);

    await screen.findByRole('button', { name: /^Filter/ });
    expect(granularityCalls).toEqual(['month']);
    expect(screen.queryByRole('button', { name: 'Diagramm-Einstellungen' })).toBeNull();
    expect(screen.queryByText('Verbrauchsverlauf')).toBeNull();
  });

  it('zeigt bei einem Cache-Hit die alten Daten und ein Lade-Feedback, bis der Refetch fertig ist', async () => {
    // Den zweiten /dashboard-Request (Remount = Cache-Hit) gaten, damit das
    // „Aktualisiere…"-Feedback deterministisch sichtbar wird — kein Timing.
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
        return HttpResponse.json(
          dashboardResponse({
            items: [wasserMitVerbrauch(1, 'Wasser Garten'), wasserMitVerbrauch(2, 'Wasser Haus')],
          }),
        );
      }),
    );

    const first = renderWithRouter(<DashboardPage />);
    await screen.findByText('Top-Verbraucher · Wasser · m³');
    expect(screen.queryByText('Aktualisiere…')).toBeNull();
    first.unmount();

    renderWithRouter(<DashboardPage />);
    expect(await screen.findByText('Aktualisiere…')).toBeInTheDocument();
    expect(screen.getByText('Top-Verbraucher · Wasser · m³')).toBeInTheDocument();

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

  it('Filter ausschließlich auf eine verrechnete Messstelle blendet echte Messstellen aus', async () => {
    mockEndpoints([wasserMitVerbrauch(1, 'Wasser Garten')], [VMP]);
    renderWithRouter(<DashboardPage />);

    // Ungefiltert: KPI-Kacheln der echten Wasser-MP und der verrechneten sichtbar.
    expect(await screen.findByText('Wasser')).toBeInTheDocument();
    expect(screen.getByText('PV-Saldo (verrechnet)')).toBeInTheDocument();

    const dialog = await openFilterSheet();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verrechnete Messstellen' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'PV-Saldo' }));

    await waitFor(() => expect(screen.queryByText('Wasser')).toBeNull());
    expect(screen.getByText('PV-Saldo (verrechnet)')).toBeInTheDocument();
  });

  it('Filter auf eine echte Messstelle blendet verrechnete Messstellen aus', async () => {
    mockEndpoints([wasserMitVerbrauch(1, 'Wasser Garten')], [VMP]);
    renderWithRouter(<DashboardPage />);
    expect(await screen.findByText('PV-Saldo (verrechnet)')).toBeInTheDocument();

    const dialog = await openFilterSheet();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Messstellen' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wasser Garten' }));

    await waitFor(() => expect(screen.queryByText('PV-Saldo (verrechnet)')).toBeNull());
    expect(screen.getByText('Wasser')).toBeInTheDocument();
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

  it('stellt die Hinweise vor die Top-Verbraucher (DOM-Reihenfolge = Mobile-Ansicht)', async () => {
    // Die breakpointabhängige Anordnung steckt in CSS-Klassen — geprüft wird
    // die DOM-Reihenfolge, die der Mobile-Spalte entspricht.
    mockEndpoints([wasserMitVerbrauch(1, 'Wasser Garten'), wasserMitVerbrauch(2, 'Wasser Haus')]);
    renderWithRouter(<DashboardPage />);

    const top = await screen.findByText('Top-Verbraucher · Wasser · m³');
    const hinweise = screen.getByText('Hinweise');

    expect(hinweise.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('DashboardPage — partial (Recorder-Scope)', () => {
  const PARTIAL_HINT =
    'Als Erfasser werden nur Messstellen mit Zugriff einbezogen — die Summen können unvollständig sein.';

  it('zeigt den Hinweis unter den KPI-Kacheln, wenn die Antwort partial ist', async () => {
    mockEndpoints([MP], [], { partial: true });
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText(PARTIAL_HINT)).toBeInTheDocument();
  });

  it('zeigt den Hinweis nicht, wenn die Antwort nicht partial ist', async () => {
    mockEndpoints([MP], [], { partial: false });
    renderWithRouter(<DashboardPage />);

    await screen.findByRole('button', { name: /^Filter/ });
    expect(screen.queryByText(PARTIAL_HINT)).toBeNull();
  });
});
