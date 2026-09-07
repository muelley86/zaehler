import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatDateTickDe, formatDe } from '@/lib/format';
import { useChartTheme } from '@/lib/useChartTheme';
import type { ChartType } from './chartUtils';
import type { ComparisonRow } from './comparisonSeries';

// Konstante Margins als Modul-Consts, damit Recharts nicht bei jedem Render
// eine neue Object-Referenz sieht (Recharts vergleicht per ===).
const CHART_MARGIN = { top: 10, right: 16, bottom: 8, left: 8 } as const;
// Mobile: praktisch randlos — auf ~360 px Breite ist jeder Pixel Chart-Fläche
// wertvoller als Luft um die Achsen.
const COMPACT_CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

const CHART_HEIGHT = 320;
const COMPACT_CHART_HEIGHT = 220;

// Mindestabstand zweier X-Ticks. Mobile größer (weniger Datums-Labels, dafür
// lesbar) und zusätzlich `interval="preserveStartEnd"`, damit Anfang und Ende
// des Zeitraums immer beschriftet bleiben.
const X_TICK_GAP = 12;
const COMPACT_X_TICK_GAP = 28;

// Feste Y-Achsen-Breite auf Mobile statt Achsen-Label: die Einheit steht
// ohnehin im Section-Header, das Label würde nur Breite kosten.
const COMPACT_Y_AXIS_WIDTH = 44;

// Über dieser Serienzahl wird die Legende ausgeblendet — bei vielen Messstellen
// würde sie den Chart erdrücken. Die Labels bleiben über den Tooltip erreichbar.
const LEGEND_CAP = 12;
const COMPACT_LEGEND_CAP = 4;

const STROKE_WIDTH = 2;
const COMPACT_STROKE_WIDTH = 1.5;

// Linienstil je Serie — Serien sollen nicht NUR über Farbe unterscheidbar sein
// (Barrierefreiheit, color-not-only). Greift nur im Linien-Modus. Kombiniert mit
// der 6er-Farbpalette ergeben sich genügend unterscheidbare Serien-Stile für den
// Mehr-Messstellen-Vergleich (Firmen-Skala), ohne fragiles OKLCH-Parsing.
const DASH = ['', '6 4', '2 3', '8 4 2 4', '4 2', '1 3'] as const;

/** Stabile Modul-Funktion — sonst sähe Recharts bei jedem Render einen neuen Formatter. */
function formatYTick(value: number): string {
  return formatDe(value);
}

export interface ComparisonChartProps {
  groupId: string;
  series: ComparisonRow[];
  seriesKeys: string[];
  labelOf: Record<string, string>;
  chartType: ChartType;
  unit: string;
  /** Mobile-Darstellung (kleinere Höhe, weniger Ticks, keine Achsen-Beschriftung). */
  compact: boolean;
}

/**
 * Vergleichs-Chart: eine Serie je Messstelle (bzw. je Bezug/Einspeisung) als
 * Linie, Balken oder Fläche. Die Serien-Schlüssel sind Messstellen
 * (`mp-<id>::draw|feed`), nicht OBIS-Codes, und es gibt KEINEN
 * `bar→line`-Downgrade — hier werden Verbrauchswerte verglichen, keine
 * absoluten Stände.
 *
 * `compact` wird vom Aufrufer durchgereicht (aus `useIsDesktop()`), nicht hier
 * gemessen — so gibt es genau eine Quelle für die Breakpoint-Entscheidung.
 */
export const ComparisonChart = memo(function ComparisonChart({
  groupId,
  series,
  seriesKeys,
  labelOf,
  chartType,
  unit,
  compact,
}: ComparisonChartProps) {
  const theme = useChartTheme();
  const showLegend = seriesKeys.length <= (compact ? COMPACT_LEGEND_CAP : LEGEND_CAP);
  const margin = compact ? COMPACT_CHART_MARGIN : CHART_MARGIN;
  const strokeWidth = compact ? COMPACT_STROKE_WIDTH : STROKE_WIDTH;

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
  const legendWrapperStyle = useMemo(() => ({ fontSize: 12, color: theme.label }), [theme.label]);
  const tooltipFormatter = useCallback(
    (value: number | string, name: string): [string, string] => [
      `${formatDe(value)}${unit ? ' ' + unit : ''}`,
      labelOf[name] ?? name,
    ],
    [unit, labelOf],
  );
  const legendFormatter = useCallback((name: string) => labelOf[name] ?? name, [labelOf]);

  // Achsen/Grid/Tooltip/Legende sind für alle drei Chart-Typen identisch.
  const axes = useMemo<ReactNode[]>(
    () => [
      <CartesianGrid key="grid" strokeDasharray="3 3" stroke={theme.grid} />,
      <XAxis
        key="x"
        dataKey="date"
        tick={{ fontSize: 11, fill: theme.axis }}
        stroke={theme.axis}
        tickFormatter={formatDateTickDe}
        minTickGap={compact ? COMPACT_X_TICK_GAP : X_TICK_GAP}
        {...(compact ? { interval: 'preserveStartEnd' as const } : {})}
      />,
      <YAxis
        key="y"
        tick={{ fontSize: 11, fill: theme.axis }}
        stroke={theme.axis}
        tickFormatter={formatYTick}
        {...(compact
          ? { width: COMPACT_Y_AXIS_WIDTH }
          : unit
            ? {
                label: {
                  value: unit,
                  angle: -90,
                  position: 'insideLeft' as const,
                  offset: 10,
                  style: { textAnchor: 'middle' as const, fontSize: 11, fill: theme.axis },
                },
              }
            : {})}
      />,
      <Tooltip
        key="tt"
        contentStyle={tooltipContentStyle}
        labelStyle={tooltipLabelStyle}
        formatter={tooltipFormatter}
        labelFormatter={formatDateTickDe}
      />,
      showLegend ? (
        <Legend key="lg" formatter={legendFormatter} wrapperStyle={legendWrapperStyle} />
      ) : null,
    ],
    [
      theme,
      unit,
      showLegend,
      compact,
      tooltipContentStyle,
      tooltipLabelStyle,
      tooltipFormatter,
      legendFormatter,
      legendWrapperStyle,
    ],
  );

  const color = useCallback(
    (idx: number) => theme.palette[idx % theme.palette.length],
    [theme.palette],
  );

  return (
    <div className="w-full" style={{ height: compact ? COMPACT_CHART_HEIGHT : CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'bar' ? (
          <BarChart data={series} margin={margin}>
            {axes}
            {seriesKeys.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                name={key}
                fill={color(idx)}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : chartType === 'area' ? (
          <AreaChart data={series} margin={margin}>
            <defs>
              {seriesKeys.map((key, idx) => (
                <linearGradient
                  id={`comp-grad-${groupId}-${key}`}
                  key={`grad-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={color(idx)} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color(idx)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {axes}
            {seriesKeys.map((key, idx) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={color(idx)}
                fill={`url(#comp-grad-${groupId}-${key})`}
                strokeWidth={strokeWidth}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={series} margin={margin}>
            {axes}
            {seriesKeys.map((key, idx) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={color(idx)}
                strokeWidth={strokeWidth}
                strokeDasharray={DASH[idx % DASH.length] || undefined}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
});
