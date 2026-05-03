import { Gauge, KeyRound, LogOut, MapPin, Moon, ScrollText, Sun, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthProvider';
import { TwoFactorSection } from '@/features/auth/TwoFactorSection';
import { Card, LargeTitle, Row, RowGroup, Section } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { cx } from '@/components/ui/cx';

type ThemeChoice = 'system' | 'light' | 'dark';

function getStoredTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem('theme');
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  let dark = false;
  if (choice === 'dark') dark = true;
  else if (choice === 'light') dark = false;
  else dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  root.classList.add(dark ? 'dark' : 'light');
  try {
    if (choice === 'system') window.localStorage.removeItem('theme');
    else window.localStorage.setItem('theme', choice);
  } catch {
    /* ignore */
  }
}

export function MorePage() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = me?.role === 'admin';

  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => getStoredTheme());
  useEffect(() => applyTheme(themeChoice), [themeChoice]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const initial = (me?.username[0] ?? '?').toUpperCase();

  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 space-y-5 p-4 pb-12 md:p-7">
        <LargeTitle title="Mehr" />

        {/* Profil-Card oben */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-title-3 font-bold text-white shadow-glow-primary">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-headline tracking-tight text-label">
                {me?.username ?? '—'}
              </div>
              <div className="text-caption text-tertiary">{me?.role ?? ''}</div>
              {me?.email ? (
                <div className="truncate text-caption text-tertiary">{me.email}</div>
              ) : null}
            </div>
          </div>
        </Card>

        {/* App */}
        <Section header="App">
          <RowGroup>
            <Row
              icon={<Sun size={20} />}
              label="Erscheinungsbild"
              sublabel={
                themeChoice === 'system'
                  ? 'System folgen'
                  : themeChoice === 'light'
                    ? 'Hell'
                    : 'Dunkel'
              }
              trailing={
                <ThemeToggle value={themeChoice} onChange={setThemeChoice} />
              }
            />
          </RowGroup>
        </Section>

        {/* Daten / Verwaltung — nur Admin */}
        {isAdmin ? (
          <Section header="Daten">
            <RowGroup>
              <Row to="/messstellen" icon={<Gauge size={20} />} label="Messstellen" />
              <Row to="/standorte" icon={<MapPin size={20} />} label="Standorte" />
              <Row to="/benutzer" icon={<Users size={20} />} label="Benutzer" />
              <Row to="/audit" icon={<ScrollText size={20} />} label="Audit-Log" />
            </RowGroup>
          </Section>
        ) : null}

        {/* Konto */}
        <Section header="Konto">
          <RowGroup>
            <Row to="/passwort-aendern" icon={<KeyRound size={20} />} label="Passwort ändern" />
            <Row
              onClick={() => void handleLogout()}
              icon={<LogOut size={20} />}
              label="Abmelden"
              destructive
            />
          </RowGroup>
        </Section>

        {/* 2FA */}
        <TwoFactorSection />

        <div className="px-4 text-center text-caption text-tertiary">
          Zählerstand · self-hosted
        </div>
      </div>
    </div>
  );
}

function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemeChoice;
  onChange: (c: ThemeChoice) => void;
}) {
  return (
    <div className="flex gap-1 rounded-pill border-hairline border-border bg-fill p-1">
      <ToggleButton active={value === 'system'} onClick={() => onChange('system')} label="Auto" />
      <ToggleButton
        active={value === 'light'}
        onClick={() => onChange('light')}
        label={<Sun size={14} />}
        ariaLabel="Hell"
      />
      <ToggleButton
        active={value === 'dark'}
        onClick={() => onChange('dark')}
        label={<Moon size={14} />}
        ariaLabel="Dunkel"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cx(
        'flex h-7 min-w-7 items-center justify-center rounded-pill px-2 text-caption font-semibold transition-colors',
        active ? 'bg-surface-solid text-label shadow-glass' : 'text-tertiary hover:text-secondary',
      )}
    >
      {label}
    </button>
  );
}
