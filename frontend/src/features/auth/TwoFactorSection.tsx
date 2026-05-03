/**
 * 2FA-Sektion für die MorePage. Drei Zustände:
 *
 * 1. **Aus** — Button "2FA aktivieren" → öffnet Setup-Sheet (QR + Code-Verify).
 * 2. **An** — zeigt Status, "Backup-Codes neu generieren" und "Deaktivieren".
 * 3. **Setup-Sheet** — QR-Code, Secret, Eingabe-Feld, danach Backup-Codes.
 *
 * Alle Operationen rufen die /auth/2fa/*-Endpoints. AuthProvider.refresh()
 * wird nach Status-Änderungen aufgerufen, damit das `me`-State auf
 * `totp_enabled` reagiert.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Copy, Printer, ShieldAlert, ShieldCheck } from 'lucide-react';

import { Button, Row, RowGroup, Section, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/features/auth/auth-context';
import type { BackupCodesResponse, Me, TotpSetupResponse, TotpStatusResponse } from '@/lib/types';

type SheetMode =
  | { kind: 'closed' }
  | { kind: 'setup'; data: TotpSetupResponse; code: string; busy: boolean; error: string | null }
  | { kind: 'codes'; codes: string[] }
  | {
      kind: 'disable';
      currentPassword: string;
      code: string;
      busy: boolean;
      error: string | null;
    };

export function TwoFactorSection() {
  const { me, refresh } = useAuth();
  const [status, setStatus] = useState<TotpStatusResponse | null>(null);
  const [sheet, setSheet] = useState<SheetMode>({ kind: 'closed' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TotpStatusResponse>('/auth/2fa/status')
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [me?.totp_enabled]);

  async function startSetup() {
    setError(null);
    try {
      const data = await api.post<TotpSetupResponse>('/auth/2fa/setup');
      setSheet({ kind: 'setup', data, code: '', busy: false, error: null });
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Setup fehlgeschlagen.');
    }
  }

  async function regenerateCodes() {
    if (!window.confirm('Alte Backup-Codes werden ungültig. Fortfahren?')) return;
    try {
      const data = await api.post<BackupCodesResponse>('/auth/2fa/backup-codes/regenerate');
      setSheet({ kind: 'codes', codes: data.backup_codes });
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
    }
  }

  function startDisable() {
    setSheet({ kind: 'disable', currentPassword: '', code: '', busy: false, error: null });
  }

  return (
    <Section header="Zwei-Faktor-Authentisierung">
      {error ? <div className="px-5 py-3 text-caption text-danger">{error}</div> : null}
      {me?.totp_enabled ? (
        <RowGroup>
          <Row
            icon={<ShieldCheck size={20} />}
            label="Aktiviert"
            sublabel={status ? `${status.backup_codes_remaining} Backup-Codes übrig` : '—'}
          />
          <Row
            onClick={() => void regenerateCodes()}
            label="Backup-Codes neu generieren"
            sublabel="Alte werden sofort ungültig"
          />
          <Row onClick={startDisable} label="2FA deaktivieren" destructive />
        </RowGroup>
      ) : (
        <RowGroup>
          <Row
            icon={<ShieldAlert size={20} />}
            label="Inaktiv"
            sublabel="Empfohlen, falls die App von außen erreichbar ist"
          />
          <Row onClick={() => void startSetup()} label="2FA jetzt einrichten" />
        </RowGroup>
      )}

      {sheet.kind === 'setup' ? (
        <SetupSheet
          data={sheet.data}
          onClose={() => setSheet({ kind: 'closed' })}
          onActivated={(codes) => {
            void refresh();
            setSheet({ kind: 'codes', codes });
          }}
        />
      ) : null}

      {sheet.kind === 'codes' ? (
        <BackupCodesSheet codes={sheet.codes} onClose={() => setSheet({ kind: 'closed' })} />
      ) : null}

      {sheet.kind === 'disable' && me ? (
        <DisableSheet
          me={me}
          onClose={() => setSheet({ kind: 'closed' })}
          onDisabled={() => {
            void refresh();
            setSheet({ kind: 'closed' });
          }}
        />
      ) : null}
    </Section>
  );
}

function SetupSheet({
  data,
  onClose,
  onActivated,
}: {
  data: TotpSetupResponse;
  onClose: () => void;
  onActivated: (codes: string[]) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function activate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ backup_codes: string[] }>('/auth/2fa/activate', {
        code: code.trim(),
      });
      onActivated(res.backup_codes);
    } catch (e) {
      if (e instanceof ApiError) setErr(e.problem.detail ?? e.problem.title);
      else setErr('Code abgelehnt.');
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    void navigator.clipboard?.writeText(data.secret);
  }

  return (
    <Sheet open onClose={onClose} title="2FA einrichten">
      <form onSubmit={(e) => void activate(e)} className="space-y-4">
        <div className="text-body-sm text-secondary">
          Scanne den QR-Code mit einer Authenticator-App (Google Authenticator, Authy, 1Password,
          Bitwarden, …). Wenn das nicht geht, gib das Geheimnis manuell ein.
        </div>
        <div className="flex justify-center">
          <div className="rounded-card border-hairline border-border bg-white p-3 shadow-glass">
            <img
              src={`data:image/png;base64,${data.qr_png_base64}`}
              alt="2FA QR-Code"
              className="block h-44 w-44"
            />
          </div>
        </div>
        <div className="rounded-card border-hairline border-border bg-fill p-3">
          <div className="text-caption-bold uppercase text-tertiary">Secret manuell</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="num flex-1 break-all text-body-sm text-label">{data.secret}</code>
            <button
              type="button"
              onClick={copySecret}
              aria-label="Kopieren"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-fill-strong text-secondary transition-colors hover:text-label"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
        <TextField
          label="6-stelliger Code aus der App"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoComplete="one-time-code"
          numeric
          error={err}
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="button" variant="bordered" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" variant="filled" fullWidth disabled={busy}>
            {busy ? 'Aktiviere…' : 'Aktivieren'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function BackupCodesSheet({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const text = codes.join('\n');
  function copy() {
    void navigator.clipboard?.writeText(text);
  }
  function print() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      `<pre style="font-family: 'JetBrains Mono', monospace; font-size: 14pt;">${codes
        .map((c) => `  ${c}`)
        .join('\n')}</pre>`,
    );
    w.document.title = 'Zählerstand · Backup-Codes';
    w.print();
  }
  return (
    <Sheet open onClose={onClose} title="Backup-Codes">
      <div className="space-y-4">
        <div
          className="border-warning rounded-card border-hairline bg-fill p-3 text-caption text-secondary"
          style={{ borderColor: 'var(--gas)' }}
        >
          <strong className="text-label">Diese Codes werden nur jetzt angezeigt.</strong> Drucke sie
          aus oder lege sie an einem sicheren Ort ab. Jeder Code funktioniert nur einmal als Ersatz
          für einen Authenticator-Code.
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {codes.map((c) => (
            <li
              key={c}
              className="num rounded-pill border-hairline border-border bg-surface-solid px-3 py-2 text-center text-body text-label"
            >
              {c}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="bordered"
            leftIcon={<Copy size={14} />}
            onClick={copy}
            fullWidth
          >
            Kopieren
          </Button>
          <Button
            type="button"
            variant="bordered"
            leftIcon={<Printer size={14} />}
            onClick={print}
            fullWidth
          >
            Drucken
          </Button>
        </div>
        <Button type="button" variant="filled" fullWidth onClick={onClose}>
          Codes gespeichert — schließen
        </Button>
      </div>
    </Sheet>
  );
}

function DisableSheet({
  me,
  onClose,
  onDisabled,
}: {
  me: Me;
  onClose: () => void;
  onDisabled: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function disable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post('/auth/2fa/disable', {
        current_password: currentPassword,
        code: me.totp_enabled ? code.trim() : undefined,
      });
      onDisabled();
    } catch (e) {
      if (e instanceof ApiError) setErr(e.problem.detail ?? e.problem.title);
      else setErr('Deaktivierung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="2FA deaktivieren">
      <form onSubmit={(e) => void disable(e)} className="space-y-4">
        <div className="text-body-sm text-secondary">
          Zur Bestätigung: aktuelles Passwort und ein gültiger 2FA-Code (oder Backup-Code).
        </div>
        <TextField
          label="Aktuelles Passwort"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <TextField
          label="2FA-Code oder Backup-Code"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          numeric
          error={err}
        />
        <div className="flex gap-2">
          <Button type="button" variant="bordered" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" variant="destructive" fullWidth disabled={busy}>
            {busy ? 'Deaktiviere…' : '2FA deaktivieren'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
