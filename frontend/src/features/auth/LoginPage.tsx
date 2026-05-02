import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button, Card, TextField } from '@/components/ui';
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
    <div className="flex min-h-full items-center justify-center bg-ios-bg p-4 pt-safe-top">
      <Card className="w-full max-w-sm" padded={false}>
        <div className="px-5 pt-6 pb-2">
          <div className="text-ios-largetitle font-rounded">Zählerstand</div>
          <div className="mt-1 text-ios-subhead text-ios-secondary">Anmelden</div>
        </div>
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4 px-5 pb-6 pt-2"
        >
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
