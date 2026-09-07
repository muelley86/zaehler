/**
 * Dashboard: reine Orchestrierung. Daten (`useDashboardData`), View-Controls
 * (`useChartPrefs`) und Filter (`useDashboardFilters`) kommen aus Hooks, die
 * Fachlogik aus `dashboardSelectors`/`dashboardMetrics`, die Darstellung aus
 * den Präsentationskomponenten dieses Ordners.
 *
 * Die Seite spricht ausschließlich `GET /dashboard` an — Stammdaten für die
 * Filter kommen aus derselben Antwort (kein zusätzlicher `/measuring-points`-
 * oder `/locations`-Request).
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Filter, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card, EmptyState, LargeTitle } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { StaleDataHint } from '@/components/StaleDataHint';
import { formatDateDe } from '@/lib/format';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { ChartSection } from './ChartSection';
import { DashboardFilters } from './DashboardFilters';
import { DashboardSkeleton } from './DashboardSkeletons';
import { InsightsCard } from './InsightsCard';
import { KpiTiles } from './KpiTiles';
import { TopConsumers } from './TopConsumers';
import { buildComparisonGroups } from './comparisonSeries';
import { selectInsights, selectKpiTiles, selectTopConsumers } from './dashboardMetrics';
import {
  activeFilterChips,
  buildFilterOptions,
  selectFilteredItems,
  selectFilteredVirtual,
} from './dashboardSelectors';
import { useChartPrefs } from './useChartPrefs';
import { useDashboardData } from './useDashboardData';
import { useDashboardFilters } from './useDashboardFilters';

/** „01.06.2026 – 31.07.2026" für die Vergleichs-Fußzeile der KPI-Kacheln. */
function comparePeriodLabel(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  return `${formatDateDe(from)} – ${formatDateDe(to)}`;
}

export function DashboardPage() {
  const { dateRange } = useFilterPrefs();
  const { from, to } = dateRange;
  const isDesktop = useIsDesktop();

  const prefs = useChartPrefs(from, to);
  // `retry`/`setFilters`/`reset` bleiben bewusst am Objekt (statt destrukturiert):
  // die Hooks deklarieren sie in Methoden-Syntax, was beim Destrukturieren
  // `@typescript-eslint/unbound-method` auslöst.
  const dashboard = useDashboardData(from, to, prefs.granularity);
  const { data, servedAt, loading, refreshing, error } = dashboard;
  const dashboardFilters = useDashboardFilters();
  const { filters, activeCount } = dashboardFilters;

  const items = useMemo(() => data?.items ?? [], [data]);
  const virtualItems = useMemo(() => data?.virtual_items ?? [], [data]);

  const filteredItems = useMemo(() => selectFilteredItems(items, filters), [items, filters]);
  const filteredVirtual = useMemo(
    () => selectFilteredVirtual(virtualItems, filters),
    [virtualItems, filters],
  );

  const options = useMemo(
    () => buildFilterOptions(items, virtualItems, filters),
    [items, virtualItems, filters],
  );
  const chips = useMemo(
    () => activeFilterChips(filters, options, items),
    [filters, options, items],
  );

  const tiles = useMemo(
    () => selectKpiTiles(filteredItems, filteredVirtual),
    [filteredItems, filteredVirtual],
  );
  const insights = useMemo(
    () => selectInsights(filteredItems, { now: new Date() }),
    [filteredItems],
  );
  const topGroups = useMemo(() => selectTopConsumers(filteredItems), [filteredItems]);
  const groups = useMemo(
    () => buildComparisonGroups({ items: filteredItems, virtualItems: filteredVirtual }),
    [filteredItems, filteredVirtual],
  );

  const compareLabel = comparePeriodLabel(
    data?.previous_from_date ?? null,
    data?.previous_to_date ?? null,
  );
  const isEmptySetup = data !== null && items.length === 0 && virtualItems.length === 0;
  const isFilteredEmpty =
    data !== null && !isEmptySetup && filteredItems.length === 0 && filteredVirtual.length === 0;
  const showContent = data !== null && !isEmptySetup && !isFilteredEmpty;

  return (
    <PageContainer>
      <LargeTitle title="Dashboard" />
      <StaleDataHint servedAt={servedAt} />

      <DashboardFilters
        filters={filters}
        options={options}
        virtualAvailable={virtualItems.length > 0}
        activeCount={activeCount}
        chips={chips}
        onChange={(next) => dashboardFilters.setFilters(next)}
        onReset={() => dashboardFilters.reset()}
      />

      {error !== null && data === null ? (
        <Card>
          <div className="space-y-3">
            <div className="text-danger">{error}</div>
            <Button variant="tinted" size="sm" onClick={() => dashboard.retry()}>
              Erneut versuchen
            </Button>
          </div>
        </Card>
      ) : null}

      {loading ? <DashboardSkeleton compact={!isDesktop} /> : null}

      {isEmptySetup ? (
        <EmptyState
          icon={<Plus size={32} />}
          title="Noch keine Messstellen"
          description="Lege deine erste Strom-, Gas- oder Wasser-Messstelle an."
          action={
            <Link to="/admin/messstellen">
              <Button variant="filled" leftIcon={<Plus size={16} />}>
                Messstelle anlegen
              </Button>
            </Link>
          }
        />
      ) : null}

      {isFilteredEmpty ? (
        <EmptyState icon={<Filter size={32} />} title="Keine Messstellen entsprechen dem Filter" />
      ) : null}

      {showContent ? (
        <>
          <KpiTiles tiles={tiles} {...(compareLabel ? { compareLabel } : {})} />
          <ChartSection
            groups={groups}
            prefs={prefs}
            refreshing={refreshing}
            partial={data?.partial ?? false}
            compact={!isDesktop}
          />
          {insights.length > 0 || topGroups.length > 0 ? (
            <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
              <div className="space-y-5">
                <InsightsCard insights={insights} />
              </div>
              <div className="space-y-5">
                <TopConsumers groups={topGroups} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}

function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 space-y-5 p-4 pb-12 md:p-7">{children}</div>
    </div>
  );
}
