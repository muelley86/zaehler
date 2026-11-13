/**
 * Render-Smoke für das Diagramm des Lauf-Vergleichs: muss unter jsdom fehlerfrei mounten, auch
 * mit einem Lauf ohne Wert. Recharts misst in jsdom nichts — geprüft wird nur der Container.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CompareChart } from './CompareChart';

describe('CompareChart', () => {
  it('rendert die Reihe und benennt sie für Screenreader', () => {
    const { container } = render(
      <CompareChart
        titel="Stall"
        einheit="kWh"
        punkte={[
          { x: '08/26 · V1', wert: 500 },
          { x: '09/26 · V1', wert: null },
          { x: '10/26 · V1', wert: 200 },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Diagramm: Stall (kWh) je Lauf' })).toBeInTheDocument();
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
  });
});
