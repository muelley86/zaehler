/**
 * Dashboard: reine Orchestrierung. Daten (`useDashboardData`) und Filter
 * (`useDashboardFilters`) kommen aus Hooks, die Fachlogik aus
 * `dashboardSelectors`/`dashboardMetrics`, die Darstellung aus den
 * Präsentationskomponenten dieses Ordners (KPI-Kacheln, fällige Messstellen,
 * weitere Hinweise, Top-Verbraucher — Verbrauchs-Diagramme gibt es hier bewusst
 * nicht mehr, dafür ist die Auswertungen-Seite da).
 *
 * Die vier Bereiche sind Kacheln (`DashboardTile`), die der User per Drag & Drop
 * bzw. ▲/▼ anordnet und auf-/zuklappt; das Layout speichert
 * `useDashboardLayout` je Benutzer auf dem Server.
 *
 * Daten kommen ausschließlich aus `GET /dashboard` — Stammdaten für die
 * Filter stecken in derselben Antwort (kein zusätzlicher `/measuring-points`-
 * oder `/locations`-Request); dazu kommt nur das Kachel-Layout.
 */

import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent, ScreenReaderInstructions } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Filter, Loader2, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card, EmptyState, LargeTitle, Section } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { StaleDataHint } from '@/components/StaleDataHint';
import { formatDateDe } from '@/lib/format';
import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { DashboardFilters } from './DashboardFilters';
import { DashboardSkeleton } from './DashboardSkeletons';
import type { DashboardTileId } from '@/lib/types';
import { DashboardTile } from './DashboardTile';
import { DeviationsCard, DueCard } from './InsightCards';
import { KpiTiles } from './KpiTiles';
import { TopConsumers } from './TopConsumers';
import { isTileId } from './dashboardLayout';
import {
  selectDeviationInsights,
  selectKpiTiles,
  selectStaleInsights,
  selectTopConsumers,
} from './dashboardMetrics';
import {
  activeFilterChips,
  buildFilterOptions,
  selectFilteredItems,
  selectFilteredVirtual,
} from './dashboardSelectors';
import { useDashboardData } from './useDashboardData';
import { useDashboardFilters } from './useDashboardFilters';
import { useDashboardLayout } from './useDashboardLayout';

/** „01.06.2026 – 31.07.2026" für die Vergleichs-Fußzeile der KPI-Kacheln. */
function comparePeriodLabel(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  return `${formatDateDe(from)} – ${formatDateDe(to)}`;
}

// Gleicher Sachverhalt/Wortlaut wie bei `/reports/aggregate` (siehe
// ReportsPage.tsx): `partial` heißt „nur Messstellen mit Zugriff einbezogen",
// nicht „Zeitraum unvollständig durch Ablesungen gedeckt" — der Hinweis
// qualifiziert die KPI-Summen und die Top-Verbraucher direkt darunter.
const PARTIAL_HINT =
  'Als Erfasser werden nur Messstellen mit Zugriff einbezogen — die Summen können unvollständig sein.';

const TILE_TITLES: Record<DashboardTileId, string> = {
  kpi: 'Verbrauch im Zeitraum',
  due: 'Fällige Messstellen',
  insights: 'Weitere Hinweise',
  top: 'Top-Verbraucher',
};

// @dnd-kit bringt nur englische Ansagen mit.
const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Leertaste nimmt die Kachel auf, Pfeiltasten verschieben sie, Leertaste legt sie ab, Escape bricht ab.',
};

function tileTitle(id: string | number): string {
  return isTileId(id) ? TILE_TITLES[id] : String(id);
}

const ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `Kachel „${tileTitle(active.id)}“ aufgenommen.`,
  onDragOver: ({ active, over }) =>
    over ? `„${tileTitle(active.id)}“ über „${tileTitle(over.id)}“.` : undefined,
  onDragEnd: ({ active, over }) =>
    over
      ? `„${tileTitle(active.id)}“ an Position von „${tileTitle(over.id)}“ abgelegt.`
      : `„${tileTitle(active.id)}“ abgelegt.`,
  onDragCancel: ({ active }) => `Verschieben von „${tileTitle(active.id)}“ abgebrochen.`,
};

function EmptyTileText({ children }: { children: ReactNode }) {
  return (
    <Section>
      <p className="p-4 text-body text-secondary">{children}</p>
    </Section>
  );
}

