/**
 * Smoke-Test für KpiTiles: Kachel-Inhalt (Wert/Einheit/Delta), Sonderfälle
 * (keine Vergleichsdaten, vmp-Link, Footer nur mit `compareLabel`) und der
 * Leerzustand (`tiles.length === 0` → nichts rendern).
 */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import type { KpiTile } from './dashboardMetrics';
import { KpiTiles } from './KpiTiles';

function tile(overrides: Partial<KpiTile> = {}): KpiTile {
  return {
    key: 'electricity::kWh::bezug',
    type: 'electricity',
    unit: 'kWh',
    direction: 'bezug',
    label: 'Strom',
    current: 123.4,
    previous: 100,
    deltaPct: 23.4,
    trend: 'up',
    sentiment: 'bad',
    ...overrides,
  };
}

describe('KpiTiles', () => {
  it('rendert Label, Wert, Einheit und signiertes Delta mit sr-only-Zusatz', () => {
    renderWithRouter(<KpiTiles tiles={[tile()]} />);
    expect(screen.getByText('Verbrauch im Zeitraum')).toBeInTheDocument();
    expect(screen.getByText('Strom')).toBeInTheDocument();
    expect(screen.getByText('123,4')).toBeInTheDocument();
    expect(screen.getByText('kWh')).toBeInTheDocument();
    expect(screen.getByText('+23,4 %')).toBeInTheDocument();
    expect(screen.getByText('gegenüber Vorzeitraum')).toBeInTheDocument();
  });

  it('zeigt "keine Vergleichsdaten", wenn deltaPct null ist', () => {
    renderWithRouter(
      <KpiTiles tiles={[tile({ deltaPct: null, previous: null, trend: 'none' })]} />,
    );
    expect(screen.getByText('keine Vergleichsdaten')).toBeInTheDocument();
  });

  it('verlinkt das Label einer vmp-Kachel auf /verrechnung/{vmpId}', () => {
    renderWithRouter(
      <KpiTiles
        tiles={[tile({ label: 'PV-Saldo (verrechnet)', vmpId: 9, sentiment: 'neutral' })]}
      />,
    );
    const link = screen.getByRole('link', { name: 'PV-Saldo (verrechnet)' });
    expect(link).toHaveAttribute('href', '/verrechnung/9');
  });

  it('zeigt den Footer nur, wenn compareLabel gesetzt ist', () => {
    const { rerender } = renderWithRouter(<KpiTiles tiles={[tile()]} />);
    expect(screen.queryByText(/Vergleich mit/)).not.toBeInTheDocument();

    rerender(<KpiTiles tiles={[tile()]} compareLabel="Vorjahr" />);
    expect(screen.getByText('Vergleich mit Vorjahr')).toBeInTheDocument();
  });

  it('rendert nichts, wenn keine Kacheln vorhanden sind', () => {
    const { container } = renderWithRouter(<KpiTiles tiles={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
