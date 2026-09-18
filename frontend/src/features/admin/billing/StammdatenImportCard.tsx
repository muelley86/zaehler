/**
 * Import der Stammdaten aus der Stromabrechnung (`python -m stromabrechnung.export_app`).
 * Datei wählen → Vorschau (der Server führt den Import aus und rollt zurück) → Übernehmen.
 */
import { useState } from 'react';
import type { ChangeEvent } from 'react';

import { Button, Section } from '@/components/ui';
import { api } from '@/lib/api';
import type { BillingImportLevel, BillingImportReport } from '@/lib/types';

import { errorText } from './circleForm';

const MAX_BYTES = 1_000_000;

const LEVEL_LABEL: Record<BillingImportLevel, string> = {
  aktion: 'Aktion',
  hinweis: 'Hinweis',
  fehler: 'Fehler',
};

const LEVEL_CLASS: Record<BillingImportLevel, string> = {
  aktion: 'bg-primary-soft text-primary-deep',
  hinweis: 'bg-fill text-secondary',
  fehler: 'bg-danger/10 text-danger',
};

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Datei nicht lesbar'));
    reader.readAsText(file, 'utf-8');
  });
}

export function StammdatenImportCard({ onApplied }: { onApplied: () => void }) {
  const [payload, setPayload] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<BillingImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(data: unknown, apply: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<BillingImportReport>(
        `/billing-circles/import?apply=${apply ? 'true' : 'false'}`,
        data,
      );
      setReport(result);
      if (apply) onApplied();
    } catch (err) {
      setReport(null);
      setError(errorText(err, 'Import fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setReport(null);
    setPayload(null);
    setFileName(file.name);
    if (file.size > MAX_BYTES) {
      setError('Die Datei ist zu groß (max. 1 MB).');
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await readText(file));
    } catch {
      setError('Die Datei ist kein gültiges JSON.');
      return;
    }
    setPayload(data);
    await run(data, false);
  }

  return (
    <Section header="Stammdaten importieren">
      <div className="space-y-3 p-5">
        <p className="text-caption text-tertiary">
          Datei aus der Stromabrechnung (<code>export_app</code>). Positionen werden über die
          Zählernummer zugeordnet; fehlende Eigentümer und Kostenstellen werden ab dem
          Gültigkeitsdatum nachgetragen, Abweichungen nur gemeldet.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-caption-bold uppercase text-tertiary">
            Import-Datei
          </span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => void selectFile(e)}
            disabled={busy}
            aria-label="Import-Datei"
            className="block w-full text-caption"
          />
        </label>
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        {report ? (
          <>
            <div className="text-body text-label">
              {report.applied ? 'Übernommen' : 'Vorschau'} für {fileName} (gültig ab{' '}
              {report.valid_from}): {report.counts.aktion} Aktionen, {report.counts.hinweis}{' '}
              Hinweise, {report.counts.fehler} Fehler
            </div>
            <ul className="max-h-96 space-y-1 overflow-y-auto" aria-label="Import-Ergebnis">
              {report.entries.map((entry, i) => (
                <li key={i} className="flex items-start gap-2 text-caption">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${LEVEL_CLASS[entry.level]}`}
                  >
                    {LEVEL_LABEL[entry.level]}
                  </span>
                  <span className="text-label">
                    {entry.circle}
                    {entry.label ? ` · ${entry.label}` : ''}: {entry.message}
                  </span>
                </li>
              ))}
            </ul>
            {!report.applied ? (
              <Button
                variant="filled"
                fullWidth
                disabled={busy || report.counts.aktion === 0}
                onClick={() => void run(payload, true)}
              >
                {busy ? 'Übernehme…' : 'Übernehmen'}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </Section>
  );
}
