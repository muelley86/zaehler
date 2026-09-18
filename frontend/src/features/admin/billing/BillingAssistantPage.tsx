/**
 * Abrechnungsassistent (Plan Phase 5): führt den Monat in vier Schritten durch –
 * ① Rechnung des Lieferanten importieren ② Zählerstände zum Monatsende prüfen ③ Entwurf berechnen
 * ④ festschreiben. Jeder Schritt zeigt, ob er erledigt ist, und bietet genau die nächste Aktion an.
 *
 * Die Seite bringt keine eigene Rechenlogik mit: sie bündelt die vorhandenen Endpunkte und
 * verlinkt für Feinarbeit (manuelle Stände, Begründungen) auf die Detailseite des Laufs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Circle } from 'lucide-react';

import { Button, LargeTitle, Section, TextField } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateDe, formatDe } from '@/lib/format';
import type {
  BillingCircleRead,
  BillingInvoiceRead,
  BillingReadingsRead,
  BillingRunRead,
  BillingRunSummary,
} from '@/lib/types';

import { errorText, lastDayOfPreviousMonth } from './circleForm';
import { InvoiceUpload } from './InvoiceUpload';
import { MonthReadingsView } from './MonthReadingsView';
import { eur } from './runFormat';

/** Kopfzeile eines Schritts: Nummer, Titel, Haken wenn erledigt. */
function Schritt({
  nummer,
  titel,
  erledigt,
  children,
}: {
  nummer: number;
  titel: string;
  erledigt: boolean;
  children: ReactNode;
}) {
  return (
    <Section
      header={
        <span className="flex items-center gap-2">
          {erledigt ? (
            <Check size={16} className="text-success" aria-hidden />
          ) : (
            <Circle size={16} className="text-tertiary" aria-hidden />
          )}
          <span className="sr-only">{erledigt ? 'Erledigt:' : 'Offen:'}</span>
          {nummer}. {titel}
        </span>
      }
    >
      <div className="space-y-3 p-5">{children}</div>
    </Section>
  );
}

