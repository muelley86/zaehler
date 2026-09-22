/**
 * Smoke-Tests für das Dashboard: die Filterleiste (mobil im Sheet, auf
 * Desktop inline), die KPI-Kacheln inkl. Vorperioden-Delta, fällige Messstellen,
 * Top-Verbraucher, Leerzustände und das Refetch-Feedback.
 *
 * Die Seite spricht nur `/api/v1/dashboard` und das Kachel-Layout
 * (`/api/v1/auth/me/dashboard-layout`) an; der MSW-Server läuft mit
 * `onUnhandledRequest: 'error'` und schlägt bei jedem anderen Request an.
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
import type {
  DashboardLayout,
  DashboardMeasuringPoint,
  DashboardVirtualMeasuringPoint,
} from '@/lib/types';

import { DEFAULT_LAYOUT } from './dashboardLayout';
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

const LAYOUT_URL = '/api/v1/auth/me/dashboard-layout';

/** Kachel-Layout-Endpoint; protokolliert die PUT-Bodies. */
function mockLayout(initial: DashboardLayout = DEFAULT_LAYOUT): { puts: DashboardLayout[] } {
  const puts: DashboardLayout[] = [];
  server.use(
    http.get(LAYOUT_URL, () => HttpResponse.json(initial)),
    http.put(LAYOUT_URL, async ({ request }) => {
      const body = (await request.json()) as DashboardLayout;
      puts.push(body);
      return HttpResponse.json(body);
    }),
  );
  return { puts };
}

/** Kachel-Titel (h2) in DOM-Reihenfolge; `withCount: false` schneidet „ · N“ ab. */
function tileTitles({ withCount = true }: { withCount?: boolean } = {}): string[] {
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent ?? '')
    .map((t) => (withCount ? t : t.replace(/ · \d+$/, '')));
}

beforeEach(() => {
  clearDashboardCache();
  mockLayout();
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
    await screen.findByText('Wasser · m³');
    expect(screen.queryByText('Aktualisiere…')).toBeNull();
    first.unmount();

    renderWithRouter(<DashboardPage />);
    expect(await screen.findByText('Aktualisiere…')).toBeInTheDocument();
    expect(screen.getByText('Wasser · m³')).toBeInTheDocument();

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

    expect(await screen.findByText('Wasser · m³')).toBeInTheDocument();
    expect(screen.getByText('75 %')).toBeInTheDocument();
    expect(screen.getByText('25 %')).toBeInTheDocument();
  });

  it('zeigt fällige Messstellen und weitere Hinweise in getrennten Kacheln', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    mockEndpoints([
      dashboardItem({ id: 1, name: 'Wasser Garten', type: 'water', last_reading_at: sixtyDaysAgo }),
    ]);
    renderWithRouter(<DashboardPage />);

    await screen.findByText(/Wasser Garten: letzte Ablesung vor 60 Tagen/);
    expect(tileTitles()).toEqual([
      'Verbrauch im Zeitraum',
      'Fällige Messstellen · 1',
      'Weitere Hinweise',
      'Top-Verbraucher',
    ]);
    expect(screen.getByText('Keine Auffälligkeiten im Zeitraum.')).toBeInTheDocument();
  });
});

describe('DashboardPage — Kachel-Layout', () => {
  it('ordnet die Kacheln nach dem gespeicherten Layout und klappt eingeklappte zu', async () => {
    mockLayout({ order: ['top', 'insights', 'due', 'kpi'], collapsed: ['insights'] });
    mockEndpoints([wasserMitVerbrauch(1, 'Wasser Garten'), wasserMitVerbrauch(2, 'Wasser Haus')]);
    renderWithRouter(<DashboardPage />);

    await screen.findByText('Wasser · m³');
    expect(tileTitles({ withCount: false })).toEqual([
      'Top-Verbraucher',
      'Weitere Hinweise',
      'Fällige Messstellen',
      'Verbrauch im Zeitraum',
    ]);
    const toggle = screen.getByRole('button', { name: '„Weitere Hinweise“ aufklappen' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Keine Auffälligkeiten im Zeitraum.')).toBeNull();
  });

  it('verschiebt per ▲ und speichert das Layout', async () => {
    const { puts } = mockLayout();
    mockEndpoints([wasserMitVerbrauch(1, 'Wasser Garten'), wasserMitVerbrauch(2, 'Wasser Haus')]);
    renderWithRouter(<DashboardPage />);

    await screen.findByText('Wasser · m³');
    expect(
      screen.getByRole('button', { name: '„Verbrauch im Zeitraum“ nach oben' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '„Top-Verbraucher“ nach oben' }));

    expect(tileTitles({ withCount: false })).toEqual([
      'Verbrauch im Zeitraum',
      'Fällige Messstellen',
      'Top-Verbraucher',
      'Weitere Hinweise',
    ]);
    await waitFor(() =>
      expect(puts).toEqual([{ order: ['kpi', 'due', 'top', 'insights'], collapsed: [] }]),
    );
  });

  it('klappt eine Kachel zu und speichert den Zustand', async () => {
    const { puts } = mockLayout();
    mockEndpoints([wasserMitVerbrauch(1, 'Wasser Garten'), wasserMitVerbrauch(2, 'Wasser Haus')]);
    renderWithRouter(<DashboardPage />);

    await screen.findByText('Wasser · m³');
    fireEvent.click(screen.getByRole('button', { name: '„Top-Verbraucher“ zuklappen' }));

    expect(screen.queryByText('Wasser · m³')).toBeNull();
    expect(screen.getByRole('button', { name: '„Top-Verbraucher“ aufklappen' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await waitFor(() => expect(puts).toEqual([{ ...DEFAULT_LAYOUT, collapsed: ['top'] }]));
  });

  it('fällt auf das Standard-Layout zurück, wenn das Layout nicht geladen werden kann', async () => {
    server.use(http.get(LAYOUT_URL, () => new HttpResponse(null, { status: 500 })));
    mockEndpoints([wasserMitVerbrauch(1, 'Wasser Garten'), wasserMitVerbrauch(2, 'Wasser Haus')]);
    renderWithRouter(<DashboardPage />);

    await screen.findByText('Wasser · m³');
    expect(tileTitles({ withCount: false })).toEqual([
      'Verbrauch im Zeitraum',
      'Fällige Messstellen',
      'Weitere Hinweise',
      'Top-Verbraucher',
    ]);
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
