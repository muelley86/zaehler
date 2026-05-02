import { useState } from 'react';
import type { FormEvent } from 'react';
import { Gauge } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button, Card, TextField } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError } from '@/lib/api';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await login(username, password);
      navigate(next.force_password_change ? '/passwort-aendern' : '/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Login fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-bg p-4 pt-safe-top">
      <PageGlows accent="electricity" />
      <Card className="relative z-10 w-full max-w-sm" padded={false}>
        <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-card bg-gradient-primary text-white shadow-glow-primary">
            <Gauge size={28} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-title-1 tracking-tight text-label">Zählerstand</div>
            <div className="mt-1 text-body text-secondary">Anmelden</div>
          </div>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 pb-6 pt-4">
          <TextField
            label="Benutzername"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <TextField
            label="Passwort"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            error={error}
          />
          <Button type="submit" variant="filled" size="lg" fullWidth disabled={busy}>
            {busy ? 'Anmelden…' : 'Anmelden'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
