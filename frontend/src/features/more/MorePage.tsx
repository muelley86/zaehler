import {
  Gauge,
  KeyRound,
  LogOut,
  MapPin,
  ScrollText,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthProvider';
import { LargeTitle, Row, RowGroup, Section } from '@/components/ui';

export function MorePage() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = me?.role === 'admin';

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="space-y-5">
      <LargeTitle title="Mehr" subtitle={`Angemeldet als ${me?.username ?? ''}`} />

      <div className="px-4 space-y-5">
        {isAdmin ? (
          <Section header="Verwaltung">
            <RowGroup>
              <Row to="/messstellen" icon={<Gauge size={20} />} label="Messstellen" />
              <Row to="/standorte" icon={<MapPin size={20} />} label="Standorte" />
              <Row to="/benutzer" icon={<Users size={20} />} label="Benutzer" />
              <Row to="/audit" icon={<ScrollText size={20} />} label="Audit-Log" />
            </RowGroup>
          </Section>
        ) : null}

        <Section header="Account">
          <RowGroup>
            <Row
              to="/passwort-aendern"
              icon={<KeyRound size={20} />}
              label="Passwort ändern"
            />
            <Row
              onClick={() => void handleLogout()}
              icon={<LogOut size={20} />}
              label="Abmelden"
              destructive
            />
          </RowGroup>
        </Section>

        <div className="px-4 text-center text-ios-caption text-ios-tertiary">
          Zählerstand · self-hosted
        </div>
      </div>
    </div>
  );
}
