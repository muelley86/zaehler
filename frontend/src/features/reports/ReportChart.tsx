/**
 * Recharts-Diagramm einer Auswertungs-Gruppe (Zählerart · Einheit).
 * - `categorical`: Balken je Ergebnis-Zeile, X-Achse = Gruppen-Label.
 * - `timeseries`: Linie oder Balken je Serie, X-Achse = Periodenende (Datum).
 *
 * Wird nur per `lazy()` aus `ReportResults` geladen — der einzige Pfad dieser
 * Route zum Recharts-Chunk, damit die Seite ohne Diagramm leicht bleibt.
 */

import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
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
import type { ReportChartGroup, ReportChartType } from './reportChartSeries';

// Konstante Margins als Modul-Consts, damit Recharts nicht bei jedem Render
// eine neue Object-Referenz sieht (Recharts vergleicht per ===).
const CHART_MARGIN = { top: 10, right: 16, bottom: 8, left: 8 } as const;
const COMPACT_CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

const CHART_HEIGHT = 320;
const COMPACT_CHART_HEIGHT = 220;

const X_TICK_GAP = 12;
const COMPACT_X_TICK_GAP = 28;
const COMPACT_Y_AXIS_WIDTH = 44;

// Über dieser Serienzahl wird die Legende ausgeblendet — die Labels bleiben
// über den Tooltip erreichbar.
const LEGEND_CAP = 12;
const COMPACT_LEGEND_CAP = 4;

const STROKE_WIDTH = 2;
const COMPACT_STROKE_WIDTH = 1.5;

// Bei sehr kurzen Reihen (z. B. ein einzelner Monats-Bucket) gäbe es ohne
// Punkte nichts zu sehen — eine Linie braucht mindestens zwei Stützstellen.
const DOTS_UP_TO_POINTS = 2;

// Linienstil je Serie — Serien sollen nicht NUR über Farbe unterscheidbar sein.
const DASH = ['', '6 4', '2 3', '8 4 2 4', '4 2', '1 3'] as const;

/** Stabile Modul-Funktion — sonst sähe Recharts bei jedem Render einen neuen Formatter. */
function formatYTick(value: number): string {
  return formatDe(value);
}

function identity(value: string): string {
  return value;
}

export interface ReportChartProps {
  group: ReportChartGroup;
  /** Nur im Zeitreihen-Modus relevant — kategorisch sind es immer Balken. */
  chartType: ReportChartType;
  /** Mobile-Darstellung (kleinere Höhe, weniger Ticks, keine Achsen-Beschriftung). */
  compact: boolean;
}

export const ReportChart = memo(function ReportChart({
  group,
  chartType,
  compact,
}: ReportChartProps) {
  const theme = useChartTheme();
  const { mode, seriesKeys, labelOf, data, unit } = group;
  const isTimeseries = mode === 'timeseries';
  const asBars = !isTimeseries || chartType === 'bar';
  // Ein einzelner „Verbrauch"-Balken je Zeile braucht keine Legende.
  const showLegend =
    seriesKeys.length > 1 && seriesKeys.length <= (compact ? COMPACT_LEGEND_CAP : LEGEND_CAP);
  const margin = compact ? COMPACT_CHART_MARGIN : CHART_MARGIN;
  const strokeWidth = compact ? COMPACT_STROKE_WIDTH : STROKE_WIDTH;
  const showDots = data.length <= DOTS_UP_TO_POINTS;
  const xFormatter = isTimeseries ? formatDateTickDe : identity;

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

  const axes = useMemo<ReactNode[]>(
    () => [
      <CartesianGrid key="grid" strokeDasharray="3 3" stroke={theme.grid} />,
      <XAxis
        key="x"
        dataKey="x"
        tick={{ fontSize: 11, fill: theme.axis }}
        stroke={theme.axis}
        tickFormatter={xFormatter}
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
        labelFormatter={xFormatter}
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
      xFormatter,
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
        {asBars ? (
          <BarChart data={data} margin={margin}>
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
        ) : (
          <LineChart data={data} margin={margin}>
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
                dot={showDots}
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
