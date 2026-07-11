/**
 * Status-Pill für Einträge der Offline-Warteschlange — geteilt zwischen
 * /sync (PendingSyncPage) und der Pending-Sektion der Erfassungsliste.
 */

import type { OutboxStatus } from '@/lib/offline/db';

const STATUS_LABELS: Record<OutboxStatus, string> = {
  pending: 'Wartet',
  photos_pending: 'Foto ausstehend',
  conflict_warning: 'Konflikt',
  conflict_duplicate: 'Duplikat',
  photo_error: 'Foto-Fehler',
  error: 'Fehler',
};

const WARNING_STATUSES: readonly OutboxStatus[] = [
  'conflict_warning',
  'conflict_duplicate',
  'photo_error',
  'error',
];

export function StatusPill({ status }: { status: OutboxStatus }) {
  const isWarning = WARNING_STATUSES.includes(status);
  return (
    <span
      className={
        isWarning
          ? 'rounded-pill border-hairline border-warning/40 bg-warning/10 px-2 py-0.5 text-caption font-semibold text-secondary'
          : 'rounded-pill border-hairline border-border bg-fill px-2 py-0.5 text-caption text-secondary'
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
