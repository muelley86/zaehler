/**
 * Ergebnis-Tabellen der Auswertungen: Einzelperiode (`ResultTable`) und
 * Perioden-Vergleich (`ComparisonTable`). Reine Darstellung — die Daten kommen
 * aus dem ausgeführten Lauf (`useReportQuery`), nie aus den Live-Filtern.
 */

import { BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState, Section } from '@/components/ui';
import { formatDe } from '@/lib/format';
import { TYPE_LABELS } from '@/lib/meterLabels';
import type { ReportRow } from '@/lib/types';
import { directionSuffix, displayGroupLabel, groupsWithEinspeisung } from './reportUtils';
import type { ComparisonPeriods, ComparisonRow } from './reportUtils';

/**
 * Gruppen-Label einer Ergebnis-Zeile. Verrechnete Messstellen verlinken auf
 * ihre Detail-Seite (Komponenten-Aufschlüsselung) — echte Zeilen bleiben Text.
 */
function GroupLabelCell({
  label,
  isVirtual,
  groupKey,
}: {
  label: string;
  isVirtual: boolean | undefined;
  groupKey: number | null;
}) {
  const text = displayGroupLabel(label, isVirtual);
  if (isVirtual && groupKey != null) {
    return (
      <Link to={`/verrechnung/${groupKey}`} className="underline-offset-2 hover:underline">
        {text}
      </Link>
    );
  }
  return <>{text}</>;
}

// Render-Cap fuer die Ergebnis-/Vergleichs-Tabellen: bei Firmen-Skala
// (Dimension Messstelle x Bezug/Einspeisung x Tages-/Wochen-Buckets) koennen
// es tausende Zeilen werden. Der CSV-Export liefert weiterhin die volle Menge.
export const REPORT_ROW_CAP = 500;

function RowCapHint({ total }: { total: number }) {
  if (total <= REPORT_ROW_CAP) return null;
  return (
    <div className="p-2 text-caption text-tertiary">
      Nur die ersten {REPORT_ROW_CAP} von {total} Zeilen angezeigt — für die volle Menge den
      CSV-Export nutzen.
    </div>
  );
}

export function ResultTable({
  rows,
  showPeriod,
  groupHeader,
}: {
  rows: ReportRow[];
  showPeriod: boolean;
  groupHeader: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={32} />}
        title="Keine Daten"
        description="Für die gewählte Konfiguration gibt es keine Verbrauchswerte."
      />
    );
  }
  const bidiGroups = groupsWithEinspeisung(rows);
  return (
    <Section>
      <table className="w-full text-body-sm">
        <thead className="text-caption-bold uppercase text-tertiary">
          <tr className="border-b border-border">
            <th className="p-2 text-left">{groupHeader}</th>
            <th className="p-2 text-left">Zählerart</th>
            {showPeriod ? <th className="p-2 text-left">Periode</th> : null}
            <th className="p-2 text-right">Verbrauch</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, REPORT_ROW_CAP).map((r) => {
            const suffix = directionSuffix(r, bidiGroups);
            return (
              <tr
                key={`${r.is_virtual ? 'v' : 'r'}-${r.group_key}-${r.meter_type}-${r.unit}-${r.direction}-${r.period_end ?? ''}`}
                className="border-border/50 border-b"
              >
                <td className="p-2 text-label">
                  <GroupLabelCell
                    label={r.group_label}
                    isVirtual={r.is_virtual}
                    groupKey={r.group_key}
                  />
                  {suffix ? <span className="text-secondary"> · {suffix}</span> : null}
                </td>
                <td className="p-2 text-secondary">{TYPE_LABELS[r.meter_type]}</td>
                {showPeriod ? <td className="p-2 text-secondary">{r.period_end ?? ''}</td> : null}
                <td className="p-2 text-right tabular-nums text-label">
                  {formatDe(r.consumption)} {r.unit}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <RowCapHint total={rows.length} />
    </Section>
  );
}

export function ComparisonTable({
  rows,
  groupHeader,
  periods,
}: {
  rows: ComparisonRow[];
  groupHeader: string;
  /** Zeitraum-Labels des ausgeführten Laufs — Spaltenköpfe der beiden Perioden. */
  periods: ComparisonPeriods;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={32} />}
        title="Keine Daten"
        description="Für den Vergleich gibt es keine Verbrauchswerte."
      />
    );
  }
  const bidiGroups = groupsWithEinspeisung(rows);
  return (
    <Section>
      {/* Sechs Spalten mit Datums-Köpfen: auf schmalen Screens scrollt die
          Tabelle horizontal, statt die Daten mitten im Datum umzubrechen. */}
      <div className="overflow-x-auto">
        <table className="w-full text-body-sm">
          <thead className="text-caption-bold uppercase text-tertiary">
            <tr className="border-b border-border">
              <th scope="col" className="p-2 text-left">
                {groupHeader}
              </th>
              <th scope="col" className="p-2 text-left">
                Zählerart
              </th>
              <th scope="col" className="whitespace-nowrap p-2 text-right">
                {periods.a}
              </th>
              <th scope="col" className="whitespace-nowrap p-2 text-right">
                {periods.b}
              </th>
              <th scope="col" className="p-2 text-right">
                Δ
              </th>
              <th scope="col" className="whitespace-nowrap p-2 text-right">
                Δ %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, REPORT_ROW_CAP).map((r) => {
              const suffix = directionSuffix(r, bidiGroups);
              return (
                <tr key={r.key} className="border-border/50 border-b">
                  <td className="p-2 text-label">
                    <GroupLabelCell
                      label={r.group_label}
                      isVirtual={r.is_virtual}
                      groupKey={r.group_key}
                    />
                    {suffix ? <span className="text-secondary"> · {suffix}</span> : null}
                  </td>
                  <td className="p-2 text-secondary">{TYPE_LABELS[r.meter_type]}</td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums text-label">
                    {formatDe(r.a)} {r.unit}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums text-label">
                    {formatDe(r.b)} {r.unit}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">
                    {formatDe(r.delta)} {r.unit}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums text-secondary">
                    {r.pct === null ? '—' : `${formatDe(r.pct, { maximumFractionDigits: 1 })} %`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <RowCapHint total={rows.length} />
    </Section>
  );
}
