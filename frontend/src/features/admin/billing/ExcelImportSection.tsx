/**
 * Excel-Weg (Plan Phase 6): Monats-JSON der Stromabrechnung in den Entwurf übernehmen. Erst
 * Vorschau (Zuordnung über die Bezeichnung, nichts wird geändert), dann Übernahme: abweichende
 * Stände werden manuelle Werte mit Begründung „Excel-Monatsdatei …“, der Lauf wird neu gerechnet.
 */
import { useState } from 'react';
import type { ChangeEvent } from 'react';

import { Button, Section } from '@/components/ui';
import { api } from '@/lib/api';
import type { BillingExcelImportRead, ExcelImportLine, ExcelImportStatus } from '@/lib/types';

import { errorText } from './circleForm';
import { num } from './runFormat';

const MAX_BYTES = 1024 * 1024;

const STATUS_LABEL: Record<ExcelImportStatus, string> = {
  gleich: 'gleich',
  abweichend: 'wird übernommen',
  unbekannt: 'nicht in der App',
  nicht_uebernehmbar: 'nicht übernehmbar',
  fehlt_in_datei: 'fehlt in der Datei',
  rest: 'Restmenge',
};

const PARAMETER_LABEL = {
  zusatzkosten: 'Zusatzkosten (EUR)',
  aufschlag_prozent: 'Aufschlag (Anteil)',
  aufschlag_ct: 'Aufschlag (ct/kWh)',
} as const;

function Werte({
  alt,
  neu,
  korr,
}: {
  alt: string | null;
  neu: string | null;
  korr: string | null;
}) {
  const korrektur = korr !== null && Number(korr) !== 0 ? ` · Korr. ${num(korr)}` : '';
  return (
    <span className="tabular-nums">
      {num(alt) || '—'} → {num(neu) || '—'}
      {korrektur}
    </span>
  );
}

function Zeile({ z }: { z: ExcelImportLine }) {
  return (
    <tr className="border-hairline border-t align-top even:bg-fill">
      <td className="py-1 pr-3">{z.label}</td>
      <td className="py-1 pr-3">{STATUS_LABEL[z.status]}</td>
      <td className="py-1 pr-3">
        <Werte alt={z.app_stand_alt} neu={z.app_stand_neu} korr={z.app_korrektur} />
      </td>
      <td className="py-1 pr-3">
        <Werte alt={z.excel_stand_alt} neu={z.excel_stand_neu} korr={z.excel_korrektur} />
      </td>
      <td className="py-1 text-tertiary">{z.hinweis ?? ''}</td>
    </tr>
  );
}

export function ExcelImportSection({ base, onApplied }: { base: string; onApplied: () => void }) {
  const [datei, setDatei] = useState<File | null>(null);
  const [bericht, setBericht] = useState<BillingExcelImportRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function senden(file: File, uebernehmen: boolean) {
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    setError(null);
    try {
      const antwort = await api.upload<BillingExcelImportRead>(
        `${base}/excel-import?uebernehmen=${String(uebernehmen)}`,
        fd,
        'POST',
      );
      setBericht(antwort);
      if (uebernehmen) onApplied();
    } catch (err) {
      setError(errorText(err, 'Die Datei konnte nicht gelesen werden.'));
    } finally {
      setBusy(false);
    }
  }

  function waehlen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setBericht(null);
    setDatei(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('Die Datei ist zu groß (max. 1 MB).');
      return;
    }
    setDatei(file);
    void senden(file, false);
  }

  const auffaellig = bericht?.zeilen.filter((z) => z.status !== 'gleich' && z.status !== 'rest');
  const abweichend = bericht?.zeilen.filter((z) => z.status === 'abweichend').length ?? 0;
  const gleich = bericht?.zeilen.filter((z) => z.status === 'gleich').length ?? 0;
  const etwasZuTun = abweichend > 0 || (bericht?.parameter.length ?? 0) > 0;

  return (
    <Section header="Excel-Monatsdatei übernehmen">
      <div className="space-y-3 p-5 text-caption">
        <p className="text-secondary">
          Monats-JSON der Stromabrechnung (z. B. aus einer von Hand befüllten Mappe). Abweichende
          Stände werden als manuelle Werte mit Begründung übernommen; zuerst erscheint eine
          Vorschau.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-caption-bold uppercase text-tertiary">
            Monats-JSON wählen
          </span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={waehlen}
            disabled={busy}
            className="block w-full text-caption"
          />
        </label>
        {busy ? <div className="text-tertiary">Datei wird geprüft…</div> : null}
        {error ? <div className="text-danger">{error}</div> : null}
        {bericht ? (
          <div className="space-y-3">
            <div className={bericht.uebernommen ? 'font-semibold text-label' : 'text-label'}>
              {bericht.uebernommen
                ? `Übernommen: ${abweichend} Zeilen, ${bericht.parameter.length} Parameter.`
                : `Vorschau: ${abweichend} abweichend, ${gleich} gleich.`}
            </div>
            {bericht.parameter.length > 0 ? (
              <ul className="list-disc pl-5">
                {bericht.parameter.map((p) => (
                  <li key={p.feld}>
                    {PARAMETER_LABEL[p.feld]}: {num(p.app)} → {num(p.excel)}
                  </li>
                ))}
              </ul>
            ) : null}
            {auffaellig && auffaellig.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left" aria-label="Abgleich Excel-Monatsdatei">
                  <thead className="text-tertiary">
                    <tr>
                      <th className="py-1 pr-3 font-normal">Bezeichnung</th>
                      <th className="py-1 pr-3 font-normal">Status</th>
                      <th className="py-1 pr-3 font-normal">App (alt → neu)</th>
                      <th className="py-1 pr-3 font-normal">Datei (alt → neu)</th>
                      <th className="py-1 font-normal">Hinweis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auffaellig.map((z) => (
                      <Zeile key={z.label} z={z} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {!bericht.uebernommen && datei ? (
              <Button
                variant="filled"
                disabled={busy || !etwasZuTun}
                onClick={() => void senden(datei, true)}
              >
                {etwasZuTun ? 'Werte übernehmen' : 'Nichts zu übernehmen'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
