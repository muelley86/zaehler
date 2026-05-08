/**
 * Wiederverwendbare Platzhalter fuer Admin-Sub-Pages mit noch nicht
 * verfuegbarem Backend.
 *
 * Verwendet von SystemAdminPage / SessionsAdminPage
 * waehrend der Backend-Endpoints noch ausstehen. Sobald ein Endpoint da
 * ist, wird die jeweilige Card durch echte Inhalte ersetzt — ein gutes
 * Suchsignal ist der Tag "TODO-BACKEND" im note-String.
 */

import type { ReactNode } from 'react';
import { Wrench } from 'lucide-react';

interface BackendPlaceholderProps {
  /** Was die Sektion spaeter zeigen soll. */
  label: string;
  /** Hinweis auf den noch fehlenden Endpoint, fuer Suchbarkeit als
   *  ``TODO-BACKEND`` markiert. */
  note: string;
}

/**
 * Schmale Row in einer Card, die einen ausstehenden Backend-Endpoint
 * ankuendigt. Bewusst unauffaellig — keine Buttons, keine Aktionen,
 * nur Hinweistext.
 */
export function BackendPlaceholder({ label, note }: BackendPlaceholderProps) {
  return (
    <div className="flex items-start gap-3 px-5 py-4 first:pt-5 last:pb-5 [&+&]:border-t-hairline [&+&]:border-separator">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-fill text-tertiary">
        <Wrench size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-body font-semibold text-label">{label}</div>
        <div className="mt-0.5 text-caption text-tertiary">
          <span className="num text-quaternary">TODO-BACKEND · </span>
          {note}
        </div>
      </div>
    </div>
  );
}

interface PlaceholderRowProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Row mit Titel/Beschreibung und einer optionalen Aktion rechts.
 * Verwendet z. B. fuer den Voll-Dump-Export-Button auf SystemAdminPage,
 * dessen Endpoint bereits existiert.
 */
export function PlaceholderRow({ title, description, action }: PlaceholderRowProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-body font-semibold text-label">{title}</div>
        {description ? (
          <div className="mt-0.5 text-caption text-tertiary">{description}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
