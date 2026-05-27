/**
 * UserEditSheet — Editor fuer Benutzer-Stammdaten (E-Mail, Rolle, Aktiv,
 * QR-Zuweisungs-Recht) plus Hard-Delete.
 *
 * Schutz-Regeln werden im Backend durchgesetzt (Self-Action,
 * Last-Active-Admin, Daten-Bezuege beim Loeschen) — das UI ergaenzt das nur
 * mit einer Disable-Logik fuer das eigene Konto, damit der Nutzer den
 * Fall gar nicht erst probiert.
 */

import { useState } from 'react';
import { Save, Trash2, X } from 'lucide-react';

import { Button, Select, Sheet, Switch, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { Me, UserRead, UserRole } from '@/lib/types';

interface UserEditSheetProps {
  user: UserRead;
  me: Me | null;
  onClose: () => void;
  onSaved: () => void;
}

interface ReferencesInfo {
  readings: number;
  deliveries: number;
  granted_accesses: number;
}

function isReferenceError(
  err: ApiError,
): err is ApiError & { problem: { references: ReferencesInfo } } {
  const refs = (err.problem as unknown as Record<string, unknown>)['references'];
  return (
    err.status === 409 &&
    typeof refs === 'object' &&
    refs !== null &&
    'readings' in refs &&
    'deliveries' in refs &&
    'granted_accesses' in refs
  );
}

export function UserEditSheet({ user, me, onClose, onSaved }: UserEditSheetProps) {
  const isSelf = me?.id === user.id;
  const [email, setEmail] = useState(user.email ?? '');
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [canAssignTokens, setCanAssignTokens] = useState(user.can_assign_qr_tokens);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildDiff(): Record<string, unknown> | null {
    const diff: Record<string, unknown> = {};
    const normalizedEmail = email.trim() || null;
    if (normalizedEmail !== user.email) diff['email'] = normalizedEmail;
    if (role !== user.role) diff['role'] = role;
    if (isActive !== user.is_active) diff['is_active'] = isActive;
    if (canAssignTokens !== user.can_assign_qr_tokens) {
      diff['can_assign_qr_tokens'] = canAssignTokens;
    }
    return Object.keys(diff).length > 0 ? diff : null;
  }

  async function save() {
    setBusy(true);
    setError(null);
    const diff = buildDiff();
    if (!diff) {
      onClose();
      setBusy(false);
      return;
    }
    try {
      await api.patch<UserRead>(`/users/${user.id}`, diff);
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Benutzer "${user.username}" wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/users/${user.id}`);
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (isReferenceError(err)) {
          const r = err.problem.references;
          setError(
            `Benutzer hat noch Datenbezuege (${r.readings} Erfassungen, ${r.deliveries} Lieferungen, ${r.granted_accesses} erteilte Zugriffe). ` +
              'Bitte stattdessen deaktivieren.',
          );
        } else {
          setError(err.problem.detail ?? err.problem.title);
        }
      } else {
        setError('Loeschen fehlgeschlagen.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Benutzer · ${user.username}`}>
      <div className="space-y-4">
        {isSelf ? (
          <div
            data-testid="user-edit-self-hint"
            className="rounded-card border-hairline border-border bg-fill p-3 text-caption text-secondary"
          >
            Du bearbeitest dein eigenes Konto. Rolle, Aktiv-Status und Loeschen sind gesperrt, damit
            du dich nicht versehentlich aussperrst.
          </div>
        ) : null}

        <TextField
          label="E-Mail (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />

        <Select
          label="Rolle"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          disabled={busy || isSelf}
          data-testid="user-edit-role-select"
        >
          <option value="recorder">recorder</option>
          <option value="admin">admin</option>
        </Select>

        <label className="flex cursor-pointer items-start gap-3 rounded-card border-hairline border-border bg-fill p-3">
          <Switch
            checked={isActive}
            onChange={() => setIsActive((v) => !v)}
            disabled={busy || isSelf}
            ariaLabel="Konto aktiv"
          />
          <div className="min-w-0 flex-1">
            <div className="text-body font-semibold text-label">Konto aktiv</div>
            <div className="text-caption text-tertiary">
              Inaktive Konten koennen sich nicht einloggen. Aktive Sessions werden beim Deaktivieren
              weiterhin terminiert.
            </div>
          </div>
        </label>

        {role === 'recorder' ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-card border-hairline border-border bg-fill p-3">
            <Switch
              checked={canAssignTokens}
              onChange={() => setCanAssignTokens((v) => !v)}
              disabled={busy}
              ariaLabel="QR-Codes zuweisen"
            />
            <div className="min-w-0 flex-1">
              <div className="text-body font-semibold text-label">QR-Codes zuweisen</div>
              <div className="text-caption text-tertiary">
                Erlaubt diesem Recorder, einen frisch geklebten QR-Sticker selbst einer
                zugaenglichen Messstelle zuzuordnen.
              </div>
            </div>
          </label>
        ) : null}

        {error ? (
          <div
            data-testid="user-edit-error"
            className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger"
          >
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="filled"
            leftIcon={<Save size={14} />}
            onClick={() => void save()}
            disabled={busy}
            fullWidth
          >
            {busy ? 'Speichere…' : 'Speichern'}
          </Button>
          <Button
            type="button"
            variant="bordered"
            leftIcon={<X size={14} />}
            onClick={onClose}
            disabled={busy}
          >
            Abbrechen
          </Button>
        </div>

        <div className="border-t-hairline border-separator pt-4">
          <Button
            type="button"
            variant="plain"
            leftIcon={<Trash2 size={14} />}
            onClick={() => void remove()}
            disabled={busy || isSelf}
            className="hover:bg-danger/10 text-danger"
            data-testid="user-edit-delete"
          >
            Benutzer loeschen
          </Button>
          <div className="mt-1 text-caption text-tertiary">
            Klappt nur, wenn der Benutzer keine Erfassungen, Lieferungen oder erteilten Zugriffe hat
            — sonst stattdessen deaktivieren.
          </div>
        </div>
      </div>
    </Sheet>
  );
}
