/**
 * Statistiken — Admin-Sub-Page fuer aggregierte Sichten ueber den
 * Datenbestand.
 *
 * Status PR 4: Skelett. Aggregations-Endpoints existieren noch nicht; die
 * Karten zeigen ``BackendPlaceholder`` mit Hinweisen auf die geplanten
 * Endpoints.
 */

import { Card, LargeTitle, Section } from '@/components/ui';

import { BackendPlaceholder } from '../_placeholders';

export function StatisticsAdminPage() {
  return (
    <>
      <LargeTitle title="Statistiken" subtitle="Erfassungs-Aktivität und Datenstand" />

      <Section header="Erfassung">
        <Card padded={false}>
          <BackendPlaceholder
            label="Erfassungs-Aktivität pro User"
            note="Endpoint folgt: GET /api/v1/statistics/recording-activity (Readings pro User, letzte 30 Tage)."
          />
          <BackendPlaceholder
            label="Messstellen ohne aktuelle Erfassung"
            note="Endpoint folgt: GET /api/v1/statistics/measuring-points-without-recent-reading (last_reading_at >= X)."
          />
        </Card>
      </Section>

      <Section header="Datenstand">
        <Card padded={false}>
          <BackendPlaceholder
            label="Messstellen pro Standort"
            note="Endpoint folgt: GET /api/v1/statistics/by-location (Counts gruppiert nach location_id)."
          />
          <BackendPlaceholder
            label="Verbrauch pro Periode"
            note="Bestehender /measuring-points/{id}/consumption pro MP — Aggregation über alle MPs noch nicht."
          />
        </Card>
      </Section>
    </>
  );
}
