import { useCallback, useMemo } from 'react';
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

// Konstante Margin als Modul-Const, damit Recharts nicht bei jedem Render eine
// neue Object-Referenz sieht (Recharts vergleicht per ===).
const CHART_MARGIN = { top: 10, right: 16, bottom: 8, left: 8 } as const;

// Linienstil je Serie — Serien sollen nicht NUR über Farbe unterscheidbar sein
// (Barrierefreiheit, color-not-only). Greift nur im Linien-Modus. Kombiniert mit
// der 6er-Farbpalette ergeben sich genügend unterscheidbare Serien-Stile für den
// Mehr-Messstellen-Vergleich (Firmen-Skala), ohne fragiles OKLCH-Parsing.
const DASH = ['', '6 4', '2 3', '8 4 2 4', '4 2', '1 3'] as const;

// Über dieser Serienzahl wird die Legende ausgeblendet — bei vielen Messstellen
// würde sie den Chart erdrücken. Die Labels bleiben über den Tooltip erreichbar.
const LEGEND_CAP = 12;

/**
 * Vergleichs-Chart: eine Serie je Messstelle (bzw. je Bezug/Einspeisung) als
 * Linie, Balken oder Fläche. Anders als `MeterChart` sind die Serien-Schlüssel
 * Messstellen (`mp-<id>::draw|feed`), nicht OBIS-Codes, und es gibt KEINEN
 * `bar→line`-Downgrade — hier werden Verbrauchswerte verglichen, keine
 * absoluten Stände.
 */
export function ComparisonChart({
  groupId,
  series,
  seriesKeys,
  labelOf,
  chartType,
  unit,
}: {
  groupId: string;
  series: ComparisonRow[];
  seriesKeys: string[];
  labelOf: Record<string, string>;
  chartType: ChartType;
  unit: string;
}) {
  const theme = useChartTheme();
  const showLegend = seriesKeys.length <= LEGEND_CAP;

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
      `${formatDe(value as number)}${unit ? ' ' + unit : ''}`,
      labelOf[name] ?? name,
    ],
    [unit, labelOf],
  );
  const legendFormatter = useCallback((name: string) => labelOf[name] ?? name, [labelOf]);

  // Achsen/Grid/Tooltip/Legende sind für alle drei Chart-Typen identisch.
  const axes: ReactNode[] = [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke={theme.grid} />,
    <XAxis
      key="x"
      dataKey="date"
      tick={{ fontSize: 11, fill: theme.axis }}
      stroke={theme.axis}
      tickFormatter={formatDateTickDe}
    />,
    <YAxis
      key="y"
      tick={{ fontSize: 11, fill: theme.axis }}
      stroke={theme.axis}
      tickFormatter={(v) => formatDe(v as number)}
      {...(unit
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
  ];

  const color = (idx: number) => theme.palette[idx % theme.palette.length];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'bar' ? (
          <BarChart data={series} margin={CHART_MARGIN}>
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
          <AreaChart data={series} margin={CHART_MARGIN}>
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
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={series} margin={CHART_MARGIN}>
            {axes}
            {seriesKeys.map((key, idx) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={color(idx)}
                strokeWidth={2}
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
}
