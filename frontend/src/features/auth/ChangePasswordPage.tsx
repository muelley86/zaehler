import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, LargeTitle, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { useAuth } from './AuthProvider';

export function ChangePasswordPage() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('Bestätigung stimmt nicht überein.');
      return;
    }
    setBusy(true);
    try {
      await api.post<Me>('/auth/change-password', {
        current_password: current,
        new_password: next,
      });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Konnte Passwort nicht ändern.');
    } finally {
      setBusy(false);
    }
  }

  // Force-change-Modus: dann ist kein AppShell drum, wir zentrieren
  if (me?.force_password_change) {
    return (
      <div className="flex min-h-full items-center justify-center bg-ios-bg p-4 pt-safe-top">
        <Card className="w-full max-w-sm" padded={false}>
          <div className="px-5 pt-6 pb-2">
            <div className="text-ios-title font-rounded">Passwort setzen</div>
            <div className="mt-1 text-ios-subhead text-ios-secondary">
              Beim ersten Login ist das erforderlich.
            </div>
          </div>
          <FormBody
            current={current}
            setCurrent={setCurrent}
            next={next}
            setNext={setNext}
            confirm={confirm}
            setConfirm={setConfirm}
            error={error}
            busy={busy}
            onSubmit={(e) => void handleSubmit(e)}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <LargeTitle title="Passwort ändern" />
      <div className="px-4">
        <Card padded={false}>
          <FormBody
            current={current}
            setCurrent={setCurrent}
            next={next}
            setNext={setNext}
            confirm={confirm}
            setConfirm={setConfirm}
            error={error}
            busy={busy}
            onSubmit={(e) => void handleSubmit(e)}
          />
        </Card>
      </div>
    </div>
  );
}

function FormBody({
  current,
  setCurrent,
  next,
  setNext,
  confirm,
  setConfirm,
  error,
  busy,
  onSubmit,
}: {
  current: string;
  setCurrent: (v: string) => void;
  next: string;
  setNext: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  error: string | null;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 px-5 pb-6 pt-2">
      <TextField
        label="Aktuelles Passwort"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
      />
      <TextField
        label="Neues Passwort"
        hint="mindestens 12 Zeichen"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        minLength={12}
        required
      />
      <TextField
        label="Neues Passwort bestätigen"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        error={error}
      />
      <Button type="submit" variant="filled" size="lg" fullWidth disabled={busy}>
        {busy ? 'Speichere…' : 'Speichern'}
      </Button>
    </form>
  );
}
