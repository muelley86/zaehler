/**
 * Warnbanner: Der älteste nicht synchronisierte Eintrag ist mehrere Tage
 * alt — ab der kritischen Schwelle mit Hinweis auf die iOS-7-Tage-Eviction.
 */

import { pendingAgeDays, pendingAgeLevel } from '@/lib/offline/pendingAge';

interface PendingAgeBannerProps {
  oldestPendingAt: string | null;
}

export function PendingAgeBanner({ oldestPendingAt }: PendingAgeBannerProps) {
  const level = pendingAgeLevel(oldestPendingAt);
  if (oldestPendingAt === null || level === 'none') return null;

  const days = pendingAgeDays(oldestPendingAt);
  const critical = level === 'critical';
  return (
    <div
      data-testid="pending-age-banner"
      className={
        critical
          ? 'rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-caption text-danger'
          : 'rounded-card border-hairline border-warning/40 bg-warning/10 p-3 text-caption text-secondary'
      }
    >
      Der älteste nicht synchronisierte Eintrag wartet seit {days} Tagen — bitte bei
      Serververbindung synchronisieren.
      {critical
        ? ' iOS kann nicht synchronisierte Offline-Daten nach 7 Tagen Inaktivität löschen.'
        : ''}
    </div>
  );
}
