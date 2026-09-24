/**
 * Abrechnungslauf: Parameter (Zusatzkosten, Aufschläge), Ergebnis (Preis, Summen, Saldo, Empfänger),
 * Befunde (blockierend/Hinweis), Zeilen mit Ständen und manuellen Werten; Aktualisieren aus der App,
 * Festschreiben, Entwurf löschen. Festgeschriebene Läufe sind nur lesbar.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Pencil } from 'lucide-react';

import { Button, LargeTitle, Section, Sheet, TextField } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTimeDe, formatDe, parseDe } from '@/lib/format';
import type { BillingRunLineRead, BillingRunRead } from '@/lib/types';

import { errorText } from './circleForm';
import { ExcelImportSection } from './ExcelImportSection';
import { RunDiffSection } from './RunDiffSection';
import { TransferSection } from './TransferSection';
import {
  anteilZuProzent,
  eur,
  num,
  prozentZuAnteil,
  RUN_STATUS_CLASS,
  RUN_STATUS_LABEL,
} from './runFormat';

function Stand({
  wert,
  manuell,
  art,
  abstand,
}: {
  wert: string | null;
  manuell: string | null;
  art: string | null;
  abstand: number | null;
}) {
  if (manuell !== null) {
    return (
      <span title={`App-Wert: ${num(wert) || '—'}`}>
        <span className="tabular-nums">{num(manuell)}</span>
        <span className="ml-1 rounded-full bg-primary-soft px-1.5 py-0.5 text-primary-deep">
          manuell
        </span>
      </span>
    );
  }
  if (wert === null) return <span className="text-tertiary">—</span>;
  return (
    <span>
      <span className="tabular-nums">{num(wert)}</span>
      {art && art !== 'abgelesen' ? (
        <span
          className={`ml-1 rounded-full px-1.5 py-0.5 ${
            art === 'interpoliert' ? 'bg-fill-strong text-secondary' : 'bg-danger/10 text-danger'
          }`}
        >
          {art === 'interpoliert' ? `±${abstand ?? 0} T` : 'unvollständig'}
        </span>
      ) : null}
    </span>
  );
}

export function BillingRunDetailPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const circleId = Number(id);
  const navigate = useNavigate();
  const base = `/billing-circles/${circleId}/runs/${Number(runId)}`;
  const [run, setRun] = useState<BillingRunRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zeile, setZeile] = useState<BillingRunLineRead | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<BillingRunRead>(base)
      .then((d) => {
        if (!cancelled) setRun(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte den Abrechnungslauf nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  async function aktion(fn: () => Promise<BillingRunRead | null>, fehler: string) {
    setBusy(true);
    setError(null);
    try {
      const neu = await fn();
      if (neu) setRun(neu);
    } catch (err) {
      setError(errorText(err, fehler));
    } finally {
      setBusy(false);
    }
  }

  function festschreiben() {
    if (!window.confirm('Lauf festschreiben? Danach sind keine Änderungen mehr möglich.')) return;
    void aktion(
      () => api.post<BillingRunRead>(`${base}/finalize`),
      'Festschreiben fehlgeschlagen.',
    );
  }

  function aktualisieren() {
    void aktion(() => api.post<BillingRunRead>(`${base}/refresh`), 'Aktualisieren fehlgeschlagen.');
  }

  function loeschen() {
    if (!window.confirm('Entwurf löschen?')) return;
    void aktion(async () => {
      await api.delete(base);
      navigate(`/admin/abrechnungskreise/${circleId}`);
      return null;
    }, 'Löschen fehlgeschlagen.');
  }

  if (!run) {
    return error ? <div className="text-danger">{error}</div> : <div>Lade…</div>;
  }

  const entwurf = run.status === 'entwurf';
  const blockierend = run.befunde.filter((b) => b.blocking);
  const hinweise = run.befunde.filter((b) => !b.blocking);
  const r = run.result;
  const saldoRot = r !== null && Math.abs(Number(r.saldo_eur)) > Number(r.saldo_grenze_eur);

  return (
    <>
      <Link
        to={`/admin/abrechnungskreise/${circleId}`}
        className="mb-2 inline-flex items-center gap-1 text-body text-primary"
      >
        <ArrowLeft size={16} /> Abrechnungskreis
      </Link>
      <LargeTitle
        title={`Abrechnung ${run.monat} · Version ${run.version}`}
        subtitle={
          run.finalized_at
            ? `Festgeschrieben am ${formatDateTimeDe(run.finalized_at)}`
            : `Angelegt am ${formatDateTimeDe(run.created_at)}`
        }
        trailing={
          <span className={`rounded-full px-3 py-1 text-caption ${RUN_STATUS_CLASS[run.status]}`}>
            {RUN_STATUS_LABEL[run.status]}
          </span>
        }
      />
      {error ? (
        <div className="mb-3 rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </div>
      ) : null}
      {run.begruendung ? (
        <div className="mb-3 text-caption text-secondary">Begründung: {run.begruendung}</div>
      ) : null}

      {entwurf ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant="filled"
            disabled={busy || blockierend.length > 0 || r === null}
            onClick={festschreiben}
          >
            Festschreiben
          </Button>
          <Button variant="bordered" disabled={busy} onClick={aktualisieren}>
            Aus der App aktualisieren
          </Button>
          <Button variant="bordered" disabled={busy} onClick={loeschen}>
            Entwurf löschen
          </Button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
        {r !== null ? (
          <Link
            to={`/admin/abrechnungskreise/${circleId}/laeufe/${run.id}/anhang`}
            className="inline-flex items-center gap-1 text-body text-primary"
          >
            <FileText size={16} /> Rechnungsanhang (Druckansicht)
          </Link>
        ) : null}
        {/* Eingabe für den Excel-Generator der Stromabrechnung (generate.py --excel). */}
        <a
          href={`/api/v1${base}/monats-json`}
          download
          className="inline-flex items-center gap-1 text-body text-primary"
        >
          <Download size={16} /> Monats-JSON für Excel
        </a>
      </div>

      <ParameterSection
        key={`${run.id}-${run.zusatzkosten}-${run.aufschlag_prozent}-${run.aufschlag_ct}`}
        run={run}
        base={base}
        disabled={!entwurf || busy}
        onSaved={setRun}
      />

      <Section header="Ergebnis">
        {r === null ? (
          <div className="p-5 text-caption text-danger">
            Keine Berechnung möglich – siehe blockierende Befunde.
          </div>
        ) : (
          <div className="space-y-3 p-5 text-caption">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-tertiary">Abrechnungspreis</dt>
              <dd className="tabular-nums">
                {formatDe(r.preis_eur)} €/kWh ({formatDe(r.preis_ct)} ct)
              </dd>
              <dt className="text-tertiary">Umlagepreis / Einkaufspreis</dt>
              <dd className="tabular-nums">
                {formatDe(r.umlagepreis_ct, { maximumFractionDigits: 4 })} ct /{' '}
                {formatDe(r.einkaufspreis_ct, { maximumFractionDigits: 4 })} ct
              </dd>
              <dt className="text-tertiary">Bezugsmenge / Zählersumme</dt>
              <dd className="tabular-nums">
                {formatDe(r.bezugsmenge)} kWh / {formatDe(r.zaehlersumme)} kWh
              </dd>
              <dt className="text-tertiary">Gesamtkosten / Summe Beträge</dt>
              <dd className="tabular-nums">
                {eur(r.gesamtkosten)} / {eur(r.gesamt_eur)}
              </dd>
              <dt className="text-tertiary">Saldo</dt>
              <dd className={`tabular-nums ${saldoRot ? 'text-danger' : ''}`}>
                {eur(r.saldo_eur)} (Grenze {eur(r.saldo_grenze_eur)})
              </dd>
            </dl>
            <table className="w-full text-left" aria-label="Empfänger">
              <thead className="text-tertiary">
                <tr>
                  <th className="py-1 pr-3">Empfänger</th>
                  <th className="py-1 pr-3 text-right">kWh</th>
                  <th className="py-1 text-right">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {r.gruppen.map((g) => (
                  <tr key={g.name} className="border-t border-separator even:bg-fill">
                    <td className="py-1 pr-3 text-label">
                      {g.name}
                      {g.intern ? ' (intern)' : ''}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">{num(g.kwh)}</td>
                    <td className="py-1 text-right tabular-nums">{eur(g.eur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section header={`Befunde (${blockierend.length} blockierend, ${hinweise.length} Hinweise)`}>
        <ul className="space-y-1 p-5" aria-label="Befunde">
          {[...blockierend, ...hinweise].map((b, i) => (
            <li
              key={`${b.code}-${b.position_id ?? 'kreis'}-${i}`}
              className={`rounded-card px-3 py-2 text-caption ${
                b.blocking ? 'bg-danger/10 text-danger' : 'bg-fill text-secondary'
              }`}
            >
              <strong>{b.label}:</strong> {b.message}
            </li>
          ))}
        </ul>
      </Section>

      <Section header="Zeilen">
        <div className="overflow-x-auto p-5">
          <table className="w-full text-left text-caption" aria-label="Zeilen">
            <thead className="text-tertiary">
              <tr>
                <th className="py-1 pr-3">Position</th>
                <th className="py-1 pr-3">Empfänger / KST</th>
                <th className="py-1 pr-3">Zähler</th>
                <th className="py-1 pr-3 text-right">Faktor</th>
                <th className="py-1 pr-3 text-right">Stand alt</th>
                <th className="py-1 pr-3 text-right">Stand neu</th>
                <th className="py-1 pr-3 text-right">Korrektur</th>
                <th className="py-1 pr-3 text-right">kWh</th>
                <th className="py-1 pr-3 text-right">Betrag</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {run.lines.map((z) => (
                <tr key={z.id} className="border-t border-separator align-top even:bg-fill">
                  <td className="py-1 pr-3 text-label">
                    {z.label}
                    {z.kind === 'rest' ? ' (Rest)' : ''}
                    {z.parent_label ? (
                      <div className="text-tertiary">Unterzähler von {z.parent_label}</div>
                    ) : null}
                    {z.pruefung && z.pruefung !== 'OK' ? (
                      <div className="text-danger">{z.pruefung}</div>
                    ) : null}
                  </td>
                  <td className="py-1 pr-3">
                    {z.owner_name ?? <span className="text-danger">ohne Empfänger</span>}
                    {z.recipient_kind === 'mieter' ? ' (Mieter)' : ''}
                    <div className="text-tertiary">KST {z.kostenstelle ?? '—'}</div>
                  </td>
                  <td className="py-1 pr-3">{z.serial_numbers || '—'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {z.transformer_factor ?? ''}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {z.kind === 'meter' ? (
                      <Stand
                        wert={z.stand_alt}
                        manuell={z.manual_stand_alt}
                        art={z.stand_alt_art}
                        abstand={z.stand_alt_abstand}
                      />
                    ) : null}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {z.kind === 'meter' ? (
                      <Stand
                        wert={z.stand_neu}
                        manuell={z.manual_stand_neu}
                        art={z.stand_neu_art}
                        abstand={z.stand_neu_abstand}
                      />
                    ) : null}
                  </td>
                  <td
                    className="py-1 pr-3 text-right tabular-nums"
                    title={
                      (z.manual_korrektur_kwh !== null ? z.manual_note : z.korrektur_note) ??
                      undefined
                    }
                  >
                    {num(z.manual_korrektur_kwh ?? z.korrektur_kwh)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{num(z.kwh)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{eur(z.eur)}</td>
                  <td className="py-1">
                    {entwurf && z.kind === 'meter' ? (
                      <button
                        type="button"
                        onClick={() => setZeile(z)}
                        aria-label={`Zeile ${z.label} manuell ändern`}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-secondary hover:bg-fill-strong"
                      >
                        <Pencil size={13} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {entwurf ? (
        <ExcelImportSection
          base={base}
          onApplied={() =>
            void aktion(() => api.get<BillingRunRead>(base), 'Neu laden fehlgeschlagen.')
          }
        />
      ) : null}

      {run.version > 1 ? <RunDiffSection circleId={circleId} runId={run.id} /> : null}

      <TransferSection circleId={circleId} runId={run.id} status={run.status} />

      <Sheet open={zeile !== null} onClose={() => setZeile(null)} title="Manuelle Werte">
        {zeile ? (
          <LineForm
            line={zeile}
            url={`${base}/lines/${zeile.id}`}
            onSaved={(neu) => {
              setRun(neu);
              setZeile(null);
            }}
            onCancel={() => setZeile(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function ParameterSection({
  run,
  base,
  disabled,
  onSaved,
}: {
  run: BillingRunRead;
  base: string;
  disabled: boolean;
  onSaved: (run: BillingRunRead) => void;
}) {
  const [zusatz, setZusatz] = useState(formatDe(run.zusatzkosten, { maximumFractionDigits: 2 }));
  const [prozent, setProzent] = useState(anteilZuProzent(run.aufschlag_prozent));
  const [ct, setCt] = useState(formatDe(run.aufschlag_ct, { maximumFractionDigits: 4 }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let body: Record<string, string>;
    try {
      body = {
        zusatzkosten: parseDe(zusatz || '0'),
        aufschlag_prozent: prozentZuAnteil(prozent || '0'),
        aufschlag_ct: parseDe(ct || '0'),
      };
    } catch {
      setError('Bitte gültige Zahlen eingeben.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.patch<BillingRunRead>(base, body));
    } catch (err) {
      setError(errorText(err, 'Speichern fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section header="Parameter">
      <form onSubmit={(e) => void save(e)} className="space-y-3 p-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <TextField
            label="Zusatzkosten EUR"
            value={zusatz}
            onChange={(e) => setZusatz(e.target.value)}
            inputMode="decimal"
            disabled={disabled}
          />
          <TextField
            label="Aufschlag %"
            value={prozent}
            onChange={(e) => setProzent(e.target.value)}
            inputMode="decimal"
            disabled={disabled}
          />
          <TextField
            label="Aufschlag ct/kWh"
            value={ct}
            onChange={(e) => setCt(e.target.value)}
            inputMode="decimal"
            disabled={disabled}
          />
        </div>
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        {disabled ? null : (
          <Button type="submit" variant="bordered" disabled={busy}>
            {busy ? 'Rechne…' : 'Übernehmen und neu rechnen'}
          </Button>
        )}
      </form>
    </Section>
  );
}

function LineForm({
  line,
  url,
  onSaved,
  onCancel,
}: {
  line: BillingRunLineRead;
  url: string;
  onSaved: (run: BillingRunRead) => void;
  onCancel: () => void;
}) {
  const [alt, setAlt] = useState(num(line.manual_stand_alt));
  const [neu, setNeu] = useState(num(line.manual_stand_neu));
  const [korrektur, setKorrektur] = useState(num(line.manual_korrektur_kwh));
  const [note, setNote] = useState(line.manual_note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let body: Record<string, string | null>;
    try {
      body = {
        manual_stand_alt: alt.trim() ? parseDe(alt) : null,
        manual_stand_neu: neu.trim() ? parseDe(neu) : null,
        manual_korrektur_kwh: korrektur.trim() ? parseDe(korrektur) : null,
        manual_note: note.trim() || null,
      };
    } catch {
      setError('Bitte gültige Zahlen eingeben.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.patch<BillingRunRead>(url, body));
    } catch (err) {
      setError(errorText(err, 'Speichern fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <div className="text-body font-semibold text-label">{line.label}</div>
      <div className="text-caption text-tertiary">
        App: Stand alt {num(line.stand_alt) || '—'}, Stand neu {num(line.stand_neu) || '—'},
        Korrektur {num(line.korrektur_kwh) || '—'}. Leere Felder = Wert aus der App.
      </div>
      <TextField
        label="Stand alt"
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        inputMode="decimal"
      />
      <TextField
        label="Stand neu"
        value={neu}
        onChange={(e) => setNeu(e.target.value)}
        inputMode="decimal"
      />
      <TextField
        label="Korrektur kWh"
        value={korrektur}
        onChange={(e) => setKorrektur(e.target.value)}
        inputMode="decimal"
        hint="Ersetzt die automatische Korrektur (Zählertausch/Überlauf) vollständig."
      />
      <TextField
        label="Begründung"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
      />
      {error ? <div className="text-caption text-danger">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Rechne…' : 'Speichern'}
        </Button>
        <Button type="button" variant="bordered" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
