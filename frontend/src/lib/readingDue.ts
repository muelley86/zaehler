/**
 * Fälligkeit einer Ablesung: eine Messstelle ist fällig, wenn sie nie
 * abgelesen wurde oder ihre letzte Ablesung mindestens `reading_interval_days`
 * Tage zurückliegt. Einzige Stelle dieser Regel — Liste, Detailseite und
 * Dashboard rechnen alle hierüber.
 */

import type { MeasuringPointRead } from './types';

/** Spiegelt `DEFAULT_READING_INTERVAL_DAYS` im Backend (Fallback für alte Offline-Snapshots). */
export const DEFAULT_READING_INTERVAL_DAYS = 35;

const MS_PER_DAY = 86_400_000;

/** Volle Tage seit `iso` bis `now`; `null`, wenn nie abgelesen. */
export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (iso == null) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DAY);
}

export function isReadingDue(
  lastReadingAt: string | null | undefined,
  intervalDays: number | undefined,
  now: Date,
): boolean {
  const days = daysSince(lastReadingAt, now);
  return days === null || days >= (intervalDays ?? DEFAULT_READING_INTERVAL_DAYS);
}

type DueFields = Pick<
  MeasuringPointRead,
  'physical_meters' | 'last_reading_at' | 'reading_interval_days'
>;

/**
 * Ablesbar ist eine Messstelle nur mit eingebautem Zähler, der mindestens ein
 * aktives Register hat — sonst gibt es nichts abzulesen. Das Dashboard wendet
 * dieselbe Regel an (seine `registers` sind genau die aktiven Register des
 * eingebauten Zählers).
 */
export function isMeasuringPointReadable(mp: Pick<MeasuringPointRead, 'physical_meters'>): boolean {
  return mp.physical_meters.some(
    (m) => m.removed_at === null && m.registers.some((r) => r.is_active),
  );
}

/** Fälligkeit einer Messstelle aus der Listen-/Detail-API; nicht ablesbare sind nie fällig. */
export function isMeasuringPointDue(mp: DueFields, now: Date): boolean {
  return (
    isMeasuringPointReadable(mp) && isReadingDue(mp.last_reading_at, mp.reading_interval_days, now)
  );
}
