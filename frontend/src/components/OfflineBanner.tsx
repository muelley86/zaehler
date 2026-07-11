/**
 * Globales Offline-Banner unterhalb des Headers: erklärt, dass die
 * angezeigten Daten der letzte bekannte Stand sind. Rendert online nichts.
 */

import { WifiOff } from 'lucide-react';

import { useOnlineStatus } from '@/features/offline/offline-context';

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="border-warning/40 bg-warning/10 flex items-center gap-2 border-b-hairline px-4 py-2 text-caption text-secondary"
    >
      <WifiOff size={14} className="shrink-0" aria-hidden />
      Offline — angezeigte Daten: letzter bekannter Stand
    </div>
  );
}
