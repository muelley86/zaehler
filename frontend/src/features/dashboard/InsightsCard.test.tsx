/**
 * Smoke-Test für InsightsCard: stale-/deviation-Zeilen, das
 * "+n weitere"-Toggle ab neun Einträgen und der Leerzustand.
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import type { Insight } from './dashboardMetrics';
import { InsightsCard } from './InsightsCard';

function stale(overrides: Partial<Extract<Insight, { kind: 'stale' }>> = {}): Insight {
  return {
    kind: 'stale',
    mpId: 1,
    name: 'Wasser Garten',
    lastReadingAt: '2026-06-01T00:00:00Z',
    daysSince: 60,
    ...overrides,
  };
}

function deviation(overrides: Partial<Extract<Insight, { kind: 'deviation' }>> = {}): Insight {
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

describe('InsightsCard', () => {
  it('rendert eine stale-Zeile mit Tagen, Datum und "Jetzt erfassen"-Link', () => {
    renderWithRouter(<InsightsCard insights={[stale()]} />);
    expect(screen.getByText('Hinweise')).toBeInTheDocument();
    expect(
      screen.getByText('Wasser Garten: letzte Ablesung vor 60 Tagen (01.06.2026)'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Jetzt erfassen' });
    expect(link).toHaveAttribute('href', '/erfassen?mp=1');
  });

  it('zeigt "noch nie abgelesen" ohne Datum, wenn lastReadingAt null ist', () => {
    renderWithRouter(<InsightsCard insights={[stale({ lastReadingAt: null, daysSince: null })]} />);
    expect(screen.getByText('Wasser Garten: noch nie abgelesen')).toBeInTheDocument();
  });

  it('rendert eine deviation-Zeile mit Vorzeichen, Richtung und Werten', () => {
    renderWithRouter(<InsightsCard insights={[deviation()]} />);
    expect(
      screen.getByText('Strom Haus: +50 % Bezug gegenüber Vorzeitraum (100 → 150 kWh)'),
    ).toBeInTheDocument();
  });

  it('zeigt ab 9 Einträgen ein Toggle, das den Rest einblendet', () => {
    const insights = Array.from({ length: 9 }, (_, i) =>
      stale({ mpId: i + 1, name: `MP ${i + 1}` }),
    );
    renderWithRouter(<InsightsCard insights={insights} />);
    expect(
      screen.queryByText('MP 9: letzte Ablesung vor 60 Tagen (01.06.2026)'),
    ).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: '+1 weitere' });

    fireEvent.click(toggle);

    expect(screen.getByText('MP 9: letzte Ablesung vor 60 Tagen (01.06.2026)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+1 weitere' })).not.toBeInTheDocument();
  });

  it('rendert nichts, wenn keine Hinweise vorhanden sind', () => {
    const { container } = renderWithRouter(<InsightsCard insights={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
