/**
 * Render-Smoke für den Vergleichs-Chart: alle drei Diagrammtypen und beide
 * Darstellungen (`compact` = mobil) müssen unter jsdom fehlerfrei mounten.
 * Recharts misst in jsdom nichts (kein Layout) — geprüft wird deshalb nur,
 * dass der Chart-Container samt SVG-Wurzel entsteht, nicht seine Geometrie.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type { ChartType } from './chartUtils';
import type { ComparisonRow } from './comparisonSeries';
import { ComparisonChart } from './ComparisonChart';

const SERIES: ComparisonRow[] = [
  { date: '2026-08-31', 'mp-1::draw': 5, 'mp-2::draw': 8 },
  { date: '2026-09-30', 'mp-1::draw': 7, 'mp-2::draw': 3 },
];
const SERIES_KEYS = ['mp-1::draw', 'mp-2::draw'];
const LABEL_OF = { 'mp-1::draw': 'Wasser Garten', 'mp-2::draw': 'Wasser Haus' };

const CHART_TYPES: ChartType[] = ['line', 'bar', 'area'];

function renderChart(chartType: ChartType, compact: boolean) {
  return render(
    <ComparisonChart
      groupId="water-m³"
      series={SERIES}
      seriesKeys={SERIES_KEYS}
      labelOf={LABEL_OF}
      chartType={chartType}
      unit="m³"
      compact={compact}
    />,
  );
}

describe('ComparisonChart', () => {
  for (const chartType of CHART_TYPES) {
    it(`rendert den Typ "${chartType}" in der Desktop-Darstellung`, () => {
      const { container } = renderChart(chartType, false);

      expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
      expect(container.firstElementChild).toHaveStyle({ height: '320px' });
    });
  }

  it('rendert kompakt mit reduzierter Höhe', () => {
    const { container } = renderChart('line', true);

    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
    expect(container.firstElementChild).toHaveStyle({ height: '220px' });
  });
});
