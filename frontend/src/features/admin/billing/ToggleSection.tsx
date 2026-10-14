/**
 * Einklappbarer Abschnitt ohne Befund-Status (Neuanlage, Import). Standardmäßig eingeklappt; der
 * Inhalt bleibt eingeklappt gerendert (nur versteckt), damit Eingaben und Ergebnisse erhalten bleiben.
 */
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Section } from '@/components/ui';

export function ToggleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <Section
      header={
        <h2>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full items-center gap-1 text-left uppercase"
          >
            {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            {title}
          </button>
        </h2>
      }
    >
      <div id={panelId} hidden={!open}>
        {children}
      </div>
      {open ? null : (
        <p className="px-5 py-3 text-caption text-tertiary">
          Eingeklappt — zum Anzeigen auf die Überschrift tippen.
        </p>
      )}
    </Section>
  );
}
