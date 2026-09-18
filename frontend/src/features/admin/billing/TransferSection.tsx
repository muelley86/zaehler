/**
 * Übertragung nach Agrarmonitor: je Empfänger eine Tabelle in der Reihenfolge des Formulars
 * (Datum, Menge, Beschreibung, €, MwSt., Gesamt) mit Kopierknopf je Zelle, Summe netto/brutto zum
 * Abgleich mit der Agrarmonitor-Anzeige und Haken „übertragen“ mit Belegnummer.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy } from 'lucide-react';

import { Button, Section, TextField } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateDe, formatDe } from '@/lib/format';
import type { BillingRunStatus, BillingTransferRecipient, BillingTransferView } from '@/lib/types';

import { errorText } from './circleForm';
import { eur } from './runFormat';

/** Wert in der Zwischenablage ablegen; ohne Clipboard-API (alte Browser) still nichts tun. */
async function kopieren(wert: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(wert);
  } catch {
    /* Zwischenablage nicht verfügbar – der Wert steht sichtbar in der Tabelle */
  }
}

function KopierZelle({ wert, label }: { wert: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void kopieren(wert)}
      aria-label={`${label} kopieren`}
      title="In die Zwischenablage kopieren"
      className="group inline-flex items-center gap-1 tabular-nums hover:text-primary"
    >
      {wert}
      <Copy size={11} className="opacity-0 group-hover:opacity-70" />
    </button>
  );
}

export function TransferSection({
  circleId,
  runId,
  status,
}: {
  circleId: number;
  runId: number;
  status: BillingRunStatus;
}) {
  const base = `/billing-circles/${circleId}/runs/${runId}`;
  const [view, setView] = useState<BillingTransferView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<BillingTransferView>(`${base}/transfer`)
      .then((d) => {
        if (!cancelled) setView(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte die Übertragung nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  if (!view) {
    return (
      <Section header="Übertragung nach Agrarmonitor">
        <div className="p-5 text-caption text-tertiary">{error ?? 'Lade…'}</div>
      </Section>
    );
  }

  return (
    <Section header="Übertragung nach Agrarmonitor">
      <div className="space-y-4 p-5">
        <p className="text-caption text-secondary">{view.kopfsatz}</p>
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        {view.empfaenger.map((e) => (
          <Recipient
            key={e.owner_name}
            base={base}
            recipient={e}
            status={status}
            onChanged={setView}
            onError={setError}
          />
        ))}
      </div>
    </Section>
  );
}

function Recipient({
  base,
  recipient,
  status,
  onChanged,
  onError,
}: {
  base: string;
  recipient: BillingTransferRecipient;
  status: BillingRunStatus;
  onChanged: (view: BillingTransferView) => void;
  onError: (text: string | null) => void;
}) {
  const [beleg, setBeleg] = useState('');
  const [busy, setBusy] = useState(false);
  const transfer = recipient.transfer;

  async function abhaken(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      onChanged(
        await api.post<BillingTransferView>(`${base}/transfers`, {
          owner_name: recipient.owner_name,
          belegnummer: beleg.trim() || null,
        }),
      );
    } catch (err) {
      onError(errorText(err, 'Konnte die Übertragung nicht speichern.'));
    } finally {
      setBusy(false);
    }
  }

  async function zuruecknehmen() {
    if (!transfer || !window.confirm('Markierung „übertragen“ zurücknehmen?')) return;
    setBusy(true);
    onError(null);
    try {
      onChanged(await api.delete<BillingTransferView>(`${base}/transfers/${transfer.id}`));
    } catch (err) {
      onError(errorText(err, 'Konnte die Markierung nicht zurücknehmen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border-hairline border-separator">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="text-body font-semibold text-label">
          {recipient.owner_name || '(ohne Empfänger)'}
          {recipient.internal_allocation ? (
            <span className="ml-2 rounded-full bg-fill px-2 py-0.5 text-caption text-secondary">
              interne Umlage
            </span>
          ) : null}
        </div>
        {transfer ? (
          <div className="flex items-center gap-2 text-caption text-success">
            <Check size={14} />
            übertragen {transfer.belegnummer ? `· Beleg ${transfer.belegnummer}` : ''}
            <Button
              variant="bordered"
              size="sm"
              disabled={busy}
              onClick={() => void zuruecknehmen()}
            >
              Zurücknehmen
            </Button>
          </div>
        ) : status === 'festgeschrieben' ? (
          <form onSubmit={(e) => void abhaken(e)} className="flex items-end gap-2">
            <TextField
              label="Belegnummer"
              value={beleg}
              onChange={(e) => setBeleg(e.target.value)}
              maxLength={64}
              className="w-40"
            />
            <Button type="submit" variant="filled" size="sm" disabled={busy}>
              Übertragen
            </Button>
          </form>
        ) : (
          <span className="text-caption text-tertiary">
            {status === 'ersetzt'
              ? 'Version ersetzt – keine Übertragung mehr möglich'
              : 'Erst festschreiben'}
          </span>
        )}
      </div>
      <div className="overflow-x-auto px-3 pb-3">
        <table
          className="w-full text-left text-caption"
          aria-label={`Formular ${recipient.owner_name}`}
        >
          <thead className="text-tertiary">
            <tr>
              <th className="py-1 pr-3">Datum</th>
              <th className="py-1 pr-3 text-right">Menge</th>
              <th className="py-1 pr-3">Beschreibung</th>
              <th className="py-1 pr-3 text-right">€</th>
              <th className="py-1 pr-3 text-right">MwSt.</th>
              <th className="py-1 text-right">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {recipient.rows.map((r) => (
              <tr key={r.beschreibung} className="border-t border-separator">
                <td className="py-1 pr-3">{formatDateDe(r.datum)}</td>
                <td className="py-1 pr-3 text-right">
                  <KopierZelle wert={formatDe(r.menge)} label={`Menge ${r.beschreibung}`} />
                </td>
                <td className="py-1 pr-3" title={r.positionen.join(', ')}>
                  <KopierZelle wert={r.beschreibung} label="Beschreibung" />
                </td>
                <td className="py-1 pr-3 text-right">
                  <KopierZelle wert={formatDe(r.preis_eur)} label="Preis" />
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{formatDe(r.umsatzsteuer)}</td>
                <td className="py-1 text-right tabular-nums">{eur(r.betrag)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-separator font-semibold">
              <td className="py-1 pr-3" colSpan={5}>
                Summe netto
              </td>
              <td className="py-1 text-right tabular-nums">{eur(recipient.netto)}</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-tertiary" colSpan={5}>
                Summe brutto (inkl. {formatDe(recipient.rows[0]?.umsatzsteuer ?? '19')} % USt.)
              </td>
              <td className="py-1 text-right tabular-nums">{eur(recipient.brutto)}</td>
            </tr>
            {recipient.differenz !== '0.00' ? (
              <tr>
                <td className="py-1 pr-3 text-danger" colSpan={5}>
                  Abweichung zur Summe je Zähler ({eur(recipient.netto_lauf)})
                </td>
                <td className="py-1 text-right tabular-nums text-danger">
                  {eur(recipient.differenz)}
                </td>
              </tr>
            ) : null}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
