/**
 * Render-Smoke für das Auswertungs-Diagramm: beide Modi (kategorisch,
 * Zeitreihe) × Linie/Balken × Desktop/kompakt müssen unter jsdom fehlerfrei
 * mounten. Recharts misst in jsdom nichts — geprüft wird nur, dass der
 * Chart-Container entsteht, nicht seine Geometrie.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { ReportChart } from './ReportChart';
import type { ReportChartGroup, ReportChartType } from './reportChartSeries';

const CATEGORICAL: ReportChartGroup = {
  id: 'electricity::kWh',
  meterType: 'electricity',
  unit: 'kWh',
  mode: 'categorical',
  seriesKeys: ['value'],
  labelOf: { value: 'Verbrauch' },
  data: [
    { x: 'Halle', value: 120 },
    { x: 'Büro', value: 80 },
  ],
};

const TIMESERIES: ReportChartGroup = {
  id: 'water::m³',
  meterType: 'water',
  unit: 'm³',
  mode: 'timeseries',
  seriesKeys: ['r|1|Garten|water|m³|bezug', 'r|2|Haus|water|m³|bezug'],
  labelOf: { 'r|1|Garten|water|m³|bezug': 'Garten', 'r|2|Haus|water|m³|bezug': 'Haus' },
  data: [
    { x: '2026-08-31', 'r|1|Garten|water|m³|bezug': 5, 'r|2|Haus|water|m³|bezug': 8 },
    { x: '2026-09-30', 'r|1|Garten|water|m³|bezug': 7, 'r|2|Haus|water|m³|bezug': 3 },
  ],
};

const CHART_TYPES: ReportChartType[] = ['line', 'bar'];

describe('ReportChart', () => {
  for (const chartType of CHART_TYPES) {
    it(`rendert die Zeitreihe als "${chartType}" in der Desktop-Darstellung`, () => {
      const { container } = render(
        <ReportChart group={TIMESERIES} chartType={chartType} compact={false} />,
      );

      expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
      expect(container.firstElementChild).toHaveStyle({ height: '320px' });
    });
  }

  it('rendert kategorische Balken (Diagrammtyp wird ignoriert)', () => {
    const { container } = render(
      <ReportChart group={CATEGORICAL} chartType="line" compact={false} />,
    );

    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
  });

  it('rendert kompakt mit reduzierter Höhe', () => {
    const { container } = render(<ReportChart group={TIMESERIES} chartType="line" compact />);

    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
    expect(container.firstElementChild).toHaveStyle({ height: '220px' });
  });
});
