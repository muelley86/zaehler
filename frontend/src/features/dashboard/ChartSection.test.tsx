/**
 * Tests für die Chart-Sektion: Einstellungs-Menü (Granularität/Diagrammtyp
 * inkl. localStorage-Persistenz und „Automatisch"), Suspense-Fallback vor dem
 * lazy geladenen Diagramm, Leerzustand und der Hinweis bei sehr vielen Serien.
 *
 * `ComparisonChart` wird gemockt — Recharts hat in jsdom keine Maße und ist
 * hier auch nicht Gegenstand des Tests; der Mock hält zusätzlich den
 * Suspense-Pfad (`lazy`) intakt.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { ComparisonGroup } from './comparisonSeries';
import { useChartPrefs } from './useChartPrefs';
import { ChartSection } from './ChartSection';

vi.mock('./ComparisonChart', () => ({
  ComparisonChart: ({ groupId }: { groupId: string }) => (
    <div data-testid="comparison-chart">{groupId}</div>
  ),
}));

/** Zeitraum wie der App-Standard: 2 Monate → Auto-Granularität „Woche", Auto-Typ „Linie". */
const FROM = '2026-08-01';
const TO = '2026-09-30';

function group(overrides: Partial<ComparisonGroup> = {}): ComparisonGroup {
  return {
    type: 'water',
    unit: 'm³',
    seriesKeys: ['mp-1::draw'],
    labelOf: { 'mp-1::draw': 'Wasser Garten' },
    series: [{ date: '2026-08-31', 'mp-1::draw': 5 }],
    ...overrides,
  };
}

/** Serien-Gruppe mit `count` Serien — für den `MAX_SERIES_HINT`-Pfad. */
function wideGroup(count: number): ComparisonGroup {
  const seriesKeys = Array.from({ length: count }, (_, i) => `mp-${i}::draw`);
  const labelOf: Record<string, string> = {};
  for (const key of seriesKeys) labelOf[key] = key;
  return { type: 'water', unit: 'm³', seriesKeys, labelOf, series: [] };
}

function Harness({
  groups = [group()],
  refreshing = false,
  partial = false,
  compact = false,
}: {
  groups?: ComparisonGroup[];
  refreshing?: boolean;
  partial?: boolean;
  compact?: boolean;
}) {
  const prefs = useChartPrefs(FROM, TO);
  return (
    <ChartSection
      groups={groups}
      prefs={prefs}
      refreshing={refreshing}
      partial={partial}
      compact={compact}
    />
  );
}

function openSettings(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Diagramm-Einstellungen' }));
}

afterEach(() => {
  window.localStorage.clear();
});

describe('ChartSection — Einstellungs-Menü', () => {
  it('öffnet das Menü mit Aggregations- und Diagramm-Optionen', () => {
    render(<Harness />);

    expect(screen.queryByRole('button', { name: 'Woche' })).toBeNull();

    openSettings();

    expect(screen.getByRole('group', { name: 'Aggregation' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Diagramm' })).toBeInTheDocument();
    // „Automatisch" nennt den aktuell abgeleiteten Wert.
    expect(screen.getByRole('button', { name: 'Automatisch (Woche)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Automatisch (Linie)' })).toBeInTheDocument();
  });

  it('merkt eine gewählte Granularität in localStorage', () => {
    render(<Harness />);
    openSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Tag' }));

    expect(window.localStorage.getItem('dashboard.granularity')).toBe('day');
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('merkt einen gewählten Diagrammtyp in localStorage', () => {
    render(<Harness />);
    openSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Balken' }));

    expect(window.localStorage.getItem('dashboard.chartType')).toBe('bar');
    expect(screen.getByRole('button', { name: 'Balken' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('„Automatisch" löscht die gemerkte Wahl wieder', () => {
    window.localStorage.setItem('dashboard.granularity', 'day');
    window.localStorage.setItem('dashboard.chartType', 'bar');
    render(<Harness />);
    openSettings();

    // Manuell gewählte Granularität → das Auto-Pill kennt seinen Wert nicht
    // mehr und heißt schlicht „Automatisch".
    fireEvent.click(screen.getByRole('button', { name: 'Automatisch' }));
    expect(window.localStorage.getItem('dashboard.granularity')).toBeNull();
    // Nach dem Zurücksetzen greift wieder der abgeleitete Wert (Woche).
    expect(screen.getByRole('button', { name: 'Automatisch (Woche)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Automatisch (Linie)' }));
    expect(window.localStorage.getItem('dashboard.chartType')).toBeNull();
  });
});

describe('ChartSection — Diagramme', () => {
  it('zeigt einen Skeleton, bis das lazy geladene Diagramm da ist', async () => {
    // `lazy()` merkt sich das aufgelöste Modul am Modul-Objekt — nach einem
    // Render in einem früheren Test wäre der Suspense-Pfad nicht mehr
    // beobachtbar. Deshalb hier bewusst ein frisch geladenes Modul.
    vi.resetModules();
    const { ChartSection: FreshChartSection } = await import('./ChartSection');

    function FreshHarness() {
      const prefs = useChartPrefs(FROM, TO);
      return (
        <FreshChartSection
          groups={[group()]}
          prefs={prefs}
          refreshing={false}
          partial={false}
          compact
        />
      );
    }

    const { container } = render(<FreshHarness />);

    expect(screen.queryByTestId('comparison-chart')).toBeNull();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();

    expect(await screen.findByTestId('comparison-chart')).toBeInTheDocument();
    expect(screen.getByText('Wasser · m³')).toBeInTheDocument();
  });

  it('zeigt ein Lade-Feedback, solange nachgeladen wird', () => {
    render(<Harness refreshing />);

    expect(screen.getByRole('status')).toHaveTextContent('Aktualisiere…');
  });

  it('weist auf eine nur teilweise abgedeckte Periode hin', async () => {
    render(<Harness partial />);
    await screen.findByTestId('comparison-chart');

    expect(
      screen.getByText('Zeitraum nur teilweise durch Ablesungen abgedeckt'),
    ).toBeInTheDocument();
  });

  it('zeigt einen Leerzustand, wenn es keine Verbrauchs-Gruppen gibt', () => {
    render(<Harness groups={[]} />);

    expect(screen.getByText('Kein Verbrauch im gewählten Zeitraum')).toBeInTheDocument();
    expect(screen.queryByTestId('comparison-chart')).toBeNull();
  });

  it('weist auf zu viele Serien hin', () => {
    render(<Harness groups={[wideGroup(26)]} />);

    expect(screen.getByText(/26 Serien im Vergleich/)).toBeInTheDocument();
  });
});