export function DashboardPage() {
  const { dateRange } = useFilterPrefs();
  const { from, to } = dateRange;

  const { data, servedAt, loading, refreshing, error, retry } = useDashboardData(from, to);
  const { filters, setFilters, reset, activeCount } = useDashboardFilters();
  const { layout, ready: layoutReady, move, reorder, toggle } = useDashboardLayout();

  // Pointer: erst ab 5 px Bewegung ziehen, damit ein Tipp auf den Griff kein
  // Drag startet; der Griff hat `touch-none`, damit Touch-Drag nicht scrollt.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (over && isTileId(active.id) && isTileId(over.id)) reorder(active.id, over.id);
    },
    [reorder],
  );

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
  const dueInsights = useMemo(
    () => selectStaleInsights(filteredItems, new Date()),
    [filteredItems],
  );
  const deviationInsights = useMemo(() => selectDeviationInsights(filteredItems), [filteredItems]);
  const topGroups = useMemo(() => selectTopConsumers(filteredItems), [filteredItems]);

  const compareLabel = comparePeriodLabel(
    data?.previous_from_date ?? null,
    data?.previous_to_date ?? null,
  );
  const isEmptySetup = data !== null && items.length === 0 && virtualItems.length === 0;
  const isFilteredEmpty =
    data !== null && !isEmptySetup && filteredItems.length === 0 && filteredVirtual.length === 0;
  const showContent = data !== null && layoutReady && !isEmptySetup && !isFilteredEmpty;

  const tileBodies: Record<DashboardTileId, ReactNode> = {
    kpi:
      tiles.length > 0 ? (
        <KpiTiles tiles={tiles} {...(compareLabel ? { compareLabel } : {})} />
      ) : (
        <EmptyTileText>Kein Verbrauch im Zeitraum.</EmptyTileText>
      ),
    due: <DueCard insights={dueInsights} />,
    insights: <DeviationsCard insights={deviationInsights} />,
    top:
      topGroups.length > 0 ? (
        <TopConsumers groups={topGroups} />
      ) : (
        <EmptyTileText>Kein Bezug im Zeitraum.</EmptyTileText>
      ),
  };

  return (
    <PageContainer>
      <LargeTitle title="Dashboard" />
      <StaleDataHint servedAt={servedAt} />

      {/* Cache-Hit mit Hintergrund-Refetch (z. B. Monatswechsel per ◀/▶): die
          alten Zahlen bleiben stehen, das Feedback zeigt, dass neue kommen. */}
      {refreshing && data !== null ? (
        <span
          className="flex items-center gap-1.5 px-1 text-caption text-tertiary"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Aktualisiere…
        </span>
      ) : null}

      {/* Erst mit Daten: vorher hätten die Dropdowns keine Optionen — der
          `DashboardSkeleton` reserviert die Höhe der Leiste. */}
      {data !== null ? (
        <DashboardFilters
          filters={filters}
          options={options}
          virtualAvailable={virtualItems.length > 0}
          activeCount={activeCount}
          chips={chips}
          onChange={setFilters}
          onReset={reset}
        />
      ) : null}

      {error !== null && data === null ? (
        <Card>
          <div className="space-y-3">
            <div className="text-danger">{error}</div>
            <Button variant="tinted" size="sm" onClick={retry}>
              Erneut versuchen
            </Button>
          </div>
        </Card>
      ) : null}

      {loading || (data !== null && !layoutReady) ? <DashboardSkeleton /> : null}

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
          {data?.partial ? (
            <div
              role="note"
              className="bg-fill/60 rounded-card border-hairline border-border px-4 py-3 text-caption text-secondary"
            >
              {PARTIAL_HINT}
            </div>
          ) : null}
          {/* Reihenfolge = Benutzer-Layout. Mobil eine Spalte, ab `lg` zwei;
              die KPI-Kachel ist breit und nimmt die ganze Zeile ein. */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{
              announcements: ANNOUNCEMENTS,
              screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
            }}
          >
            <SortableContext items={layout.order} strategy={rectSortingStrategy}>
              <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start">
                {layout.order.map((id, index) => (
                  <DashboardTile
                    key={id}
                    id={id}
                    title={TILE_TITLES[id]}
                    {...(id === 'due' ? { count: dueInsights.length } : {})}
                    collapsed={layout.collapsed.includes(id)}
                    isFirst={index === 0}
                    isLast={index === layout.order.length - 1}
                    onMove={move}
                    onToggle={toggle}
                    {...(id === 'kpi' ? { className: 'lg:col-span-2' } : {})}
                  >
                    {tileBodies[id]}
                  </DashboardTile>
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
