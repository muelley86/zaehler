/**
 * Eine Tabelle des Lauf-Vergleichs: Zeile = Kennzahl, Empfänger oder Position, Spalte = Lauf.
 * Unter jedem Wert steht klein die Abweichung zum vorherigen Lauf der Auswahl. Ist `onWaehle`
 * gesetzt, wählt ein Klick auf den Zeilennamen die Zeile für das Diagramm.
 */
import { Link } from 'react-router';

import type { BillingCompareRun } from '@/lib/types';

import { formatDelta, formatWert, laufLabel } from './compareFormat';
import type { CompareTableRow } from './compareFormat';
import { RUN_STATUS_CLASS, RUN_STATUS_LABEL } from './runFormat';

interface CompareTableProps {
  titel: string;
  kopf: string;
  circleId: number;
  laeufe: BillingCompareRun[];
  zeilen: CompareTableRow[];
  gewaehlt: string | null;
  onWaehle?: ((key: string) => void) | undefined;
}

function Zeilenname({
  zeile,
  gewaehlt,
  onWaehle,
}: {
  zeile: CompareTableRow;
  gewaehlt: boolean;
  onWaehle?: ((key: string) => void) | undefined;
}) {
  if (!onWaehle) return <span className="text-label">{zeile.label}</span>;
  return (
    <button
      type="button"
      aria-pressed={gewaehlt}
      onClick={() => onWaehle(zeile.key)}
      className={`text-left underline-offset-2 hover:underline ${
        gewaehlt ? 'font-semibold text-primary' : 'text-label'
      }`}
    >
      {zeile.label}
    </button>
  );
}

export function CompareTable({
  titel,
  kopf,
  circleId,
  laeufe,
  zeilen,
  gewaehlt,
  onWaehle,
}: CompareTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-caption" aria-label={titel}>
        <thead className="text-tertiary">
          <tr>
            <th scope="col" className="py-1 pr-3 align-bottom">
              {kopf}
            </th>
            {laeufe.map((lauf) => (
              <th key={lauf.run_id} scope="col" className="py-1 pr-3 text-right align-bottom">
                <Link
                  to={`/admin/abrechnungskreise/${circleId}/laeufe/${lauf.run_id}`}
                  className="whitespace-nowrap text-primary"
                >
                  {laufLabel(lauf)}
                </Link>
                {lauf.status !== 'festgeschrieben' ? (
                  <div className="mt-0.5 font-normal">
                    <span className={`rounded-full px-1.5 py-0.5 ${RUN_STATUS_CLASS[lauf.status]}`}>
                      {RUN_STATUS_LABEL[lauf.status]}
                    </span>
                  </div>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((zeile) => (
            <tr key={zeile.key} className="border-t border-separator align-top even:bg-fill">
              <th scope="row" className="py-1 pr-3 text-left font-normal">
                <Zeilenname zeile={zeile} gewaehlt={gewaehlt === zeile.key} onWaehle={onWaehle} />
                {zeile.intern ? (
                  <span className="ml-2 rounded-full bg-fill-strong px-2 py-0.5 text-tertiary">
                    intern
                  </span>
                ) : null}
                {zeile.hinweis ? <div className="text-warning">{zeile.hinweis}</div> : null}
              </th>
              {laeufe.map((lauf, index) => {
                const wert = zeile.werte[index];
                const delta = wert ? formatDelta(wert, zeile.einheit) : null;
                return (
                  <td key={lauf.run_id} className="py-1 pr-3 text-right tabular-nums">
                    <div className={wert?.wert == null ? 'text-tertiary' : 'whitespace-nowrap'}>
                      {formatWert(wert?.wert ?? null, zeile.einheit)}
                    </div>
                    {delta ? <div className="whitespace-nowrap text-secondary">{delta}</div> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
