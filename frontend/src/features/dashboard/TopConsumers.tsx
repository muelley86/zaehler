/**
 * Top-Verbraucher: Ranking der Messstellen mit dem höchsten Bezug je
 * (Zählerart, Einheit) — eine Section je Gruppe
 * (`dashboardMetrics.ts::selectTopConsumers`).
 */

import { Section } from '@/components/ui';
import { formatDe } from '@/lib/format';
import { TYPE_LABELS } from '@/lib/meterLabels';
import type { TopConsumerGroup } from './dashboardMetrics';

/** Nimmt `others` direkt entgegen (statt es erneut auf `null` zu prüfen) — die
 *  Aufrufstelle spread't die Prop bereits nur, wenn `group.others` gesetzt ist. */
function OthersFooter({
  others,
  unit,
}: {
  others: NonNullable<TopConsumerGroup['others']>;
  unit: string;
}) {
  return (
    <>
      Weitere {others.count}: {formatDe(others.value)} {unit}
    </>
  );
}

function ConsumerRow({
  entry,
  rank,
  unit,
}: {
  entry: TopConsumerGroup['entries'][number];
  rank: number;
  unit: string;
}) {
  return (
    <li className="space-y-1.5 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1 truncate text-body text-label">
          <span className="text-tertiary">{rank}.</span> {entry.name}
        </div>
        <div className="num shrink-0 text-body-sm text-secondary">
          {formatDe(entry.value)} <span className="text-caption text-tertiary">{unit}</span>
        </div>
        <div className="num shrink-0 text-caption text-tertiary">
          {formatDe(entry.sharePct, { maximumFractionDigits: 1 })} %
        </div>
      </div>
      <div className="h-1 rounded-full bg-fill" aria-hidden>
        <div className="h-1 rounded-full bg-primary" style={{ width: `${entry.sharePct}%` }} />
      </div>
    </li>
  );
}

export interface TopConsumersProps {
  groups: TopConsumerGroup[];
}

export function TopConsumers({ groups }: TopConsumersProps) {
  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((group) => (
        <Section
          key={`${group.type}::${group.unit}`}
          header={`Top-Verbraucher · ${TYPE_LABELS[group.type]} · ${group.unit}`}
          {...(group.others
            ? { footer: <OthersFooter others={group.others} unit={group.unit} /> }
            : {})}
        >
          <ul className="divide-y divide-separator">
            {group.entries.map((entry, index) => (
              <ConsumerRow key={entry.mpId} entry={entry} rank={index + 1} unit={group.unit} />
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}
