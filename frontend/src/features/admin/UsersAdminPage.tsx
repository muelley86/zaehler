import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound } from 'lucide-react';

import {
  Button,
  EmptyState,
  LargeTitle,
  Section,
  Select,
  Switch,
  TextField,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { UserRead, UserRole } from '@/lib/types';

export function UsersAdminPage() {
  const [users, setUsers] = useState<UserRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api
      .get<UserRead[]>('/users')
      .then(setUsers)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  return (
    <div className="space-y-5 pb-4">
      <LargeTitle title="Benutzer" />
      {error ? (
        <div className="mx-4 rounded-ios-lg bg-ios-red/15 p-3 text-ios-red">{error}</div>
      ) : null}

      <div className="space-y-5 px-4">
        <CreateUserForm onCreated={refresh} />

        {users && users.length === 0 ? (
          <EmptyState title="Noch keine Benutzer" />
        ) : (
          <Section header="Benutzer">
            <ul className="divide-y divide-ios-separator/60">
              {(users ?? []).map((u) => (
                <UserItem key={u.id} user={u} onChanged={refresh} />
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function UserItem({ user, onChanged }: { user: UserRead; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    try {
      await api.patch(`/users/${user.id}`, { is_active: !user.is_active });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const pw = window.prompt(`Neues Passwort für ${user.username} (≥ 12 Zeichen):`);
    if (!pw || pw.length < 12) return;
    setBusy(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { new_password: pw });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-ios-headline">{user.username}</span>
            <span className="rounded-full bg-ios-fill/15 px-1.5 py-0.5 text-ios-caption uppercase tracking-wide text-ios-secondary">
              {user.role}
            </span>
          </div>
          {user.email ? (
            <div className="text-ios-footnote text-ios-tertiary">{user.email}</div>
          ) : null}
          <div className="text-ios-caption text-ios-tertiary">
            Letzter Login:{' '}
            {user.last_login_at ? user.last_login_at.slice(0, 16).replace('T', ' ') : '—'}
          </div>
        </div>
        <Switch
          checked={user.is_active}
          onChange={() => void toggleActive()}
          disabled={busy}
          ariaLabel={`Aktiv: ${user.is_active}`}
        />
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          variant="plain"
          size="sm"
          leftIcon={<KeyRound size={14} />}
          onClick={() => void resetPassword()}
          disabled={busy}
        >
          Passwort zurücksetzen
        </Button>
      </div>
    </li>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('recorder');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/users', {
        username,
        email: email || null,
        role,
        initial_password: password,
      });
      setUsername('');
      setEmail('');
      setPassword('');
      setOpen(false);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Anlegen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section header="Neuer Benutzer">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center px-4 py-3 text-left text-ios-blue"
        >
          + Benutzer anlegen
        </button>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-4">
          <TextField
            label="Benutzername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <TextField
            label="E-Mail (optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select label="Rolle" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="recorder">recorder</option>
            <option value="admin">admin</option>
          </Select>
          <TextField
            label="Initial-Passwort"
            hint="mindestens 12 Zeichen"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={12}
            required
            error={error}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="filled" fullWidth disabled={busy}>
              {busy ? 'Speichere…' : 'Anlegen'}
            </Button>
            <Button type="button" variant="bordered" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
