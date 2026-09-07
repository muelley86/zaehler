/**
 * Smoke-Test für TopConsumers: Section-Header je Gruppe, Rang/Name/Wert/
 * Anteil-Zeile, "Weitere …"-Footer nur mit `others`, und der Leerzustand.
 */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import type { TopConsumerGroup } from './dashboardMetrics';
import { TopConsumers } from './TopConsumers';

function group(overrides: Partial<TopConsumerGroup> = {}): TopConsumerGroup {
  return {
    type: 'electricity',
    unit: 'kWh',
    total: 300,
    entries: [
      { mpId: 1, name: 'Haus A', value: 200, sharePct: (200 / 300) * 100 },
      { mpId: 2, name: 'Haus B', value: 100, sharePct: (100 / 300) * 100 },
    ],
    others: null,
    ...overrides,
  };
}

describe('TopConsumers', () => {
  it('rendert den Gruppen-Header und Rang/Name/Wert/Anteil je Zeile', () => {
    renderWithRouter(<TopConsumers groups={[group()]} />);
    expect(screen.getByText('Top-Verbraucher · Strom · kWh')).toBeInTheDocument();
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('Haus A')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('66,7 %')).toBeInTheDocument();
  });

  it('zeigt den "Weitere …"-Footer nur, wenn `others` gesetzt ist', () => {
    const { rerender } = renderWithRouter(<TopConsumers groups={[group()]} />);
    expect(screen.queryByText(/Weitere/)).not.toBeInTheDocument();

    rerender(<TopConsumers groups={[group({ others: { count: 3, value: 45 } })]} />);
    expect(screen.getByText('Weitere 3: 45 kWh')).toBeInTheDocument();
  });

  it('rendert eine Section je Gruppe', () => {
    renderWithRouter(
      <TopConsumers
        groups={[group(), group({ type: 'water', unit: 'm³', entries: [], total: 0 })]}
      />,
    );
    expect(screen.getByText('Top-Verbraucher · Strom · kWh')).toBeInTheDocument();
    expect(screen.getByText('Top-Verbraucher · Wasser · m³')).toBeInTheDocument();
  });

  it('rendert nichts, wenn keine Gruppen vorhanden sind', () => {
    const { container } = renderWithRouter(<TopConsumers groups={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
