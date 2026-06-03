/**
 * System & Backup — Admin-Sub-Page fuer Datensicherung, Versions-Info
 * und Wartung.
 *
 * Status PR 4: Skelett. Einziger funktional verdrahteter Teil ist der
 * Voll-Dump-Export, weil sein Endpoint (``GET /api/v1/export/dump.json``,
 * admin-only) bereits existiert. Alle weiteren Karten zeigen nur
 * ``BackendPlaceholder``-Hinweise auf die ausstehenden Endpoints.
 */

import { Button, Card, LargeTitle, Section } from '@/components/ui';

import { BackendPlaceholder, PlaceholderRow } from '../_placeholders';

export function SystemAdminPage() {
  return (
    <>
      <LargeTitle title="System & Backup" subtitle="Backup, Version, Wartung" />

      <Section header="Backup">
        <Card padded={false}>
          <PlaceholderRow
            title="Voll-Backup (Datenbank)"
            description="Lädt einen konsistenten Snapshot der SQLite-Datenbank als gzip (admin-only) — vollständig & verlustfrei (User, Eigentümer, Standorte, Lieferungen, Audit). Wiederherstellen: Datei entpacken und data/meters.db ersetzen (App gestoppt) — Details in deploy/lxc/README.md."
            action={
              <Button
                variant="filled"
                size="sm"
                onClick={() => window.open('/api/v1/export/backup.db.gz', '_blank')}
              >
                Backup laden
              </Button>
            }
          />
          <PlaceholderRow
            title="Daten-Export (JSON)"
            description="Menschenlesbarer Teil-Export der Messstellen, Zähler und Ablesungen (admin-only) — kein vollständiges Backup."
            action={
              <Button
                variant="tinted"
                size="sm"
                onClick={() => window.open('/api/v1/export/dump.json', '_blank')}
              >
                Export starten
              </Button>
            }
          />
        </Card>
      </Section>

      <Section header="Status">
        <Card padded={false}>
          <BackendPlaceholder
            label="Backup-Status"
            note="Endpoint folgt: GET /api/v1/system/backup-status (zeigt letzten Export-Zeitpunkt)."
          />
          <BackendPlaceholder
            label="App-Version"
            note="Endpoint folgt: GET /api/v1/system/version (Version + Git-SHA des Containers)."
          />
          <BackendPlaceholder
            label="Service-Worker-Status"
            note="Im Browser über navigator.serviceWorker.controller ermitteln (Update-Channel anzeigen)."
          />
        </Card>
      </Section>

      <Section header="Wartung">
        <Card padded={false}>
          <BackendPlaceholder
            label="Wartungsmodus"
            note="Endpoint folgt: PUT /api/v1/system/maintenance (sperrt schreibende API-Routen)."
          />
          <BackendPlaceholder
            label="Restore aus Dump"
            note="Endpoint folgt: POST /api/v1/system/restore (mit Sicherheitsabfrage und Audit)."
          />
        </Card>
      </Section>
    </>
  );
}
