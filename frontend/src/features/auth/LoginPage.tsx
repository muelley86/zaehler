import { useState } from 'react';
import type { FormEvent } from 'react';
import { Gauge, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button, Card, TextField } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError } from '@/lib/api';
import { useAuth } from './auth-context';

type Step = 'credentials' | 'totp';

export function LoginPage() {
  const { me, login, verifyTotp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<Step>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmitCredentials(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(username, password);
      if (result.kind === 'totp') {
        setChallengeToken(result.challengeToken);
        setCode('');
        setStep('totp');
      } else {
        navigate(result.me.force_password_change ? '/passwort-aendern' : '/', {
          replace: true,
        });
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Login fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitTotp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!challengeToken) return;
    setBusy(true);
    setError(null);
    try {
      const next = await verifyTotp(challengeToken, code);
      navigate(next.force_password_change ? '/passwort-aendern' : '/', {
        replace: true,
      });
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Code abgelehnt.');
    } finally {
      setBusy(false);
    }
  }

  function backToCredentials() {
    setStep('credentials');
    setChallengeToken(null);
    setCode('');
    setError(null);
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-bg p-4 pt-safe-top">
      <PageGlows accent="electricity" />
      <Card className="relative z-10 w-full max-w-sm" padded={false}>
        <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-8 text-center">
          <div className="bg-gradient-primary shadow-glow-primary flex h-14 w-14 items-center justify-center rounded-card text-white">
            {step === 'credentials' ? (
              <Gauge size={28} strokeWidth={2.5} />
            ) : (
              <ShieldCheck size={26} strokeWidth={2.5} />
            )}
          </div>
          <div>
            <div className="text-title-1 tracking-tight text-label">Zählerstand</div>
            <div className="mt-1 text-body text-secondary">
              {step === 'credentials' ? 'Anmelden' : 'Sicherheitscode'}
            </div>
          </div>
        </div>

        {step === 'credentials' ? (
          <form
            onSubmit={(e) => void handleSubmitCredentials(e)}
            className="space-y-4 px-6 pb-6 pt-4"
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
        ) : (
          <form onSubmit={(e) => void handleSubmitTotp(e)} className="space-y-4 px-6 pb-6 pt-4">
            <div className="text-body-sm text-secondary">
              Gib den 6-stelligen Code aus deiner Authenticator-App ein. Alternativ funktioniert
              auch ein 16-stelliger Backup-Code.
            </div>
            <TextField
              label="Code"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              numeric
              error={error}
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="button" variant="bordered" onClick={backToCredentials} disabled={busy}>
                Zurück
              </Button>
              <Button type="submit" variant="filled" size="lg" fullWidth disabled={busy}>
                {busy ? 'Prüfe…' : 'Bestätigen'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
