/**
 * Tests für die Auswertungen-Seite: explizites „Auswerten" (kein Auto-Load),
 * Gate-Regel für freie Datumsfelder, gespeicherte Auswertungen ganz oben (nur
 * Filter übernehmen), Stale-Hinweis, Ergebnis-Tabelle, optionales Diagramm
 * (lazy, nur nach Umschalten), partial-Hinweis und Admin-Gating.
 *
 * `ReportChart` ist gemockt: Recharts-Internals werden hier bewusst NICHT
 * geprüft (jsdom misst nichts, volle Suite spürbar langsamer) — das Diagramm
 * selbst deckt `ReportChart.test.tsx` ab.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import type { ReportAggregateResponse, ReportConfigRead } from '@/lib/types';

const auth = vi.hoisted((): { role: 'admin' | 'recorder' } => ({ role: 'admin' }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ me: { role: auth.role } }),
}));

vi.mock('./ReportChart', () => ({
  ReportChart: ({
    group,
    chartType,
  }: {
    group: { id: string; mode: string; labelOf: Record<string, string> };
    chartType: string;
  }) => (
    <div
      data-testid="report-chart"
      data-mode={group.mode}
      data-chart-type={chartType}
      data-label-a={group.labelOf.a}
      data-label-b={group.labelOf.b}
    >
      {group.id}
    </div>
  ),
}));

import { ReportsPage } from './ReportsPage';
import { periodLabel, previousYearRange } from './reportUtils';
import { mockEndpoints, response, runReport } from './reportsTestUtils';

const SAVED: ReportConfigRead = {
  id: 1,
  name: 'Jahresübersicht',
  dimension: 'owner',
  granularity: 'month',
  period_kind: 'current_year',
  from_date: null,
  to_date: null,
  filters: {
    main_location_ids: [],
    location_ids: [],
    owner_ids: [],
    kostenstellen: [],
    meter_types: ['electricity'],
  },
  created_at: '2026-01-01T00:00:00Z',
};

afterEach(() => {
  auth.role = 'admin';
  // Sticky-Filter (sessionStorage) zwischen Tests isolieren.
  window.sessionStorage.clear();
});

describe('ReportsPage — explizites Auswerten', () => {
  it('lädt vor „Auswerten" keine Aggregation und zeigt den Platzhalter', async () => {
    const { urls } = mockEndpoints();
    renderWithRouter(<ReportsPage />);

    expect(await screen.findByText('Noch keine Auswertung')).toBeInTheDocument();
    expect(screen.getByText(/„Auswerten" drücken/)).toBeInTheDocument();
    expect(urls).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled();
  });

  it('rendert die Ergebnis-Tabelle nach „Auswerten"', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await runReport();

    expect(await screen.findByText('10001')).toBeInTheDocument();
    expect(screen.getByText(/1\.234\s*kWh/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled();
  });

  it('Default-Dimension ist Messstelle (erster Aggregat-Call + aktive Pill)', async () => {
    const { dimensionCalls } = mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await runReport();
    await screen.findByText('10001');

    expect(dimensionCalls[0]).toBe('measuring_point');
    expect(screen.getByRole('button', { name: 'Messstelle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('Filteränderung lädt nicht neu, sondern zeigt den Stale-Hinweis bis zum nächsten Lauf', async () => {
    const { dimensionCalls } = mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await runReport();
    await screen.findByText('10001');
    expect(screen.queryByText(/erneut auswerten/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Eigentümer' }));

    expect(await screen.findByText(/Filter geändert – erneut auswerten/)).toBeInTheDocument();
    expect(dimensionCalls).toEqual(['measuring_point']);

    await runReport();
    await waitFor(() => expect(dimensionCalls).toContain('owner'));
    await waitFor(() => expect(screen.queryByText(/erneut auswerten/)).toBeNull());
  });

  it('„Benutzerdefiniert" ohne Daten deaktiviert „Auswerten" mit Hinweis', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    const button = await screen.findByRole('button', { name: 'Auswerten' });
    expect(button).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Zeitraum'), { target: { value: 'fixed' } });

    expect(button).toBeDisabled();
    expect(screen.getByText(/Von- und Bis-Datum/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Von'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Bis'), { target: { value: '2026-01-31' } });

    expect(button).toBeEnabled();
    expect(screen.queryByText(/Von- und Bis-Datum/)).toBeNull();
  });

  it('benutzerdefinierter Vergleich ohne Daten deaktiviert „Auswerten" mit Hinweis', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    const button = await screen.findByRole('button', { name: 'Auswerten' });

    fireEvent.click(screen.getByRole('switch', { name: 'Vergleich' }));
    // Vorjahr ist vorausgewählt und braucht keine Eingabe.
    expect(button).toBeEnabled();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Periode 2' })).getByText('Benutzerdefiniert'),
    );

    expect(button).toBeDisabled();
    expect(screen.getByText(/Vergleichsdaten/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Periode 2 von'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('bis'), { target: { value: '2025-12-31' } });

    expect(button).toBeEnabled();
  });

  it('zeigt den partial-Hinweis, wenn das Backend partial=true meldet', async () => {
    mockEndpoints({ partial: true });
    renderWithRouter(<ReportsPage />);
    await runReport();
    expect(await screen.findByText(/nur Messstellen mit Zugriff/i)).toBeInTheDocument();
  });
});

describe('ReportsPage — gespeicherte Auswertungen', () => {
  it('stehen als erste Section direkt unter dem Titel und zeigen einen Leer-Text', async () => {
    mockEndpoints();
    const { container } = renderWithRouter(<ReportsPage />);

    expect(await screen.findByText(/Noch keine gespeicherten Auswertungen/)).toBeInTheDocument();
    const firstSection = container.querySelector('section');
    expect(firstSection).not.toBeNull();
    expect(within(firstSection!).getByText('Gespeicherte Auswertungen')).toBeInTheDocument();
  });

  it('Klick übernimmt nur die Filter — ausgewertet wird erst per Button', async () => {
    const { urls, dimensionCalls } = mockEndpoints({ configs: [SAVED] });
    renderWithRouter(<ReportsPage />);

    // Der Lösch-Button trägt den Namen im aria-label — den Lade-Button über den Präfix greifen.
    fireEvent.click(await screen.findByRole('button', { name: /^Jahresübersicht/ }));

    expect(screen.getByRole('button', { name: 'Eigentümer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Monat' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Noch keine Auswertung')).toBeInTheDocument();
    expect(urls).toHaveLength(0);

    await runReport();
    await waitFor(() => expect(dimensionCalls).toEqual(['owner']));
    expect(urls[0]).toContain('granularity=month');
    expect(urls[0]).toContain('meter_type=electricity');
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
    await screen.findByRole('button', { name: 'Auswerten' });
    expect(screen.queryByRole('button', { name: /Speichern/ })).not.toBeInTheDocument();
  });
});

describe('ReportsPage — Ergebnis-Tabelle', () => {
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
    mockEndpoints({ body });
    renderWithRouter(<ReportsPage />);
    await runReport();
    expect(await screen.findByText('Solar PV')).toBeInTheDocument();
    expect(screen.getByText(/· Einspeisung/)).toBeInTheDocument();
  });

  it('bidirektionale Messstelle: auch die Bezugs-Zeile trägt ihre Richtung', async () => {
    const body: ReportAggregateResponse = {
      ...response(),
      rows: [
        {
          group_key: 1,
          group_label: 'Solar PV',
          meter_type: 'electricity',
          unit: 'kWh',
          direction: 'bezug',
          period_start: null,
          period_end: null,
          consumption: '1200',
        },
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
        {
          group_key: 2,
          group_label: 'Strom Halle',
          meter_type: 'electricity',
          unit: 'kWh',
          direction: 'bezug',
          period_start: null,
          period_end: null,
          consumption: '500',
        },
      ],
    };
    mockEndpoints({ body });
    renderWithRouter(<ReportsPage />);
    await runReport();
    await screen.findByText('Strom Halle');
    // Beide Zeilen der bidirektionalen Messstelle sind beschriftet …
    expect(screen.getByText(/· Bezug/)).toBeInTheDocument();
    expect(screen.getByText(/· Einspeisung/)).toBeInTheDocument();
    // … die unidirektionale Zeile bleibt ohne Zusatz.
    const halleCell = screen.getByText('Strom Halle').closest('td');
    if (!halleCell) throw new Error('Tabellenzelle für „Strom Halle" nicht gefunden');
    expect(within(halleCell).queryByText(/· Bezug/)).not.toBeInTheDocument();
  });

  it('verrechnete Zeile verlinkt auf die Detail-Seite /verrechnung/{id}', async () => {
    const body: ReportAggregateResponse = {
      ...response(),
      rows: [
        ...response().rows,
        {
          group_key: 9,
          group_label: 'PV-Saldo',
          meter_type: 'electricity',
          unit: 'kWh',
          direction: 'bezug',
          is_virtual: true,
          period_start: null,
          period_end: null,
          consumption: '380',
        },
      ],
    };
    mockEndpoints({ body });
    renderWithRouter(<ReportsPage />);
    await runReport();
    const link = await screen.findByRole('link', { name: 'PV-Saldo (verrechnet)' });
    expect(link).toHaveAttribute('href', '/verrechnung/9');
    // Echte Zeilen bleiben unverlinkt.
    expect(screen.getByText('10001').closest('a')).toBeNull();
  });
});

describe('ReportsPage — Filter', () => {
  it('Messstellen-Filter sendet measuring_point_id und zählt im Badge', async () => {
    const { urls } = mockEndpoints();
    const user = userEvent.setup();
    renderWithRouter(<ReportsPage />);
    await screen.findByRole('button', { name: 'Auswerten' });

    await user.click(screen.getByRole('button', { name: /Messstellen eingrenzen/ }));
    const filterSection = screen.getByText('Messstellen eingrenzen').closest('section')!;
    await user.click(within(filterSection).getByRole('button', { name: 'Messstellen' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Strom Halle' }));
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();

    await runReport();
    await waitFor(() => expect(urls.some((u) => u.includes('measuring_point_id=1'))).toBe(true));
  });

  it('gespeicherte Auswertung mit Messstellen setzt den Filter', async () => {
    mockEndpoints({
      configs: [{ ...SAVED, filters: { ...SAVED.filters, measuring_point_ids: [1] } }],
    });
    renderWithRouter(<ReportsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Jahresübersicht/ }));
    expect(await screen.findByText('2 aktiv')).toBeInTheDocument();
  });

  it('„Filter zurücksetzen" stellt alles auf Standard und ist danach deaktiviert', async () => {
    mockEndpoints();
    const user = userEvent.setup();
    renderWithRouter(<ReportsPage />);
    const reset = await screen.findByRole('button', { name: 'Filter zurücksetzen' });
    expect(reset).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Kostenstelle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monat' }));
    fireEvent.change(screen.getByLabelText('Zeitraum'), { target: { value: 'current_year' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Vergleich' }));
    await user.click(screen.getByRole('button', { name: /Messstellen eingrenzen/ }));
    const filterSection = screen.getByText('Messstellen eingrenzen').closest('section')!;
    await user.click(within(filterSection).getByRole('button', { name: 'Messstellen' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Strom Halle' }));
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();
    expect(reset).toBeEnabled();

    await runReport();
    await screen.findByText('10001');
    fireEvent.click(reset);

    expect(screen.getByRole('button', { name: 'Messstelle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Gesamt' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Zeitraum')).toHaveValue('shared_range');
    expect(screen.getByRole('switch', { name: 'Vergleich' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.queryByText('1 aktiv')).toBeNull();
    expect(reset).toBeDisabled();
    // Der letzte Lauf bleibt stehen und wird als veraltet markiert.
    expect(screen.getByText(/Filter geändert/)).toBeInTheDocument();
  });

  it('zugeklapptes Filter-Panel zeigt die Anzahl aktiver Filter als Badge', async () => {
    mockEndpoints();
    const user = userEvent.setup();
    renderWithRouter(<ReportsPage />);
    await screen.findByRole('button', { name: 'Auswerten' });

    // Ohne aktive Filter: kein Badge.
    expect(screen.queryByText(/aktiv/)).not.toBeInTheDocument();

    // Filter aufklappen, Kostenstelle wählen, wieder zuklappen → Badge bleibt.
    await user.click(screen.getByRole('button', { name: /Messstellen eingrenzen/ }));
    const filterSection = screen.getByText('Messstellen eingrenzen').closest('section')!;
    await user.click(within(filterSection).getByRole('button', { name: 'Kostenstelle' }));
    await user.click(await screen.findByRole('checkbox', { name: '10001' }));
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Messstellen eingrenzen/ }));
    expect(screen.getByText('1 aktiv')).toBeInTheDocument();
  });

  it('Filter-Dropdown sendet den gewählten Filter beim nächsten Lauf als Query-Param', async () => {
    const { urls } = mockEndpoints();
    const user = userEvent.setup();
    renderWithRouter(<ReportsPage />);
    await screen.findByRole('button', { name: 'Auswerten' });

    // Filter aufklappen und das Kostenstelle-Dropdown im Filterbereich öffnen
    // (entkoppelt von der gleichnamigen Gruppierungs-Dimension-Pill).
    await user.click(screen.getByRole('button', { name: /Messstellen eingrenzen/ }));
    const filterSection = screen.getByText('Messstellen eingrenzen').closest('section')!;
    await user.click(within(filterSection).getByRole('button', { name: 'Kostenstelle' }));
    await user.click(await screen.findByRole('checkbox', { name: '10001' }));
    expect(urls).toHaveLength(0);

    await runReport();

    await waitFor(() => expect(urls.some((u) => u.includes('kostenstelle=10001'))).toBe(true));
  });
});

describe('ReportsPage — Vergleich', () => {
  async function runComparison(): Promise<void> {
    fireEvent.click(screen.getByRole('switch', { name: 'Vergleich' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Periode 2' })).getByText('Benutzerdefiniert'),
    );
    fireEvent.change(screen.getByLabelText('Periode 2 von'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('bis'), { target: { value: '2025-12-31' } });
    await runReport();
    await screen.findByText('10001');
  }

  it('zeigt Periode 1 und nutzt per Default das Vorjahr als Periode 2', async () => {
    const { dateParams } = mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await screen.findByRole('button', { name: 'Auswerten' });

    fireEvent.click(screen.getByRole('switch', { name: 'Vergleich' }));
    expect(screen.getByText('Periode 1')).toBeInTheDocument();
    expect(screen.getByText('Periode 2')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Periode 2' })).getByText('Vorjahr'),
    ).toHaveAttribute('aria-pressed', 'true');
    // Periode 1 = geteilter Datumsbereich; Periode 2 ein Jahr davor.
    await runReport();
    await screen.findByText('10001');
    const [a, b] = dateParams;
    expect(a?.from && b?.from && a.to && b.to).toBeTruthy();
    expect(b).toEqual(previousYearRange({ from: a!.from, to: a!.to }));
    expect(screen.getByTestId('compare-period')).toHaveTextContent(periodLabel(b!.from, b!.to));
  });

  it('Vorperiode ist wählbar und wird angezeigt', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await screen.findByRole('button', { name: 'Auswerten' });
    fireEvent.click(screen.getByRole('switch', { name: 'Vergleich' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Periode 2' })).getByText('Vorperiode'),
    );
    expect(screen.getByTestId('compare-period')).not.toHaveTextContent('Gesamter Zeitraum');
  });

  it('„Gesamter Zeitraum" + Vorjahr blockiert „Auswerten" mit Hinweis', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    const button = await screen.findByRole('button', { name: 'Auswerten' });
    fireEvent.change(screen.getByLabelText('Zeitraum'), { target: { value: 'all' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Vergleich' }));

    expect(button).toBeDisabled();
    expect(screen.getByText(/begrenzten Zeitraum/)).toBeInTheDocument();
  });

  it('Spaltenköpfe zeigen die Zeiträume beider Perioden, Werte tragen die Einheit', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await screen.findByRole('button', { name: 'Auswerten' });
    fireEvent.change(screen.getByLabelText('Zeitraum'), { target: { value: 'fixed' } });
    fireEvent.change(screen.getByLabelText('Von'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Bis'), { target: { value: '2026-12-31' } });
    await runComparison();

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Messstelle',
      'Zählerart',
      '01.01.2026 – 31.12.2026',
      '01.01.2025 – 31.12.2025',
      'Δ',
      'Δ %',
    ]);
    expect(screen.getAllByText(/1\.234\s*kWh/).length).toBeGreaterThanOrEqual(2);
  });

  it('„Gesamter Zeitraum" als Hauptperiode erscheint so im Spaltenkopf', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await screen.findByRole('button', { name: 'Auswerten' });
    fireEvent.change(screen.getByLabelText('Zeitraum'), { target: { value: 'all' } });
    await runComparison();

    expect(screen.getByRole('columnheader', { name: 'Gesamter Zeitraum' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Aktuell' })).toBeNull();
  });

  it('Diagramm-Legende nutzt dieselben Zeitraum-Labels', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await screen.findByRole('button', { name: 'Auswerten' });
    fireEvent.change(screen.getByLabelText('Zeitraum'), { target: { value: 'all' } });
    await runComparison();

    fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));
    const chart = await screen.findByTestId('report-chart');
    expect(chart).toHaveAttribute('data-label-a', 'Gesamter Zeitraum');
    expect(chart).toHaveAttribute('data-label-b', '01.01.2025 – 31.12.2025');
  });
});

describe('ReportsPage — Diagramm', () => {
  it('mountet das Diagramm erst nach dem Umschalten auf „Diagramm"', async () => {
    mockEndpoints();
    renderWithRouter(<ReportsPage />);
    await runReport();
    await screen.findByText('10001');
    expect(screen.queryByTestId('report-chart')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));

    const chart = await screen.findByTestId('report-chart');
    // Auflösung „Gesamt" → Balken je Gruppe, kein Linie/Balken-Umschalter.
    expect(chart).toHaveAttribute('data-mode', 'categorical');
    expect(screen.getByText('Strom · kWh')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Diagrammtyp' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    await waitFor(() => expect(screen.queryByTestId('report-chart')).toBeNull());
    expect(screen.getByText('10001')).toBeInTheDocument();
  });

  it('Zeitreihe: Linie als Default, auf Balken umschaltbar', async () => {
    const body: ReportAggregateResponse = {
      ...response(),
      granularity: 'month',
      rows: [
        {
          ...response().rows[0]!,
          period_start: '2026-01-01',
          period_end: '2026-01-31',
          consumption: '100',
        },
        {
          ...response().rows[0]!,
          period_start: '2026-02-01',
          period_end: '2026-02-28',
          consumption: '120',
        },
      ],
    };
    mockEndpoints({ body });
    renderWithRouter(<ReportsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Monat' }));
    await runReport();
    await screen.findAllByText('10001');

    fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));

    const chart = await screen.findByTestId('report-chart');
    expect(chart).toHaveAttribute('data-mode', 'timeseries');
    expect(chart).toHaveAttribute('data-chart-type', 'line');

    fireEvent.click(within(screen.getByRole('group', { name: 'Diagrammtyp' })).getByText('Balken'));
    expect(screen.getByTestId('report-chart')).toHaveAttribute('data-chart-type', 'bar');
  });
});
