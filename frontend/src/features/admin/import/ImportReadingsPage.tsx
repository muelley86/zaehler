/**
 * Admin ▸ Import — historische Zählerstände aus Excel/CSV.
 *
 * Drei Schritte in einer Komponente: Datei hochladen (-> Backend ``preview``),
 * je Zeile Messstelle + Register zuordnen (Auto-Match vorausgewählt), dann
 * importieren (-> ``commit``). Backend übernimmt Parsen, Dedup und Anlegen.
 */

import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

import { Button, Card, LargeTitle, Select, cx } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type {
  ImportCommitResponse,
  ImportPreviewResponse,
  MeasuringPointRead,
  RegisterRead,
} from '@/lib/types';

interface RowChoice {
  mpId: number | null;
  registerId: number | null;
}

/** Aktive Register des aktuell eingebauten (nicht ausgebauten) Zählers. */
function activeRegisters(mp: MeasuringPointRead): RegisterRead[] {
  const meter = mp.physical_meters.find((m) => m.removed_at === null);
  return meter ? meter.registers.filter((r) => r.is_active) : [];
}

export function ImportReadingsPage() {
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mps, setMps] = useState<MeasuringPointRead[]>([]);
  const [choices, setChoices] = useState<Map<number, RowChoice>>(new Map());
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mpById = useMemo(() => new Map(mps.map((m) => [m.id, m])), [mps]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // erlaubt erneute Auswahl derselben Datei
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const [pv, mpList] = await Promise.all([
        api.upload<ImportPreviewResponse>('/imports/readings/preview', fd, 'POST'),
        api.get<MeasuringPointRead[]>('/measuring-points'),
      ]);
      const next = new Map<number, RowChoice>();
      for (const row of pv.rows) {
        const mp =
          row.matched_mp_id != null ? mpList.find((m) => m.id === row.matched_mp_id) : null;
        const regs = mp ? activeRegisters(mp) : [];
        next.set(row.index, {
          mpId: row.matched_mp_id,
          registerId: regs.length === 1 ? regs[0]!.id : null,
        });
      }
      setMps(mpList);
      setFilename(file.name);
      setChoices(next);
      setPreview(pv);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.problem.title)
          : 'Datei konnte nicht gelesen werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  function setMpChoice(rowIndex: number, mpId: number | null) {
    setChoices((prev) => {
      const next = new Map(prev);
      const mp = mpId != null ? mpById.get(mpId) : undefined;
      const regs = mp ? activeRegisters(mp) : [];
      next.set(rowIndex, { mpId, registerId: regs.length === 1 ? regs[0]!.id : null });
      return next;
    });
  }

  function setRegisterChoice(rowIndex: number, registerId: number | null) {
    setChoices((prev) => {
      const next = new Map(prev);
      const cur = next.get(rowIndex) ?? { mpId: null, registerId: null };
      next.set(rowIndex, { ...cur, registerId });
      return next;
    });
  }

  function isMapped(rowIndex: number, valueCount: number): boolean {
    return (choices.get(rowIndex)?.registerId ?? null) != null && valueCount > 0;
  }

  const importableCount = preview
    ? preview.rows.filter((r) => isMapped(r.index, r.cells.filter((c) => c.value != null).length))
        .length
    : 0;

  async function handleCommit() {
    if (!preview) return;
    const rows = preview.rows.flatMap((row) => {
      const choice = choices.get(row.index);
      if (!choice || choice.registerId == null) return [];
      const cells = row.cells
        .filter((c) => c.value != null)
        .map((c) => ({ reading_date: c.reading_date, value: c.value as string }));
      return cells.length ? [{ register_id: choice.registerId, cells }] : [];
    });
    if (rows.length === 0) {
      setError(
        'Keine zuordenbaren Zeilen — bitte mindestens eine Messstelle samt Register wählen.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<ImportCommitResponse>('/imports/readings/commit', {
        rows,
        source_filename: filename,
      });
      setPreview(null);
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.problem.title)
          : 'Import fehlgeschlagen.',
      );
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setChoices(new Map());
    setFilename('');
    setError(null);
  }

  return (
    <>
      <LargeTitle title="Import" subtitle="Historische Zählerstände aus Excel/CSV" />

      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
          {error}
        </div>
      ) : null}

      {result ? (
        <Card className="space-y-3 p-5">
          <div className="text-headline text-label">Import abgeschlossen</div>
          <div className="text-body text-secondary">
            {result.created} angelegt · {result.skipped_existing} übersprungen (bereits vorhanden)
            {result.failed.length > 0 ? ` · ${result.failed.length} Fehler` : ''}
          </div>
          {result.failed.length > 0 ? (
            <ul className="space-y-1 text-caption text-danger">
              {result.failed.map((f, i) => (
                <li key={i}>
                  Register {f.register_id}, {f.reading_date}: {f.reason}
                </li>
              ))}
            </ul>
          ) : null}
          <Button variant="filled" onClick={reset}>
            Weitere Datei importieren
          </Button>
        </Card>
      ) : null}

      {!preview && !result ? (
        <Card className="space-y-4 p-5">
          <div className="text-body text-secondary">
            Tabelle mit je einer Messstelle pro Zeile (erste Spalte = Name) und je einem Monat pro
            Spalte (Überschrift = Datum). Format: .xlsx oder CSV.
          </div>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => void handleFile(e)}
            disabled={busy}
            aria-label="Datei wählen"
            className="block w-full text-body text-label file:mr-3 file:rounded-pill file:border-0 file:bg-primary file:px-4 file:py-2 file:text-white"
          />
          {busy ? <div className="text-caption text-tertiary">Lese Datei…</div> : null}
        </Card>
      ) : null}

      {preview ? (
        <div className="space-y-3">
          {preview.ignored_columns.length > 0 ? (
            <div className="border-warning/40 bg-warning/10 rounded-card border-hairline p-3 text-caption text-secondary">
              Ignorierte Spalten (kein Datum erkannt): {preview.ignored_columns.join(', ')}
            </div>
          ) : null}
          <div className="px-1 text-caption text-tertiary">
            {filename} — {preview.reading_dates.length} Datums-Spalten, {preview.rows.length} Zeilen
          </div>
          {preview.rows.map((row) => {
            const choice = choices.get(row.index) ?? { mpId: null, registerId: null };
            const mp = choice.mpId != null ? mpById.get(choice.mpId) : undefined;
            const regs = mp ? activeRegisters(mp) : [];
            const valueCount = row.cells.filter((c) => c.value != null).length;
            const errorCount = row.cells.filter((c) => c.error != null).length;
            const mapped = isMapped(row.index, valueCount);
            return (
              <Card key={row.index} className={cx('p-3', !mapped && 'opacity-60')}>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                  <div className="min-w-0">
                    <div className="text-caption-bold uppercase text-tertiary">Aus Datei</div>
                    <div className="truncate text-body text-label">{row.raw_name}</div>
                  </div>
                  <Select
                    label="Messstelle"
                    value={choice.mpId ?? ''}
                    onChange={(e) =>
                      setMpChoice(row.index, e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">— nicht importieren —</option>
                    {mps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Register"
                    value={choice.registerId ?? ''}
                    disabled={regs.length === 0}
                    onChange={(e) =>
                      setRegisterChoice(row.index, e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">{regs.length ? '— wählen —' : '—'}</option>
                    {regs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} ({r.obis_code}, {r.unit})
                      </option>
                    ))}
                  </Select>
                  <div className="text-caption text-tertiary md:pb-3">
                    {valueCount} Werte
                    {errorCount > 0 ? (
                      <span className="text-danger"> · {errorCount} ungültig</span>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
          <div className="flex gap-2">
            <Button
              variant="filled"
              onClick={() => void handleCommit()}
              disabled={busy || importableCount === 0}
            >
              {busy ? 'Importiere…' : `${importableCount} Zeile(n) importieren`}
            </Button>
            <Button variant="bordered" onClick={reset} disabled={busy}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
