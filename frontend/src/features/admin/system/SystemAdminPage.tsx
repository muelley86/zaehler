/**
 * System & Backup — Admin-Sub-Page fuer Datensicherung, Versions-Info
 * und Wartung.
 *
 * Funktional verdrahtet: Voll-Backup als ZIP (DB-Snapshot + alle
 * Ablese-Fotos + Manifest), der JSON-Teil-Export sowie die
 * Wiederherstellung eines Backups (Upload → Vorschau → Bestaetigen →
 * Full-Replace). Die restlichen Karten zeigen weiterhin
 * ``BackendPlaceholder``-Hinweise auf ausstehende Endpoints.
 */

import { useState } from 'react';
import type { ChangeEvent } from 'react';

import { Button, Card, LargeTitle, Section } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { RestoreCommitResponse, RestorePreviewResponse } from '@/lib/types';

import { BackendPlaceholder, PlaceholderRow } from '../_placeholders';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.problem.detail ?? err.problem.title ?? 'Unbekannter Fehler';
  }
  return 'Netzwerkfehler — der Vorgang läuft ggf. noch. Bitte die Seite in einer Minute neu laden.';
}

function formatDateTimeDe(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Upload → Vorschau → destruktive Bestaetigung → Ergebnis. */
function RestoreSection() {
  const [preview, setPreview] = useState<RestorePreviewResponse | null>(null);
  const [result, setResult] = useState<RestoreCommitResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'upload' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    setError(null);
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // erlaubt erneute Auswahl derselben Datei
    if (!file) return;
    reset();
    setBusy('upload');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const pv = await api.upload<RestorePreviewResponse>('/restore/upload', fd, 'POST');
      setPreview(pv);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    if (preview) {
      try {
        await api.delete<void>(`/restore/${preview.token}`);
      } catch {
        // Abbrechen darf nie an einem Netzwerkfehler scheitern — der
        // Staging-Eintrag läuft serverseitig ohnehin nach 30 min ab.
      }
    }
    reset();
  }

  async function handleCommit() {
    if (!preview) return;
    setBusy('commit');
    setError(null);
    try {
      const res = await api.post<RestoreCommitResponse>(`/restore/${preview.token}/commit`);
      setResult(res);
      setPreview(null);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (result) {
    return (
      <Card>
        <div className="space-y-3 text-body text-label">
          <div className="font-semibold">Wiederherstellung abgeschlossen</div>
          <p className="text-caption text-tertiary">{result.message}</p>
          {result.relogin_required ? (
            <div className="rounded-card border border-orange-500/40 bg-orange-500/10 p-3 text-caption">
              Die Anmeldedaten stammen jetzt aus dem Backup — bitte neu anmelden.
              <div className="mt-2">
                <Button variant="filled" size="sm" onClick={() => window.location.assign('/')}>
                  Zur Anmeldung
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="tinted" size="sm" onClick={() => window.location.reload()}>
              Seite neu laden
            </Button>
          )}
        </div>
      </Card>
    );
  }

  if (preview) {
    const m = preview.manifest;
    const c = preview.counts;
    const incompatible = preview.compatibility === 'unknown_revision';
    return (
      <Card>
        <div className="space-y-3 text-body text-label">
          <div className="font-semibold">Backup-Vorschau</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-caption">
            <dt className="text-tertiary">Erstellt am</dt>
            <dd>{m ? formatDateTimeDe(m.created_at) : 'unbekannt'}</dd>
            <dt className="text-tertiary">App-Version</dt>
            <dd>{m?.app_version ?? 'unbekannt'}</dd>
            <dt className="text-tertiary">Schema-Revision</dt>
            <dd className="num">{preview.db_alembic_revision ?? 'unbekannt'}</dd>
            <dt className="text-tertiary">Inhalt</dt>
            <dd>
              {c.measuring_points} Messstellen · {c.readings} Ablesungen · {c.photos_in_zip} Fotos ·{' '}
              {c.users} Benutzer
            </dd>
          </dl>

          {preview.warnings.length > 0 ? (
            <ul className="space-y-1 rounded-card border border-yellow-500/40 bg-yellow-500/10 p-3 text-caption">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          {incompatible ? (
            <div className="rounded-card border border-red-500/40 bg-red-500/10 p-3 text-caption">
              Dieses Backup kann nicht eingespielt werden: Es stammt von einer neueren App-Version.
              Bitte zuerst die App aktualisieren.
            </div>
          ) : (
            <div className="rounded-card border border-red-500/40 bg-red-500/10 p-3 text-caption">
              <strong>Achtung:</strong> Alle aktuellen Daten und Fotos werden unwiderruflich durch
              den Backup-Stand ersetzt. Änderungen seit dem Backup gehen verloren.
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>Ich habe verstanden — Daten unwiderruflich ersetzen</span>
              </label>
            </div>
          )}

          {error ? (
            <div className="rounded-card border border-red-500/40 bg-red-500/10 p-3 text-caption">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="filled"
              size="sm"
              disabled={incompatible || !confirmed || busy === 'commit'}
              onClick={() => void handleCommit()}
            >
              {busy === 'commit' ? 'Stelle wieder her…' : 'Jetzt wiederherstellen'}
            </Button>
            <Button
              variant="tinted"
              size="sm"
              disabled={busy === 'commit'}
              onClick={() => void handleCancel()}
            >
              Abbrechen
            </Button>
          </div>
          {busy === 'commit' ? (
            <div className="text-caption text-tertiary">
              Stelle wieder her — bitte die Seite nicht schließen…
            </div>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-3 text-body text-label">
        <p className="text-caption text-tertiary">
          Backup-ZIP (aus „Backup laden“) hochladen. Vor dem Einspielen wird eine Vorschau mit
          Bestätigung angezeigt — erst danach werden Datenbank und Fotos ersetzt.
        </p>
        <input
          type="file"
          accept=".zip,application/zip"
          aria-label="Backup-Datei wählen"
          onChange={(e) => void handleFile(e)}
          className="block w-full text-body text-label file:mr-3 file:rounded-pill file:border-0 file:bg-primary file:px-4 file:py-2 file:text-white"
        />
        {busy === 'upload' ? <div className="text-caption text-tertiary">Prüfe Backup…</div> : null}
        {error ? (
          <div className="rounded-card border border-red-500/40 bg-red-500/10 p-3 text-caption">
            {error}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function SystemAdminPage() {
  return (
    <>
      <LargeTitle title="System & Backup" subtitle="Backup, Version, Wartung" />

      <Section header="Backup">
        <Card padded={false}>
          <PlaceholderRow
            title="Voll-Backup (ZIP)"
            description="Lädt ein vollständiges Backup als ZIP (admin-only): Datenbank-Snapshot (verlustfrei — User, Eigentümer, Standorte, Lieferungen, Audit, Monats-Cache) plus alle Ablese-Fotos und ein Manifest. Wiederherstellen direkt hier unter „Wiederherstellung“."
            action={
              <Button
                variant="filled"
                size="sm"
                onClick={() => window.open('/api/v1/export/backup.zip', '_blank')}
              >
                Backup laden
              </Button>
            }
          />
          <PlaceholderRow
            title="Daten-Export (JSON)"
            description="Menschenlesbarer Teil-Export der Messstellen, Zähler und Ablesungen (admin-only) — kein vollständiges Backup."
            action={
              <Button
                variant="tinted"
                size="sm"
                onClick={() => window.open('/api/v1/export/dump.json', '_blank')}
              >
                Export starten
              </Button>
            }
          />
        </Card>
      </Section>

      <Section header="Wiederherstellung">
        <RestoreSection />
      </Section>

      <Section header="Status">
        <Card padded={false}>
          <BackendPlaceholder
            label="Backup-Status"
            note="Endpoint folgt: GET /api/v1/system/backup-status (zeigt letzten Export-Zeitpunkt)."
          />
          <BackendPlaceholder
            label="App-Version"
            note="Endpoint folgt: GET /api/v1/system/version (Version + Git-SHA des Containers)."
          />
          <BackendPlaceholder
            label="Service-Worker-Status"
            note="Im Browser über navigator.serviceWorker.controller ermitteln (Update-Channel anzeigen)."
          />
        </Card>
      </Section>

      <Section header="Wartung">
        <Card padded={false}>
          <BackendPlaceholder
            label="Wartungsmodus"
            note="Endpoint folgt: PUT /api/v1/system/maintenance (sperrt schreibende API-Routen)."
          />
        </Card>
      </Section>
    </>
  );
}
