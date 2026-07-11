/**
 * Hinweis „Zum Home-Bildschirm" für iOS-Browser-Nutzer: ohne Installation
 * kann iOS die Offline-Warteschlange nach 7 Tagen Safari-Inaktivität
 * löschen. `dismissible` nur dort setzen, wo keine offenen Einträge auf dem
 * Spiel stehen (auf /sync ist die Karte bewusst nicht ausblendbar).
 */

import { useState } from 'react';

import { shouldShowIosInstallHint } from '@/lib/pwaInstall';

const DISMISSED_KEY = 'offline.iosInstallHintDismissed';

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

interface IosInstallHintCardProps {
  dismissible?: boolean;
}

export function IosInstallHintCard({ dismissible = false }: IosInstallHintCardProps) {
  const [hidden, setHidden] = useState(() => dismissible && isDismissed());
  if (hidden || !shouldShowIosInstallHint()) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* localStorage gesperrt — Karte bleibt eben sichtbar. */
    }
    setHidden(true);
  };

  return (
    <div
      data-testid="ios-install-hint"
      className="rounded-card border-hairline border-warning/40 bg-warning/10 p-3 text-caption text-secondary"
    >
      <div className="font-semibold text-label">Als App installieren</div>
      <p className="mt-1">
        Über das Teilen-Symbol „Zum Home-Bildschirm" hinzufügen. Ohne Installation kann iOS offline
        gespeicherte Erfassungen nach 7 Tagen Inaktivität löschen.
      </p>
      {dismissible ? (
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 text-caption font-semibold text-secondary underline"
        >
          Ausblenden
        </button>
      ) : null}
    </div>
  );
}
