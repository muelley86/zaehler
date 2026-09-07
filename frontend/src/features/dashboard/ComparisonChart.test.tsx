/**
 * Render-Smoke für den Vergleichs-Chart: alle drei Diagrammtypen und beide
 * Darstellungen (`compact` = mobil) müssen unter jsdom fehlerfrei mounten.
 * Recharts misst in jsdom nichts (kein Layout) — geprüft wird deshalb nur, dass
 * der Chart-Container entsteht, nicht seine Geometrie. Der Legenden-Cap braucht
 * eine gemessene Größe und stellt sich den ResizeObserver dafür lokal um.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

  describe('Legenden-Cap', () => {
    // Recharts' ResponsiveContainer rendert seine Kinder erst, wenn der
    // ResizeObserver eine Größe > 0 meldet — der globale Test-Stub meldet nie
    // etwas, in jsdom bliebe der Chart also leer. Hier ersetzen wir ihn durch
    // einen, der beim `observe` sofort eine feste Größe liefert; nur so ist
    // überhaupt beobachtbar, ob eine Legende gerendert wird.
    const RealResizeObserver = globalThis.ResizeObserver;

    beforeAll(() => {
      globalThis.ResizeObserver = class implements ResizeObserver {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element): void {
          const entry = { target, contentRect: { width: 600, height: 320 } };
          this.callback([entry] as unknown as ResizeObserverEntry[], this);
        }
        unobserve(): void {}
        disconnect(): void {}
      };
    });

    afterAll(() => {
      globalThis.ResizeObserver = RealResizeObserver;
    });

    /** Fünf Serien: über dem Mobile-Cap (4), unter dem Desktop-Cap (12). */
    function renderFiveSeries(compact: boolean) {
      const seriesKeys = Array.from({ length: 5 }, (_, i) => `mp-${i}::draw`);
      const labelOf: Record<string, string> = {};
      const row: ComparisonRow = { date: '2026-08-31' };
      for (const [i, key] of seriesKeys.entries()) {
        labelOf[key] = `Messstelle ${i}`;
        row[key] = i + 1;
      }
      return render(
        <ComparisonChart
          groupId="water-m³"
          series={[row]}
          seriesKeys={seriesKeys}
          labelOf={labelOf}
          chartType="line"
          unit="m³"
          compact={compact}
        />,
      );
    }

    it('blendet die Legende auf Mobile ab mehr als vier Serien aus', () => {
      const { container } = renderFiveSeries(true);

      expect(container.querySelector('.recharts-legend-wrapper')).toBeNull();
    });

    it('zeigt die Legende auf Desktop bei fünf Serien weiterhin', () => {
      const { container } = renderFiveSeries(false);

      expect(container.querySelector('.recharts-legend-wrapper')).not.toBeNull();
    });
  });
});
