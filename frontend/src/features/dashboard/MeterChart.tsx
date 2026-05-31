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

// Konstante Margin als Modul-Const, damit Recharts nicht bei jedem Render eine
// neue Object-Referenz sieht (Recharts vergleicht per ===).
const CHART_MARGIN = { top: 10, right: 16, bottom: 8, left: 8 } as const;

// Linienstil je Serie — Serien sollen nicht NUR über Farbe unterscheidbar sein
// (Barrierefreiheit, color-not-only). Greift nur im Linien-Modus.
const DASH = ['', '6 4', '2 3', '8 4 2 4', '4 2', '1 3'] as const;

type Series = Array<Record<string, number | string> & { date: string }>;

/**
 * Rendert die Verbrauchs-/Stand-Serie als Linie, Balken oder Fläche. Kapselt
 * Theme-Anbindung, Achsen, Tooltip und Legende, damit `MeasuringPointCard`
 * schlank bleibt. Absolute Zählerstände als Balken sind unlesbar — im
 * `level`-Modus wird `bar` daher als Linie gerendert.
 */
export function MeterChart({
  mpId,
  series,
  obisCodes,
  chartType,
  mode,
  unit,
  seriesLabel,
}: {
  mpId: number;
  series: Series;
  obisCodes: string[];
  chartType: ChartType;
  mode: 'consumption' | 'level';
  unit: string;
  seriesLabel: (code: string) => string;
}) {
  const theme = useChartTheme();
  const effectiveType: ChartType = mode === 'level' && chartType === 'bar' ? 'line' : chartType;

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
      seriesLabel(String(name)),
    ],
    [unit, seriesLabel],
  );
  const legendFormatter = useCallback((name: string) => seriesLabel(String(name)), [seriesLabel]);

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
    <Legend key="lg" formatter={legendFormatter} wrapperStyle={legendWrapperStyle} />,
  ];

  const color = (idx: number) => theme.palette[idx % theme.palette.length];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {effectiveType === 'bar' ? (
          <BarChart data={series} margin={CHART_MARGIN}>
            {axes}
            {obisCodes.map((code, idx) => (
              <Bar
                key={code}
                dataKey={code}
                name={code}
                fill={color(idx)}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : effectiveType === 'area' ? (
          <AreaChart data={series} margin={CHART_MARGIN}>
            <defs>
              {obisCodes.map((code, idx) => (
                <linearGradient
                  id={`dash-grad-${mpId}-${code}`}
                  key={`grad-${code}-${idx}`}
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
            {obisCodes.map((code, idx) => (
              <Area
                key={code}
                type="monotone"
                dataKey={code}
                name={code}
                stroke={color(idx)}
                fill={`url(#dash-grad-${mpId}-${code})`}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={series} margin={CHART_MARGIN}>
            {axes}
            {obisCodes.map((code, idx) => (
              <Line
                key={code}
                type="monotone"
                dataKey={code}
                name={code}
                stroke={color(idx)}
                strokeWidth={2}
                strokeDasharray={DASH[idx % DASH.length] || undefined}
                dot={mode === 'level' ? { r: 3 } : false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
