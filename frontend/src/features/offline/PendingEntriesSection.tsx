/**
 * Offene Offline-Einträge oberhalb der Erfassungsliste: bis zum Sync
 * existieren sie nur lokal (IndexedDB) und würden sonst in keiner Liste
 * auftauchen. Klick führt zur Konflikt-/Sync-Seite (/sync). Bewusst
 * unabhängig von Server-Filtern und Pagination.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Section } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { formatDateTimeDe, formatDe } from '@/lib/format';
import type { OutboxReading } from '@/lib/offline/db';
import { listItems, subscribeOutbox } from '@/lib/offline/outbox';
import { StatusPill } from './StatusPill';

export function PendingEntriesSection() {
  const { me } = useAuth();
  // Primitive ID statt me-Objekt als Dependency: eine instabile me-Referenz
  // (Re-Render, gemockter Context) darf keine Reload-Schleife auslösen.
  const meId = me?.id ?? null;
  const [items, setItems] = useState<OutboxReading[]>([]);

  useEffect(() => {
    if (meId === null) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const reload = () => {
      void listItems(meId)
        .then((list) => {
          if (!cancelled) setItems(list);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    };
    reload();
    const unsubscribe = subscribeOutbox(reload);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [meId]);

  if (items.length === 0) return null;

  return (
    <Section header={`Ausstehend — offline erfasst (${items.length})`}>
      <div data-testid="pending-entries" className="divide-y divide-separator">
        {items.map((item) => (
          <Link
            key={item.id}
            to="/sync"
            className="hover:bg-fill/40 flex items-center gap-3 px-4 py-3 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-medium text-label">
                {item.mpName} · {item.registerLabel}
              </div>
              <div className="text-caption text-tertiary">{formatDateTimeDe(item.readingAt)}</div>
            </div>
            <div className="num shrink-0 text-body text-secondary">
              {formatDe(item.value)} {item.registerUnit}
            </div>
            <StatusPill status={item.status} />
          </Link>
        ))}
      </div>
    </Section>
  );
}
