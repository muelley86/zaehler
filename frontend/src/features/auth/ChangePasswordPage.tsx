import { useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, LargeTitle, TextField } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { useAuth } from './auth-context';

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

  // Force-change-Modus: kein AppShell drum, zentrierte Karte mit Glows.
  if (me?.force_password_change) {
    return (
      <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-bg p-4 pt-safe-top">
        <PageGlows accent="electricity" />
        <Card className="relative z-10 w-full max-w-sm" padded={false}>
          <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-8 text-center">
            <div className="bg-gradient-primary shadow-glow-primary flex h-14 w-14 items-center justify-center rounded-card text-white">
              <KeyRound size={26} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-title-2 tracking-tight text-label">Passwort setzen</div>
              <div className="mt-1 text-body text-secondary">
                Beim ersten Login ist das erforderlich.
              </div>
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
    <div className="space-y-5 p-4 md:p-6">
      <LargeTitle title="Passwort ändern" />
      <div className="max-w-md">
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
    <form onSubmit={onSubmit} className="space-y-4 px-6 pb-6 pt-4">
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
