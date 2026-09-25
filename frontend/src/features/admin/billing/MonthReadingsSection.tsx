/**
 * Zählerstände zum Monatsende je Position: Stand alt (Ende Vormonat) und Stand neu (Monatsende)
 * aus den Ablesungen der App, interpolierte Stände gekennzeichnet, Zählertausch/Überlauf als
 * Korrektur, Befunde (fehlende oder weit entfernte Ablesungen). Ohne Befund eingeklappt.
 */
import { useEffect, useState } from 'react';

import { TextField } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateDe } from '@/lib/format';
import type { BillingReadingsRead } from '@/lib/types';

import { errorText, lastDayOfPreviousMonth } from './circleForm';
import { CollapsibleSection } from './CollapsibleSection';
import { useFindingsDisclosure } from './findingsDisclosure';
import type { FindingsState } from './findingsDisclosure';
import { MonthReadingsView } from './MonthReadingsView';

export function MonthReadingsSection({ circleId, tick }: { circleId: number; tick: number }) {
  const [monat, setMonat] = useState(() => lastDayOfPreviousMonth().slice(0, 7));
  const [report, setReport] = useState<BillingReadingsRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(monat)) return;
    let cancelled = false;
    api
      .get<BillingReadingsRead>(
        `/billing-circles/${circleId}/readings?monat=${encodeURIComponent(monat)}`,
      )
      .then((d) => {
        if (!cancelled) {
          setReport(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReport(null);
          setError(errorText(err, 'Zählerstände konnten nicht ermittelt werden.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [circleId, monat, tick]);

  const state: FindingsState = error
    ? { error: true }
    : report
      ? { error: false, findings: report.findings.length }
      : null;
  const { open, toggle } = useFindingsDisclosure(state);

  return (
    <CollapsibleSection
      title="Zählerstände zum Monatsende"
      state={state}
      open={open}
      onToggle={toggle}
    >
      <div className="space-y-3 p-5">
        <TextField
          label="Abrechnungsmonat"
          type="month"
          value={monat}
          onChange={(e) => setMonat(e.target.value)}
          hint={
            report
              ? `Stand alt = ${formatDateDe(report.stichtag_alt)}, Stand neu = ${formatDateDe(
                  report.stichtag_neu,
                )}; Warnung ab ${report.max_abstand_tage} Tagen Abstand zur Ablesung.`
              : undefined
          }
        />
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        {report ? <MonthReadingsView report={report} /> : null}
      </div>
    </CollapsibleSection>
  );
}
