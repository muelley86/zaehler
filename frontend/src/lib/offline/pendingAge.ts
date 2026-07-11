/**
 * Alters-Einstufung offener Offline-Einträge. iOS kann Web-Storage nicht
 * installierter PWAs nach 7 Tagen Safari-Inaktivität verwerfen — die
 * Schwellen warnen deutlich davor, damit nichts verloren geht.
 */

export const PENDING_WARN_AGE_DAYS = 3;
export const PENDING_CRITICAL_AGE_DAYS = 5;

export type PendingAgeLevel = 'none' | 'warn' | 'critical';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Volle Tage zwischen createdAt und now (unlesbares Datum → 0). */
export function pendingAgeDays(createdAt: string, now: Date = new Date()): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now.getTime() - created) / DAY_MS));
}

export function pendingAgeLevel(
  oldestCreatedAt: string | null,
  now: Date = new Date(),
): PendingAgeLevel {
  if (oldestCreatedAt === null) return 'none';
  const days = pendingAgeDays(oldestCreatedAt, now);
  if (days >= PENDING_CRITICAL_AGE_DAYS) return 'critical';
  if (days >= PENDING_WARN_AGE_DAYS) return 'warn';
  return 'none';
}

/** Tailwind-Hintergrundklasse des Sync-Badges je Alters-Level. */
export function pendingBadgeClass(level: PendingAgeLevel): string {
  if (level === 'critical') return 'bg-danger';
  if (level === 'warn') return 'bg-warning';
  return 'bg-primary';
}
