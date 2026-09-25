/**
 * Einklappbarer Prüfabschnitt (Zählerstände, Prüfbericht): klappt bei Befund oder Fehler von
 * selbst auf und bleibt ohne Befund zu. Der Status steht auch eingeklappt im Kopf. Sobald der
 * User selbst klappt, gilt seine Wahl — der Abschnitt klappt nicht unter der Hand zu.
 */
import { useId } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Section } from '@/components/ui';

import type { FindingsState } from './findingsDisclosure';

function StatusBadge({ state }: { state: FindingsState }) {
  if (state === null) return <span className="normal-case text-tertiary">· Lade…</span>;
  if (state.error) return <span className="normal-case text-danger">· Fehler</span>;
  if (state.findings === 0) return <span className="normal-case text-success">· in Ordnung</span>;
  return (
    <span className="num normal-case text-danger">
      · {state.findings} {state.findings === 1 ? 'Befund' : 'Befunde'}
    </span>
  );
}

export function CollapsibleSection({
  title,
  state,
  open,
  onToggle,
  children,
}: {
  title: string;
  state: FindingsState;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <Section
      header={
        <h2>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full items-center gap-1 text-left uppercase"
          >
            {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            {title}
            <StatusBadge state={state} />
          </button>
        </h2>
      }
    >
      <div id={panelId}>
        {open ? (
          children
        ) : (
          <p className="px-5 py-3 text-caption text-tertiary">
            Eingeklappt — zum Anzeigen auf die Überschrift tippen.
          </p>
        )}
      </div>
    </Section>
  );
}
