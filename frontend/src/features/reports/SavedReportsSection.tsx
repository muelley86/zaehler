/**
 * „Gespeicherte Auswertungen" — steht immer ganz oben auf der Seite, auch ohne
 * Einträge (stabiler Anker; der Leer-Text erklärt, wie man eine anlegt).
 * Ein Klick übernimmt nur die Filter — ausgewertet wird erst über den
 * „Auswerten"-Button, damit die Seite nie ungefragt lädt.
 */

import { Trash2 } from 'lucide-react';

import { Section } from '@/components/ui';
import type { ReportConfigRead } from '@/lib/types';
import { DIMENSION_LABELS, GRANULARITY_LABELS, PERIOD_KIND_LABELS } from './reportUtils';

export interface SavedReportsSectionProps {
  configs: ReportConfigRead[];
  isAdmin: boolean;
  onLoad: (config: ReportConfigRead) => void;
  onDelete: (config: ReportConfigRead) => void;
}

export function SavedReportsSection({
  configs,
  isAdmin,
  onLoad,
  onDelete,
}: SavedReportsSectionProps) {
  return (
    <Section header="Gespeicherte Auswertungen">
      {configs.length === 0 ? (
        <div className="p-3 text-body-sm text-tertiary">
          Noch keine gespeicherten Auswertungen.
          {isAdmin ? ' Filter wählen und „Speichern" drücken.' : ''}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {configs.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-3">
              <button
                type="button"
                onClick={() => onLoad(c)}
                className="flex-1 text-left text-body-sm text-label"
              >
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-caption text-tertiary">
                  {DIMENSION_LABELS[c.dimension]} · {GRANULARITY_LABELS[c.granularity]} ·{' '}
                  {PERIOD_KIND_LABELS[c.period_kind]}
                </span>
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  aria-label={`„${c.name}" löschen`}
                  onClick={() => onDelete(c)}
                  className="text-tertiary hover:text-danger"
                >
                  <Trash2 size={16} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
