/**
 * Erzwungene 2FA-Einrichtung.
 *
 * Wird vom App-Router angezeigt, solange `me.must_setup_totp` true ist
 * (Admin ohne 2FA bei aktivem `METERS_REQUIRE_TOTP_FOR_ADMIN`). Analog zur
 * erzwungenen Passwort-Änderung. Sobald 2FA aktiviert ist, ruft
 * `TwoFactorSection` `refresh()` auf → `must_setup_totp` wird false → der
 * Guard gibt die App frei.
 */

import { ShieldAlert } from 'lucide-react';

import { PageGlows } from '@/components/PageGlows';
import { TwoFactorSection } from '@/features/auth/TwoFactorSection';

export function TwoFactorSetupPage() {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 mx-auto max-w-md space-y-5 p-4 pt-safe-top md:p-7">
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <div className="bg-gradient-primary shadow-glow-primary flex h-14 w-14 items-center justify-center rounded-card text-white">
            <ShieldAlert size={26} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-title-2 tracking-tight text-label">
              Zwei-Faktor-Authentisierung erforderlich
            </div>
            <div className="mt-1 text-body text-secondary">
              Für Admin-Konten ist 2FA auf dieser Instanz verpflichtend. Richte sie jetzt ein, um
              fortzufahren.
            </div>
          </div>
        </div>
        <TwoFactorSection />
      </div>
    </div>
  );
}
