/**
 * Vergleichsblock der Auswertungen: Periode 1 (= der oben gewählte Zeitraum,
 * nur Anzeige) und Periode 2 als Vorjahr | Vorperiode | Benutzerdefiniert.
 * Reine Darstellung — State und Auflösung (`resolveComparePeriod`) liegen in
 * `ReportsPage`.
 */

import { Pill } from '@/components/ui';
import { COMPARE_KIND_LABELS, periodLabel } from './reportUtils';
import type { CompareKind, Period } from './reportUtils';

const COMPARE_KINDS: CompareKind[] = ['previous_year', 'previous_period', 'custom'];

export const DATE_INPUT_CLASS =
  'ml-2 rounded-lg border-hairline border-border bg-fill px-2 py-1 text-label';

export interface ComparePeriodFieldsProps {
  /** Aufgelöste Periode 1 (gewählter Zeitraum). */
  period: Period;
  /** Aufgelöste Periode 2. */
  comparePeriod: Period;
  compareKind: CompareKind;
  onKindChange: (kind: CompareKind) => void;
  compareFrom: string;
  compareTo: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

export function ComparePeriodFields({
  period,
  comparePeriod,
  compareKind,
  onKindChange,
  compareFrom,
  compareTo,
  onFromChange,
  onToChange,
}: ComparePeriodFieldsProps) {
  return (
    <div className="bg-fill/60 space-y-2 rounded-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 text-body-sm">
        <span className="text-label">Periode 1</span>
        <span className="text-secondary">{periodLabel(period.from, period.to)}</span>
        <span className="text-caption text-tertiary">= Zeitraum oben</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-body-sm">
        <span className="text-label">Periode 2</span>
        <div role="group" aria-label="Periode 2" className="flex flex-wrap gap-1.5">
          {COMPARE_KINDS.map((k) => (
            <Pill key={k} size="sm" active={compareKind === k} onClick={() => onKindChange(k)}>
              {COMPARE_KIND_LABELS[k]}
            </Pill>
          ))}
        </div>
      </div>
      {compareKind === 'custom' ? (
        <div className="flex flex-wrap gap-3">
          <label className="text-caption text-tertiary">
            Periode 2 von
            <input
              type="date"
              value={compareFrom}
              onChange={(e) => onFromChange(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </label>
          <label className="text-caption text-tertiary">
            bis
            <input
              type="date"
              value={compareTo}
              onChange={(e) => onToChange(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </label>
        </div>
      ) : (
        <p className="text-body-sm text-secondary" data-testid="compare-period">
          {periodLabel(comparePeriod.from, comparePeriod.to)}
        </p>
      )}
    </div>
  );
}
