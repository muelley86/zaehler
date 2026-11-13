/**
 * Diagramm des Lauf-Vergleichs: die gewählte Zeile (Kennzahl, Empfänger oder Position) als Balken
 * je Lauf — so fällt ein Ausreißer in einer Reihe von Monaten sofort auf.
 *
 * Wird nur per `lazy()` aus `BillingComparePage` geladen, damit die Abrechnungsseiten ohne
 * Diagramm den Recharts-Chunk nicht brauchen.
 */
import { memo, useCallback, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipValueType } from 'recharts';

import { formatDe } from '@/lib/format';
import { useChartTheme } from '@/lib/useChartTheme';

/** Für die Darstellung als Zahl — gerechnet wird mit diesen Werten nicht. */
export interface ComparePoint {
  x: string;
  wert: number | null;
}

export interface CompareChartProps {
  titel: string;
  einheit: string;
  punkte: ComparePoint[];
}

// Konstante Margins als Modul-Const, damit Recharts nicht bei jedem Render eine neue
// Object-Referenz sieht (Recharts vergleicht per ===).
const CHART_MARGIN = { top: 10, right: 16, bottom: 8, left: 8 } as const;
const CHART_HEIGHT = 260;
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const MAX_BAR_SIZE = 48;

function formatYTick(value: number): string {
  return formatDe(value);
}

export const CompareChart = memo(function CompareChart({
  titel,
  einheit,
  punkte,
}: CompareChartProps) {
  const theme = useChartTheme();
  const tooltipContentStyle = useMemo(
    () => ({
      backgroundColor: theme.tooltipBg,
      border: `1px solid ${theme.tooltipBorder}`,
      borderRadius: 12,
      color: theme.label,
    }),
    [theme],
  );
  const tooltipLabelStyle = useMemo(() => ({ color: theme.label }), [theme.label]);
  const tooltipFormatter = useCallback(
    (value: TooltipValueType | undefined): [string, string] => [
      `${typeof value === 'number' || typeof value === 'string' ? formatDe(value) : ''} ${einheit}`,
      titel,
    ],
    [einheit, titel],
  );

  return (
    <div role="img" aria-label={`Diagramm: ${titel} (${einheit}) je Lauf`}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={punkte} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis dataKey="x" tick={{ fontSize: 11, fill: theme.axis }} stroke={theme.axis} />
          <YAxis
            tick={{ fontSize: 11, fill: theme.axis }}
            stroke={theme.axis}
            tickFormatter={formatYTick}
          />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            formatter={tooltipFormatter}
          />
          <Bar
            dataKey="wert"
            fill={theme.palette[0] ?? theme.axis}
            radius={BAR_RADIUS}
            maxBarSize={MAX_BAR_SIZE}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
