import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, ListChecks, Pencil, Plus } from 'lucide-react';

import { useAuth } from '@/features/auth/auth-context';
import {
  Button,
  Card,
  EmptyState,
  LargeTitle,
  Pill,
  Section,
  Select,
  Switch,
  TextField,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeDe } from '@/lib/format';
import type { Me, UserRead, UserRole } from '@/lib/types';
import { cx } from '@/components/ui/cx';

import { UserAccessSheet } from './UserAccessSheet';
import { UserEditSheet } from './UserEditSheet';

type Filter = 'all' | UserRole | 'inactive';

export function UsersAdminPage() {
  const { me } = useAuth();
  const [users, setUsers] = useState<UserRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api
      .get<UserRead[]>('/users')
      .then(setUsers)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  const counts = useMemo(() => {
    const c = { all: 0, admin: 0, recorder: 0, inactive: 0 };
    users?.forEach((u) => {
      c.all += 1;
      if (!u.is_active) c.inactive += 1;
      if (u.role === 'admin') c.admin += 1;
      if (u.role === 'recorder') c.recorder += 1;
    });
    return c;
  }, [users]);

  const visible = useMemo(() => {
    if (!users) return [];
    return users.filter((u) => {
      if (filter === 'all') return true;
      if (filter === 'inactive') return !u.is_active;
      return u.role === filter;
    });
  }, [users, filter]);

  return (
    <>
      <LargeTitle title="Benutzer" />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateUserForm onCreated={refresh} />

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill active={filter === 'all'} onClick={() => setFilter('all')}>
          Alle · {counts.all}
        </Pill>
        <Pill active={filter === 'admin'} onClick={() => setFilter('admin')}>
          Admins · {counts.admin}
        </Pill>
        <Pill active={filter === 'recorder'} onClick={() => setFilter('recorder')}>
          Erfasser · {counts.recorder}
        </Pill>
        <Pill active={filter === 'inactive'} onClick={() => setFilter('inactive')}>
          Inaktiv · {counts.inactive}
        </Pill>
      </div>

      {users && users.length === 0 ? (
        <EmptyState title="Noch keine Benutzer" />
      ) : (
        <Card padded={false}>
          {/* Desktop-Tabelle */}
          <div className="hidden md:block">
            <div className="grid grid-cols-[40px_1.4fr_1.6fr_1fr_1fr_1.1fr_120px] items-center gap-3 border-b-hairline border-separator px-5 py-3 text-micro uppercase text-tertiary">
              <div />
              <div>Benutzer</div>
              <div>E-Mail</div>
              <div>Rolle</div>
              <div>Status</div>
              <div>Letzter Login</div>
              <div />
            </div>
            <ul className="divide-y divide-separator">
              {visible.map((u) => (
                <UserRow key={u.id} user={u} me={me} onChanged={refresh} />
              ))}
            </ul>
          </div>

          {/* Mobile-Liste */}
          <ul className="divide-y divide-separator md:hidden">
            {visible.map((u) => (
              <UserListItem key={u.id} user={u} me={me} onChanged={refresh} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function UserAvatar({ user, size = 32 }: { user: UserRead; size?: number }) {
  const initial = user.username[0]?.toUpperCase() ?? '?';
  const gradient =
    user.role === 'admin'
      ? 'bg-gradient-primary'
      : 'bg-[linear-gradient(135deg,var(--electricity),var(--gas))]';
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        gradient,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initial}
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block h-2 w-2 rounded-full', active ? 'bg-success' : 'bg-quaternary')}
    />
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={cx(
        'rounded-badge px-2 py-0.5 text-caption font-semibold uppercase tracking-tight',
        role === 'admin' ? 'bg-primary-soft text-primary-deep' : 'bg-fill text-secondary',
      )}
    >
      {role}
    </span>
  );
}

function UserRow({
  user,
  me,
  onChanged,
}: {
  user: UserRead;
  me: Me | null;
  onChanged: () => void;
}) {
  const isSelf = me?.id === user.id;
  const [busy, setBusy] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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

  // Access-Editor nur für Recorder anbieten — Admin hat impliziten Vollzugriff,
  // der Backend-Endpoint lehnt den PUT ohnehin mit 422 ab.
  const showAccessButton = user.role === 'recorder' && user.is_active;

  return (
    <>
      <li
        className={cx(
          'grid grid-cols-[40px_1.4fr_1.6fr_1fr_1fr_1.1fr_120px] items-center gap-3 px-5 py-3.5',
          !user.is_active && 'opacity-60',
        )}
      >
        <UserAvatar user={user} />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-body font-semibold text-label">{user.username}</span>
            {isSelf ? (
              <span className="rounded-badge bg-primary-soft px-1.5 py-0.5 text-micro font-semibold uppercase text-primary-deep">
                Du
              </span>
            ) : null}
          </div>
          {user.force_password_change ? (
            <div className="text-caption font-semibold text-danger">
              Passwortwechsel erforderlich
            </div>
          ) : null}
        </div>
        <div
          className={cx(
            'truncate text-body-sm',
            user.email ? 'text-secondary' : 'italic text-quaternary',
          )}
        >
          {user.email ?? '—'}
        </div>
        <div>
          <RoleBadge role={user.role} />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={user.is_active}
            onChange={() => void toggleActive()}
            disabled={busy || isSelf}
            ariaLabel={`Aktiv: ${user.is_active}`}
          />
          <span className="text-body-sm text-secondary">
            {user.is_active ? 'Aktiv' : 'Inaktiv'}
          </span>
        </div>
        <div className="num text-caption text-secondary">
          {user.last_login_at ? formatDateTimeDe(user.last_login_at) : '—'}
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="plain"
            size="sm"
            leftIcon={<Pencil size={14} />}
            onClick={() => setEditOpen(true)}
            disabled={busy}
            title="Bearbeiten"
          >
            <span className="sr-only">Bearbeiten</span>
          </Button>
          {showAccessButton ? (
            <Button
              variant="plain"
              size="sm"
              leftIcon={<ListChecks size={14} />}
              onClick={() => setAccessOpen(true)}
              disabled={busy}
              title="Messstellen-Zugriff bearbeiten"
            >
              <span className="sr-only">Messstellen-Zugriff bearbeiten</span>
            </Button>
          ) : null}
          <Button
            variant="plain"
            size="sm"
            leftIcon={<KeyRound size={14} />}
            onClick={() => void resetPassword()}
            disabled={busy}
            title="Passwort zurücksetzen"
          >
            <span className="sr-only">Passwort zurücksetzen</span>
          </Button>
        </div>
      </li>
      {accessOpen ? (
        <UserAccessSheet user={user} onClose={() => setAccessOpen(false)} onSaved={onChanged} />
      ) : null}
      {editOpen ? (
        <UserEditSheet user={user} me={me} onClose={() => setEditOpen(false)} onSaved={onChanged} />
      ) : null}
    </>
  );
}

function UserListItem({
  user,
  me,
  onChanged,
}: {
  user: UserRead;
  me: Me | null;
  onChanged: () => void;
}) {
  const isSelf = me?.id === user.id;
  const [busy, setBusy] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
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
  const showAccessButton = user.role === 'recorder' && user.is_active;
  return (
    <li className={cx('px-5 py-3.5', !user.is_active && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <UserAvatar user={user} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="truncate text-body font-semibold text-label">{user.username}</span>
            <RoleBadge role={user.role} />
            {isSelf ? (
              <span className="rounded-badge bg-primary-soft px-1.5 py-0.5 text-micro font-semibold uppercase text-primary-deep">
                Du
              </span>
            ) : null}
          </div>
          {user.email ? (
            <div className="truncate text-caption text-tertiary">{user.email}</div>
          ) : null}
          <div className="num mt-0.5 flex items-center gap-2 text-caption text-tertiary">
            <StatusDot active={user.is_active} />
            <span>{user.is_active ? 'Aktiv' : 'Inaktiv'}</span>
            <span>·</span>
            <span>Login: {user.last_login_at ? formatDateTimeDe(user.last_login_at) : '—'}</span>
          </div>
          {user.force_password_change ? (
            <div className="mt-1 text-caption font-semibold text-danger">
              Passwortwechsel erforderlich
            </div>
          ) : null}
        </div>
        <Switch
          checked={user.is_active}
          onChange={() => void toggleActive()}
          disabled={busy || isSelf}
          ariaLabel={`Aktiv: ${user.is_active}`}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-1">
        <Button
          variant="plain"
          size="sm"
          leftIcon={<Pencil size={14} />}
          onClick={() => setEditOpen(true)}
          disabled={busy}
        >
          Bearbeiten
        </Button>
        {showAccessButton ? (
          <Button
            variant="plain"
            size="sm"
            leftIcon={<ListChecks size={14} />}
            onClick={() => setAccessOpen(true)}
            disabled={busy}
          >
            Messstellen
          </Button>
        ) : null}
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
      {accessOpen ? (
        <UserAccessSheet user={user} onClose={() => setAccessOpen(false)} onSaved={onChanged} />
      ) : null}
      {editOpen ? (
        <UserEditSheet user={user} me={me} onClose={() => setEditOpen(false)} onSaved={onChanged} />
      ) : null}
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
          className="hover:bg-fill/40 flex w-full items-center gap-2 px-5 py-3.5 text-left text-body font-semibold text-primary-deep transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} />
          Benutzer anlegen
        </button>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-5">
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
