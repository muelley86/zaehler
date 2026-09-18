/**
 * Darstellung der Monatsend-Stände: Befunde und Zählertabelle. Ohne eigenes Laden, damit die Karte
 * auf der Kreis-Seite und der Abrechnungsassistent dieselbe Ansicht zeigen.
 */
import { formatDateDe, formatDe } from '@/lib/format';
import type { BillingReadingsRead, BillingStandRead } from '@/lib/types';

function StandCell({ stand }: { stand: BillingStandRead | null }) {
  if (!stand) return <span className="text-tertiary">—</span>;
  const titel =
    stand.art === 'abgelesen'
      ? 'Ablesung am Stichtag'
      : `Ablesungen: ${formatDateDe(stand.ablesung_vor)} / ${formatDateDe(stand.ablesung_nach)}`;
  return (
    <span title={titel}>
      <span className="tabular-nums">{formatDe(stand.wert)}</span>
      {stand.art === 'abgelesen' ? null : (
        <span
          className={`ml-1 rounded-full px-1.5 py-0.5 ${
            stand.art === 'interpoliert' ? 'bg-fill text-secondary' : 'bg-danger/10 text-danger'
          }`}
        >
          {stand.art === 'interpoliert' ? `interpoliert ±${stand.abstand_tage} T` : 'unvollständig'}
        </span>
      )}
    </span>
  );
}

export function MonthReadingsView({ report }: { report: BillingReadingsRead }) {
  const zaehler = report.positions.filter((r) => r.kind === 'meter');
  return (
    <>
      {report.findings.length > 0 ? (
        <ul className="space-y-1" aria-label="Befunde Zählerstände">
          {report.findings.map((f, i) => (
            <li
              key={`${f.position_id ?? 'kreis'}-${f.code}-${i}`}
              className="rounded-card bg-danger/10 px-3 py-2 text-caption text-danger"
            >
              <strong>{f.label}:</strong> {f.message}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-card bg-success/10 p-3 text-caption text-success">
          Keine Befunde zu den Zählerständen.
        </div>
      )}
      {zaehler.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-caption" aria-label="Zählerstände zum Monatsende">
            <thead className="text-tertiary">
              <tr>
                <th scope="col" className="py-1 pr-3">
                  Position
                </th>
                <th scope="col" className="py-1 pr-3">
                  Zähler
                </th>
                <th scope="col" className="py-1 pr-3 text-right">
                  Faktor
                </th>
                <th scope="col" className="py-1 pr-3 text-right">
                  Stand alt
                </th>
                <th scope="col" className="py-1 pr-3 text-right">
                  Stand neu
                </th>
                <th scope="col" className="py-1 pr-3 text-right">
                  Korrektur
                </th>
                <th scope="col" className="py-1 text-right">
                  kWh
                </th>
              </tr>
            </thead>
            <tbody>
              {zaehler.map((r) => (
                <tr key={r.position_id} className="border-t border-separator">
                  <td className="py-1 pr-3 text-label">{r.label}</td>
                  <td className="py-1 pr-3">{r.serial_numbers || '—'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {r.transformer_factor ?? '—'}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <StandCell stand={r.stand_alt} />
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <StandCell stand={r.stand_neu} />
                  </td>
                  <td
                    className="py-1 pr-3 text-right tabular-nums"
                    title={r.korrektur_note ?? undefined}
                  >
                    {r.korrektur_kwh !== null ? formatDe(r.korrektur_kwh) : ''}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.kwh !== null ? formatDe(r.kwh) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
