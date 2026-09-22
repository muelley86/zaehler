/**
 * Inhalte der beiden Hinweis-Kacheln (den Rahmen mit Titel liefert
 * `DashboardTile`):
 * - `DueCard`: fällige Messstellen (nie bzw. länger als ihr Ableseintervall
 *   nicht abgelesen, `dashboardMetrics.ts::selectStaleInsights`).
 * - `DeviationsCard`: auffällige Verbrauchs-Abweichungen ggü. der Vorperiode
 *   (`selectDeviationInsights`).
 * Mehr als `MAX_VISIBLE` Einträge werden standardmäßig eingeklappt — ein
 * Toggle blendet den Rest ein und wieder aus. Leer zeigen beide einen kurzen
 * Text, damit die Kachel (und damit die Anordnung) stabil bleibt.
 */

import { Fragment, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Section } from '@/components/ui';
import { formatDateDe, formatDe } from '@/lib/format';
import type { FlowDirection } from '@/lib/types';
import type { DeviationInsight, StaleInsight } from './dashboardMetrics';

const DIRECTION_LABEL: Record<FlowDirection, string> = {
  bezug: 'Bezug',
  einspeisung: 'Einspeisung',
};

const MAX_VISIBLE = 8;

function staleText(insight: StaleInsight): string {
  if (insight.daysSince === null) return `${insight.name}: noch nie abgelesen`;
  return `${insight.name}: letzte Ablesung vor ${insight.daysSince} Tagen (${formatDateDe(insight.lastReadingAt)})`;
}

function StaleRow({ insight }: { insight: StaleInsight }) {
  return (
    <li className="flex items-start gap-3 p-4">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <div className="flex-1 space-y-1">
        <div className="text-body text-label">{staleText(insight)}</div>
        <Link
          to={`/erfassen?mp=${insight.mpId}`}
          className="text-caption font-semibold text-primary hover:underline"
        >
          Jetzt erfassen
        </Link>
      </div>
    </li>
  );
}

function DeviationRow({ insight }: { insight: DeviationInsight }) {
  const deltaText = formatDe(insight.deltaPct, {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 1,
  });
  const text = `${insight.name}: ${deltaText} % ${DIRECTION_LABEL[insight.direction]} gegenüber Vorzeitraum (${formatDe(insight.previous)} → ${formatDe(insight.current)} ${insight.unit})`;
  const Icon = insight.deltaPct > 0 ? TrendingUp : TrendingDown;
  return (
    <li className="flex items-start gap-3 p-4">
      <Icon size={16} className="mt-0.5 shrink-0 text-tertiary" aria-hidden />
      <div className="flex-1 text-body text-label">{text}</div>
    </li>
  );
}

function ExpandableList<T>({
  items,
  itemKey,
  renderItem,
  emptyText,
}: {
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  emptyText: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  if (items.length === 0) {
    return (
      <Section>
        <p className="p-4 text-body text-secondary">{emptyText}</p>
      </Section>
    );
  }

  const hasMore = items.length > MAX_VISIBLE;
  const visible = expanded ? items : items.slice(0, MAX_VISIBLE);
  return (
    <Section>
      <ul id={listId} className="divide-y divide-separator">
        {visible.map((item) => (
          <Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>
        ))}
      </ul>
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="w-full border-t border-separator p-3 text-center text-caption font-semibold text-primary"
        >
          {expanded ? 'weniger anzeigen' : `+${items.length - MAX_VISIBLE} weitere`}
        </button>
      ) : null}
    </Section>
  );
}

export function DueCard({ insights }: { insights: StaleInsight[] }) {
  return (
    <ExpandableList
      items={insights}
      itemKey={(i) => `stale::${i.mpId}`}
      renderItem={(i) => <StaleRow insight={i} />}
      emptyText="Keine Messstelle fällig."
    />
  );
}

export function DeviationsCard({ insights }: { insights: DeviationInsight[] }) {
  return (
    <ExpandableList
      items={insights}
      itemKey={(i) => `deviation::${i.mpId}::${i.unit}::${i.direction}`}
      renderItem={(i) => <DeviationRow insight={i} />}
      emptyText="Keine Auffälligkeiten im Zeitraum."
    />
  );
}
