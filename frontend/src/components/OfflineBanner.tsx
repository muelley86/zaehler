/**
 * Globales Status-Banner unterhalb des Headers für den Offline-Modus:
 * - offline: angezeigte Daten sind der letzte bekannte Stand (+ Queue-Größe)
 * - syncing: die Offline-Warteschlange wird gerade abgespielt
 * - auth_required: Session abgelaufen, Einträge warten auf erneute Anmeldung
 * Online ohne offene Punkte rendert nichts.
 */

import { CloudUpload, RefreshCw, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useOnlineStatus } from '@/features/offline/offline-context';

const BANNER_CLASS =
  'border-warning/40 bg-warning/10 flex items-center gap-2 border-b-hairline px-4 py-2 text-caption text-secondary';

function pendingLabel(count: number): string {
  return count === 1 ? '1 Erfassung wartet' : `${count} Erfassungen warten`;
}

export function OfflineBanner() {
  const { isOnline, pendingCount, syncPhase } = useOnlineStatus();

  if (!isOnline) {
    return (
      <div role="status" data-testid="offline-banner" className={BANNER_CLASS}>
        <WifiOff size={14} className="shrink-0" aria-hidden />
        <span>
          Offline — angezeigte Daten: letzter bekannter Stand
          {pendingCount > 0 ? (
            <>
              {' · '}
              <Link to="/sync" className="font-semibold text-primary-deep hover:underline">
                {pendingLabel(pendingCount)}
              </Link>
            </>
          ) : null}
        </span>
      </div>
    );
  }

  if (syncPhase === 'syncing' && pendingCount > 0) {
    return (
      <div role="status" data-testid="sync-banner" className={BANNER_CLASS}>
        <RefreshCw size={14} className="shrink-0 animate-spin" aria-hidden />
        Synchronisiere {pendingCount === 1 ? '1 Erfassung' : `${pendingCount} Erfassungen`}…
      </div>
    );
  }

  if (syncPhase === 'auth_required' && pendingCount > 0) {
    return (
      <div role="status" data-testid="auth-banner" className={BANNER_CLASS}>
        <CloudUpload size={14} className="shrink-0" aria-hidden />
        <span>
          Anmeldung erforderlich — {pendingLabel(pendingCount)} auf Synchronisierung.{' '}
          <button
            type="button"
            // Reload → AuthProvider-Refresh → 401 → Login-Seite. Die Queue
            // in IndexedDB übersteht das und synct nach dem Login weiter.
            onClick={() => window.location.reload()}
            className="font-semibold text-primary-deep hover:underline"
          >
            Neu anmelden
          </button>
        </span>
      </div>
    );
  }

  return null;
}
