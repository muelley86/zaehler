/**
 * Ergebnisblock der Auswertungen: Platzhalter vor dem ersten Lauf, Hinweis auf
 * geänderte Filter, Umschalter Tabelle | Diagramm (+ Linie | Balken bei
 * Zeitreihen). Das Diagramm wird erst beim Umschalten gemountet und dabei
 * `lazy` nachgeladen — dieser Import ist der EINZIGE Pfad der Route zum
 * Recharts-Chunk.
 */

import { Suspense, lazy, useMemo, useState } from 'react';
import { BarChart3, Filter } from 'lucide-react';

import { EmptyState, Pill, Section } from '@/components/ui';
import { TYPE_LABELS } from '@/lib/meterLabels';
import { ComparisonTable, ResultTable } from './ReportTables';
import {
  MAX_CHART_SERIES_HINT,
  buildReportChartGroups,
  countSeries,
  type ReportChartGroup,
  type ReportChartType,
} from './reportChartSeries';
import type { ComparisonPeriods, ComparisonRow } from './reportUtils';
import type { ReportRun } from './useReportQuery';

const ReportChart = lazy(() => import('./ReportChart').then((m) => ({ default: m.ReportChart })));

type ViewMode = 'table' | 'chart';

const VIEW_LABELS: Record<ViewMode, string> = { table: 'Tabelle', chart: 'Diagramm' };
const CHART_TYPE_LABELS: Record<ReportChartType, string> = { line: 'Linie', bar: 'Balken' };

export interface ReportResultsProps {
  run: ReportRun | null;
  loading: boolean;
  /** Filter seit dem letzten Lauf geändert. */
  stale: boolean;
  /** Vergleichs-Zeilen des Laufs (nur im Vergleichsmodus). */
  comparison: ComparisonRow[] | null;
  /** Zeitraum-Labels des Vergleichs (Tabellen-Köpfe, Diagramm-Legende). */
  comparisonPeriods: ComparisonPeriods | null;
  showPeriodCol: boolean;
  groupHeader: string;
  /** Mobile-Darstellung des Diagramms. */
  compact: boolean;
}

function ChartSkeleton({ compact }: { compact: boolean }) {
  return (
    <div
      aria-hidden
      className="animate-pulse rounded-card bg-fill"
      style={{ height: compact ? 220 : 320 }}
    />
  );
}

function ChartView({
  groups,
  chartType,
  compact,
}: {
  groups: ReportChartGroup[];
  chartType: ReportChartType;
  compact: boolean;
}) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={32} />}
        title="Keine Daten"
        description="Für die gewählte Konfiguration gibt es keine Verbrauchswerte."
      />
    );
  }
  const totalSeries = countSeries(groups);
  return (
    <div className="space-y-5">
      {totalSeries > MAX_CHART_SERIES_HINT ? (
        <div className="bg-fill/60 rounded-card border-hairline border-border px-4 py-3 text-caption text-secondary">
          {totalSeries} Serien im Diagramm — zur besseren Lesbarkeit die Auswahl über die Filter
          eingrenzen.
        </div>
      ) : null}
      {groups.map((g) => (
        <Section key={g.id} header={`${TYPE_LABELS[g.meterType]} · ${g.unit}`}>
          <div className="p-5">
            <Suspense fallback={<ChartSkeleton compact={compact} />}>
              <ReportChart group={g} chartType={chartType} compact={compact} />
            </Suspense>
          </div>
        </Section>
      ))}
    </div>
  );
}

export function ReportResults({
  run,
  loading,
  stale,
  comparison,
  comparisonPeriods,
  showPeriodCol,
  groupHeader,
  compact,
}: ReportResultsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [chartType, setChartType] = useState<ReportChartType>('line');

  // Nur im Diagramm-Modus rechnen — die Tabelle braucht die Gruppen nicht.
  const groups = useMemo(
    () =>
      run !== null && viewMode === 'chart'
        ? buildReportChartGroups({
            rows: run.result.rows,
            comparison,
            granularity: run.input.granularity,
            ...(comparisonPeriods ? { comparisonLabels: comparisonPeriods } : {}),
          })
        : [],
    [run, comparison, comparisonPeriods, viewMode],
  );
  const hasTimeseries = groups.some((g) => g.mode === 'timeseries');

  if (run === null) {
    return (
      <EmptyState
        icon={<Filter size={32} />}
        title="Noch keine Auswertung"
        description={'Filter wählen und „Auswerten" drücken.'}
      />
    );
  }

  return (
    <div className="space-y-3" aria-busy={loading}>
      {stale ? (
        <div
          role="status"
          className="rounded-card border-hairline border-warning/40 bg-warning/10 px-4 py-2 text-caption text-secondary"
        >
          Filter geändert – erneut auswerten.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Darstellung" className="flex items-center gap-1.5">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
            <Pill key={mode} size="sm" active={viewMode === mode} onClick={() => setViewMode(mode)}>
              {VIEW_LABELS[mode]}
            </Pill>
          ))}
        </div>
        {viewMode === 'chart' && hasTimeseries ? (
          <div role="group" aria-label="Diagrammtyp" className="flex items-center gap-1.5">
            {(Object.keys(CHART_TYPE_LABELS) as ReportChartType[]).map((t) => (
              <Pill key={t} size="sm" active={chartType === t} onClick={() => setChartType(t)}>
                {CHART_TYPE_LABELS[t]}
              </Pill>
            ))}
          </div>
        ) : null}
      </div>

      <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
        {viewMode === 'chart' ? (
          <ChartView groups={groups} chartType={chartType} compact={compact} />
        ) : comparison && comparisonPeriods ? (
          <ComparisonTable
            rows={comparison}
            groupHeader={groupHeader}
            periods={comparisonPeriods}
          />
        ) : (
          <ResultTable
            rows={run.result.rows}
            showPeriod={showPeriodCol}
            groupHeader={groupHeader}
          />
        )}
      </div>
    </div>
  );
}
