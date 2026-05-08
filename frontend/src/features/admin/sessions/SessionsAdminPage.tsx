/**
 * Sessions & Sicherheit — Admin-Sub-Page fuer aktive Logins, fehl-
 * geschlagene Anmeldeversuche und 2FA-Übersicht.
 *
 * Status PR 4: Skelett. Es gibt im Backend bereits
 * ``POST /api/v1/users/{id}/sessions/revoke`` (per-User-Logout) — das
 * laesst sich integrieren, sobald der List-Endpoint fuer aktive
 * Sessions existiert.
 */

import { Card, LargeTitle, Section } from '@/components/ui';

import { BackendPlaceholder } from '../_placeholders';

export function SessionsAdminPage() {
  return (
    <>
      <LargeTitle
        title="Sessions & Sicherheit"
        subtitle="Aktive Logins, fehlgeschlagene Anmeldungen, 2FA"
      />

      <Section header="Aktive Sessions">
        <Card padded={false}>
          <BackendPlaceholder
            label="Aktive Sessions aller User"
            note="Endpoint folgt: GET /api/v1/sessions/active (User, IP, User-Agent, last_seen_at). Revoke pro Session via DELETE /api/v1/sessions/{id} oder bestehender POST /api/v1/users/{id}/sessions/revoke."
          />
        </Card>
      </Section>

      <Section header="Anmeldungen">
        <Card padded={false}>
          <BackendPlaceholder
            label="Fehlgeschlagene Logins"
            note="Endpoint folgt: GET /api/v1/sessions/failed-logins (letzte 24 h, Rate-Limit-Status)."
          />
          <BackendPlaceholder
            label="Rate-Limit-Sperren"
            note="Endpoint folgt: GET /api/v1/sessions/rate-limited (gesperrte IPs mit Restdauer)."
          />
        </Card>
      </Section>

      <Section header="Zwei-Faktor">
        <Card padded={false}>
          <BackendPlaceholder
            label="TOTP-Übersicht"
            note="Endpoint folgt: GET /api/v1/users/totp-overview (welche User haben 2FA aktiv? — Werte stehen heute pro User in /users.totp_enabled, können also lokal aggregiert werden)."
          />
        </Card>
      </Section>
    </>
  );
}
