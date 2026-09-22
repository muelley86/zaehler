/**
 * Smoke-Test für DueCard/DeviationsCard: stale-/deviation-Zeilen, das beidseitige
 * "+n weitere"/"weniger anzeigen"-Toggle ab neun Einträgen und die Leerzustände.
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import type { DeviationInsight, StaleInsight } from './dashboardMetrics';
import { DeviationsCard, DueCard } from './InsightCards';

function stale(overrides: Partial<StaleInsight> = {}): StaleInsight {
  return {
    kind: 'stale',
    mpId: 1,
    name: 'Wasser Garten',
    lastReadingAt: '2026-06-01T00:00:00Z',
    daysSince: 60,
    ...overrides,
  };
}

function deviation(overrides: Partial<DeviationInsight> = {}): DeviationInsight {
  return {
    kind: 'deviation',
    mpId: 2,
    name: 'Strom Haus',
    unit: 'kWh',
    direction: 'bezug',
    current: 150,
    previous: 100,
    deltaPct: 50,
    ...overrides,
  };
}

describe('DueCard / DeviationsCard', () => {
  it('rendert eine stale-Zeile mit Tagen, Datum und "Jetzt erfassen"-Link', () => {
    renderWithRouter(<DueCard insights={[stale()]} />);
    expect(
      screen.getByText('Wasser Garten: letzte Ablesung vor 60 Tagen (01.06.2026)'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Jetzt erfassen' });
    expect(link).toHaveAttribute('href', '/erfassen?mp=1');
  });

  it('zeigt "noch nie abgelesen" ohne Datum, wenn lastReadingAt null ist', () => {
    renderWithRouter(<DueCard insights={[stale({ lastReadingAt: null, daysSince: null })]} />);
    expect(screen.getByText('Wasser Garten: noch nie abgelesen')).toBeInTheDocument();
  });

  it('rendert eine deviation-Zeile mit Vorzeichen, Richtung und Werten', () => {
    renderWithRouter(<DeviationsCard insights={[deviation()]} />);
    expect(
      screen.getByText('Strom Haus: +50 % Bezug gegenüber Vorzeitraum (100 → 150 kWh)'),
    ).toBeInTheDocument();
  });

  it('zeigt ab 9 Einträgen ein Toggle, das den Rest ein- und wieder ausblendet', () => {
    const insights = Array.from({ length: 9 }, (_, i) =>
      stale({ mpId: i + 1, name: `MP ${i + 1}` }),
    );
    renderWithRouter(<DueCard insights={insights} />);
    expect(
      screen.queryByText('MP 9: letzte Ablesung vor 60 Tagen (01.06.2026)'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+1 weitere' }));

    expect(screen.getByText('MP 9: letzte Ablesung vor 60 Tagen (01.06.2026)')).toBeInTheDocument();
    const collapse = screen.getByRole('button', { name: 'weniger anzeigen' });

    fireEvent.click(collapse);

    expect(
      screen.queryByText('MP 9: letzte Ablesung vor 60 Tagen (01.06.2026)'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1 weitere' })).toBeInTheDocument();
  });

  it('zeigt einen Leertext, wenn nichts fällig bzw. auffällig ist', () => {
    renderWithRouter(
      <>
        <DueCard insights={[]} />
        <DeviationsCard insights={[]} />
      </>,
    );
    expect(screen.getByText('Keine Messstelle fällig.')).toBeInTheDocument();
    expect(screen.getByText('Keine Auffälligkeiten im Zeitraum.')).toBeInTheDocument();
  });
});
