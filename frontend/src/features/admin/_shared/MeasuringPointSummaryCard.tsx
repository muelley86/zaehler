import { Link } from 'react-router-dom';

import { Card, TypeBadge } from '@/components/ui';
import { formatDateDe, formatDe } from '@/lib/format';
import { describeMeterType } from '@/lib/meterLabels';
import type { MeasuringPointWithStateRead } from '@/lib/types';

/**
 * Read-only Karte einer Messstelle inkl. aktuellem Stand je Register — genutzt
 * auf den Stammdaten-Detailseiten (Eigentümer/Lieferant/Mieter). Die ganze
 * Karte ist ein Link zur Messstellen-Detailseite. Bewusst eigenständig (nicht
 * `MPCard` aus der MP-Übersicht), weil jene eine Lösch-Aktion trägt.
 */
export function MeasuringPointSummaryCard({ item }: { item: MeasuringPointWithStateRead }) {
  const mp = item.measuring_point;
  return (
    <Card padded={false}>
      <Link
        to={`/admin/messstellen/${mp.id}`}
        className="hover:bg-fill/40 flex items-start gap-2 px-5 py-4 transition-colors"
        aria-label={`Messstelle ${mp.name} öffnen`}
      >
        <TypeBadge type={mp.type} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-headline tracking-tight text-label">{mp.name}</div>
          <div className="text-caption text-tertiary">
            {describeMeterType(mp.type, mp.heating_source)}
            {mp.location_name ? ` · ${mp.location_name}` : ''}
          </div>
          {item.registers.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {item.registers.map((reg) => (
                <li
                  key={reg.register_id}
                  className="flex items-baseline justify-between gap-2 text-caption"
                >
                  <span className="truncate text-tertiary">{reg.label}</span>
                  <span className="shrink-0 tabular-nums text-label">
                    {reg.current_value !== null
                      ? `${formatDe(reg.current_value)} ${reg.unit}`
                      : '—'}
                    {reg.last_reading_at ? (
                      <span className="text-tertiary"> · {formatDateDe(reg.last_reading_at)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-caption text-tertiary">Noch keine Ablesung</div>
          )}
        </div>
      </Link>
    </Card>
  );
}
