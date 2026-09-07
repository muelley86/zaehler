/**
 * Chart-Bereich des Dashboards: Kopfzeile mit Lade-Feedback und
 * Diagramm-Einstellungen, darunter je (Zählerart, Einheit)-Gruppe ein
 * Vergleichs-Chart.
 *
 * Das Chart wird `lazy` geladen — dieser Import ist der EINZIGE Pfad des
 * Dashboard-Chunks zu Recharts, damit die Route selbst leicht bleibt und der
 * schwere `recharts`-Chunk erst beim Anzeigen nachgeladen wird.
 */

import { Suspense, lazy } from 'react';
import { Filter, Loader2 } from 'lucide-react';

import { EmptyState, Section } from '@/components/ui';
import { TYPE_LABELS } from '@/lib/meterLabels';
import { ChartSkeleton } from './DashboardSkeletons';
import { ChartSettingsMenu } from './ChartSettingsMenu';
import type { ComparisonGroup } from './comparisonSeries';
import type { ChartPrefs } from './useChartPrefs';

const ComparisonChart = lazy(() =>
  import('./ComparisonChart').then((m) => ({ default: m.ComparisonChart })),
);

// Über dieser Serienzahl wird ein nicht-blockierender Hinweis eingeblendet, die
// Auswahl (z. B. über den Messstellen-Filter) einzugrenzen — sehr viele Linien
// werden sonst unleserlich.
const MAX_SERIES_HINT = 25;

const PARTIAL_FOOTER = 'Zeitraum nur teilweise durch Ablesungen abgedeckt';

export interface ChartSectionProps {
  groups: ComparisonGroup[];
  prefs: ChartPrefs;
  /** Ein Refetch läuft — die (noch alten) Charts bleiben stehen. */
  refreshing: boolean;
  /** Backend meldet: der Zeitraum ist nur teilweise durch Ablesungen gedeckt. */
  partial: boolean;
  /** Mobile-Darstellung; wird an Chart und Skeleton durchgereicht. */
  compact: boolean;
}

export function ChartSection({ groups, prefs, refreshing, partial, compact }: ChartSectionProps) {
  const totalSeries = groups.reduce((n, g) => n + g.seriesKeys.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="px-1 text-caption-bold uppercase text-tertiary">Verbrauchsverlauf</div>
        <div className="flex items-center gap-2">
          {refreshing ? (
            <span
              className="flex items-center gap-1.5 text-caption text-tertiary"
              role="status"
              aria-live="polite"
            >
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Aktualisiere…
            </span>
          ) : null}
          <ChartSettingsMenu prefs={prefs} />
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<Filter size={32} />}
          title="Kein Verbrauch im gewählten Zeitraum"
          description="Für die gefilterten Messstellen gibt es im gewählten Zeitraum keine berechenbaren Verbräuche."
        />
      ) : null}

      {totalSeries > MAX_SERIES_HINT ? (
        <div className="bg-fill/60 rounded-card border-hairline border-border px-4 py-3 text-caption text-secondary">
          {totalSeries} Serien im Vergleich — zur besseren Lesbarkeit die Auswahl eingrenzen (z. B.
          über den Messstellen-Filter).
        </div>
      ) : null}

      {groups.map((g) => {
        const groupId = `${g.type}-${g.unit}`;
        return (
          <Section key={groupId} header={`${TYPE_LABELS[g.type]} · ${g.unit}`}>
            <div className="p-5">
              <Suspense fallback={<ChartSkeleton compact={compact} />}>
                <ComparisonChart
                  groupId={groupId}
                  series={g.series}
                  seriesKeys={g.seriesKeys}
                  labelOf={g.labelOf}
                  chartType={prefs.chartType}
                  unit={g.unit}
                  compact={compact}
                />
              </Suspense>
            </div>
          </Section>
        );
      })}

      {partial && groups.length > 0 ? (
        <div className="px-1 text-caption text-tertiary">{PARTIAL_FOOTER}</div>
      ) : null}
    </div>
  );
}