export function BillingAssistantPage() {
  const { id } = useParams<{ id: string }>();
  const circleId = Number(id);
  const [search, setSearch] = useSearchParams();
  const monat = search.get('monat') ?? lastDayOfPreviousMonth().slice(0, 7);

  const [circle, setCircle] = useState<BillingCircleRead | null>(null);
  const [invoice, setInvoice] = useState<BillingInvoiceRead | null>(null);
  const [readings, setReadings] = useState<BillingReadingsRead | null>(null);
  const [readingsError, setReadingsError] = useState<string | null>(null);
  const [run, setRun] = useState<BillingRunRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Laufende Nummer des Ladevorgangs: ein Monatswechsel macht ältere Antworten ungültig. */
  const anfrage = useRef(0);

  const basis = `/billing-circles/${circleId}`;

  const laden = useCallback(async () => {
    const meine = ++anfrage.current;
    const [kreis, rechnungen, laeufe] = await Promise.all([
      api.get<BillingCircleRead>(basis),
      api.get<BillingInvoiceRead[]>(`${basis}/invoices`),
      api.get<BillingRunSummary[]>(`${basis}/runs`),
    ]);
    const offen = laeufe
      .filter((r) => r.monat === monat && r.status !== 'ersetzt')
      .sort((a, b) => a.version - b.version)
      .at(-1);
    const detail = offen ? await api.get<BillingRunRead>(`${basis}/runs/${offen.id}`) : null;
    if (meine !== anfrage.current) return; // ein neuerer Ladevorgang hat übernommen
    setCircle(kreis);
    setInvoice(rechnungen.find((i) => i.period_month === monat) ?? null);
    setRun(detail);
  }, [basis, monat]);

  /** Stände getrennt laden: ein Fehler dort darf Rechnung, Entwurf und Kopf nicht verdecken. */
  const staendeLaden = useCallback(async () => {
    const meine = anfrage.current;
    try {
      const bericht = await api.get<BillingReadingsRead>(
        `${basis}/readings?monat=${encodeURIComponent(monat)}`,
      );
      if (meine !== anfrage.current) return;
      setReadings(bericht);
      setReadingsError(null);
    } catch (err) {
      if (meine !== anfrage.current) return;
      setReadings(null);
      setReadingsError(errorText(err, 'Zählerstände konnten nicht ermittelt werden.'));
    }
  }, [basis, monat]);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(monat)) return;
    setError(null);
    laden().catch((err: unknown) => setError(errorText(err, 'Konnte den Monat nicht laden.')));
    void staendeLaden();
  }, [laden, staendeLaden, monat]);

  /**
   * Eine Aktion samt anschließendem Neuladen; `busy` endet erst danach, sonst wäre der Knopf
   * zwischen Antwort und neuem Zustand kurz wieder klickbar (zweiter POST → 409).
   */
  const aktion = useCallback(
    async (was: () => Promise<unknown>, fehler: string) => {
      setBusy(true);
      setError(null);
      try {
        await was();
        await Promise.all([laden(), staendeLaden()]);
      } catch (err) {
        setError(errorText(err, fehler));
      } finally {
        setBusy(false);
      }
    },
    [laden, staendeLaden],
  );

  const blockierend = run?.befunde.filter((b) => b.blocking) ?? [];
  const hinweise = run?.befunde.filter((b) => !b.blocking) ?? [];
  const festgeschrieben = run?.status === 'festgeschrieben';
  const ergebnis = run?.result ?? null;

  return (
    <>
      <Link
        to={`/admin/abrechnungskreise/${circleId}`}
        className="mb-2 inline-flex items-center gap-1 text-body text-primary"
      >
        <ArrowLeft size={16} /> Abrechnungskreis
      </Link>
      <LargeTitle
        title="Monat abrechnen"
        subtitle={circle ? `${circle.code} · ${circle.name}` : undefined}
      />
      {error ? (
        <div className="mb-3 rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </div>
      ) : null}

      <Schritt nummer={1} titel="Rechnung des Lieferanten" erledigt={invoice !== null}>
        <TextField
          label="Abrechnungsmonat"
          type="month"
          value={monat}
          onChange={(e) => {
            const naechste = new URLSearchParams(search);
            naechste.set('monat', e.target.value);
            setSearch(naechste, { replace: true });
          }}
        />
        {invoice ? (
          <div className="space-y-1 text-caption text-secondary">
            <div className="text-body text-label">
              Rechnung {invoice.nummer} vom {formatDateDe(invoice.datum)}
            </div>
            <div>
              Zeitraum {formatDateDe(invoice.period_from)} – {formatDateDe(invoice.period_to)} ·{' '}
              {formatDe(invoice.verbrauch_kwh)} kWh · {eur(invoice.betrag_netto)} netto
            </div>
            {invoice.hinweise.length > 0 ? (
              <ul className="space-y-1">
                {invoice.hinweise.map((h) => (
                  <li key={h} className="rounded-card bg-fill px-3 py-2">
                    {h}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <InvoiceUpload
            circleId={circleId}
            onImported={(neu) => setInvoice(neu)}
            label={`Rechnung für ${monat} importieren (PDF)`}
          />
        )}
      </Schritt>

      <Schritt
        nummer={2}
        titel="Zählerstände zum Monatsende"
        erledigt={readings !== null && readings.findings.length === 0}
      >
        {readingsError ? (
          <div className="text-caption text-danger">{readingsError}</div>
        ) : readings ? (
          <MonthReadingsView report={readings} />
        ) : (
          <div className="text-caption text-tertiary">Lade…</div>
        )}
      </Schritt>

      <Schritt nummer={3} titel="Entwurf berechnen" erledigt={ergebnis !== null}>
        {run === null ? (
          <>
            <p className="text-caption text-secondary">
              Der Entwurf friert Empfänger, Kostenstellen und Zählerstände des Monats ein und
              rechnet mit der importierten Rechnung.
            </p>
            <Button
              variant="filled"
              disabled={busy || invoice === null}
              onClick={() =>
                void aktion(
                  () => api.post(`${basis}/runs`, { monat }),
                  'Entwurf konnte nicht angelegt werden.',
                )
              }
            >
              Entwurf anlegen
            </Button>
            {invoice === null ? (
              <div className="text-caption text-tertiary">Erst die Rechnung importieren.</div>
            ) : null}
          </>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-caption sm:grid-cols-4">
              <dt className="text-tertiary">Preis</dt>
              <dd className="tabular-nums">
                {ergebnis ? `${formatDe(ergebnis.preis_eur)} €/kWh` : '—'}
              </dd>
              <dt className="text-tertiary">Summe</dt>
              <dd className="tabular-nums">{eur(ergebnis?.gesamt_eur)}</dd>
              <dt className="text-tertiary">Saldo</dt>
              <dd className="tabular-nums">{eur(ergebnis?.saldo_eur)}</dd>
              <dt className="text-tertiary">Version</dt>
              <dd className="tabular-nums">{run.version}</dd>
            </dl>
            {blockierend.length > 0 ? (
              <ul className="space-y-1" aria-label="Blockierende Befunde">
                {blockierend.map((b, i) => (
                  <li
                    key={`${b.code}-${i}`}
                    className="rounded-card bg-danger/10 px-3 py-2 text-caption text-danger"
                  >
                    <strong>{b.label}:</strong> {b.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {hinweise.length > 0 ? (
              <ul className="space-y-1" aria-label="Hinweise">
                {hinweise.map((b, i) => (
                  <li
                    key={`${b.code}-${i}`}
                    className="rounded-card bg-fill px-3 py-2 text-caption text-secondary"
                  >
                    <strong>{b.label}:</strong> {b.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center gap-4">
              {!festgeschrieben ? (
                <Button
                  variant="bordered"
                  disabled={busy}
                  onClick={() =>
                    void aktion(
                      () => api.post(`${basis}/runs/${run.id}/refresh`, {}),
                      'Aktualisieren fehlgeschlagen.',
                    )
                  }
                >
                  Aus der App aktualisieren
                </Button>
              ) : null}
              <Link
                to={`/admin/abrechnungskreise/${circleId}/laeufe/${run.id}`}
                className="text-body text-primary"
              >
                Zeilen und manuelle Werte bearbeiten
              </Link>
            </div>
          </>
        )}
      </Schritt>

      <Schritt nummer={4} titel="Festschreiben" erledigt={festgeschrieben}>
        {run === null ? (
          <div className="text-caption text-tertiary">Erst den Entwurf berechnen.</div>
        ) : festgeschrieben ? (
          <div className="space-y-2">
            <div className="text-caption text-success">
              Festgeschrieben – Version {run.version} ist unveränderlich.
            </div>
            <div className="flex flex-wrap gap-4">
              <Link
                to={`/admin/abrechnungskreise/${circleId}/laeufe/${run.id}/anhang`}
                className="text-body text-primary"
              >
                Rechnungsanhang drucken
              </Link>
              <Link
                to={`/admin/abrechnungskreise/${circleId}/laeufe/${run.id}`}
                className="text-body text-primary"
              >
                Nach Agrarmonitor übertragen
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="text-caption text-secondary">
              Nach dem Festschreiben sind die Werte unveränderlich; Korrekturen laufen über eine
              neue Version mit Begründung.
            </p>
            <Button
              variant="filled"
              disabled={busy || blockierend.length > 0 || ergebnis === null}
              onClick={() =>
                void aktion(
                  () => api.post(`${basis}/runs/${run.id}/finalize`, {}),
                  'Festschreiben fehlgeschlagen.',
                )
              }
            >
              Festschreiben
            </Button>
            {blockierend.length > 0 ? (
              <div className="text-caption text-danger">
                {blockierend.length} blockierende Befunde verhindern das Festschreiben.
              </div>
            ) : null}
          </>
        )}
      </Schritt>
    </>
  );
}
