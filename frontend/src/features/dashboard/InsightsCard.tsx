/**
 * Hinweise-Karte: nie/lange nicht abgelesene Messstellen und auffällige
 * Verbrauchs-Abweichungen ggü. der Vorperiode (`dashboardMetrics.ts::selectInsights`).
 * Mehr als `MAX_VISIBLE` Einträge werden standardmäßig eingeklappt — ein
 * Toggle blendet den Rest ein und wieder aus.
 */

import { useState } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Section } from '@/components/ui';
import { formatDateDe, formatDe } from '@/lib/format';
import type { FlowDirection } from '@/lib/types';
import type { Insight } from './dashboardMetrics';

const DIRECTION_LABEL: Record<FlowDirection, string> = {
  bezug: 'Bezug',
  einspeisung: 'Einspeisung',
};

const MAX_VISIBLE = 8;

function staleText(insight: Extract<Insight, { kind: 'stale' }>): string {
  if (insight.daysSince === null) return `${insight.name}: noch nie abgelesen`;
  return `${insight.name}: letzte Ablesung vor ${insight.daysSince} Tagen (${formatDateDe(insight.lastReadingAt)})`;
}

function StaleRow({ insight }: { insight: Extract<Insight, { kind: 'stale' }> }) {
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

function DeviationRow({ insight }: { insight: Extract<Insight, { kind: 'deviation' }> }) {
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

function insightKey(insight: Insight): string {
  if (insight.kind === 'stale') return `stale::${insight.mpId}`;
  return `deviation::${insight.mpId}::${insight.unit}::${insight.direction}`;
}

export interface InsightsCardProps {
  insights: Insight[];
}

export function InsightsCard({ insights }: InsightsCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (insights.length === 0) return null;

  const hasMore = insights.length > MAX_VISIBLE;
  const visible = expanded ? insights : insights.slice(0, MAX_VISIBLE);
  const remaining = insights.length - MAX_VISIBLE;

  return (
    <Section header="Hinweise">
      <ul className="divide-y divide-separator">
        {visible.map((insight) =>
          insight.kind === 'stale' ? (
            <StaleRow key={insightKey(insight)} insight={insight} />
          ) : (
            <DeviationRow key={insightKey(insight)} insight={insight} />
          ),
        )}
      </ul>
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full border-t border-separator p-3 text-center text-caption font-semibold text-primary"
        >
          {expanded ? 'weniger anzeigen' : `+${remaining} weitere`}
        </button>
      ) : null}
    </Section>
  );
}
