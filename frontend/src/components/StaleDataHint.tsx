/**
 * "Stand von <Datum>"-Chip für Seiten, die offline gecachte Daten zeigen.
 *
 * Rendert NUR offline: Online sind die Daten frisch, und der Zeitstempel
 * aus dem `Date`-Header wäre wegen möglichem Clock-Skew nur verwirrend.
 * `servedAt` kommt aus `api.getWithMeta` (bei Cache-Antworten der Zeitpunkt
 * der ursprünglichen Server-Antwort).
 */

import { History } from 'lucide-react';

import { useOnlineStatus } from '@/features/offline/offline-context';
import { formatDateTimeDe } from '@/lib/format';

export function StaleDataHint({ servedAt }: { servedAt: Date | null }) {
  const { isOnline } = useOnlineStatus();
  if (isOnline || !servedAt) return null;
  return (
    <span
      data-testid="stale-data-hint"
      className="border-warning/40 bg-warning/10 inline-flex items-center gap-1.5 rounded-pill border-hairline px-2.5 py-1 text-caption text-secondary"
    >
      <History size={12} aria-hidden />
      Stand von {formatDateTimeDe(servedAt.toISOString())}
    </span>
  );
}
