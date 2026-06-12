/**
 * Detail-Seite einer verrechneten (virtuellen) Messstelle.
 *
 * Zweck: Auditierbarkeit der Verrechnung — zeigt für einen wählbaren
 * Datumsbereich, welche Komponenten-Werte (+/−, Bezug/Einspeisung) in die
 * Netto-Summe eingingen. Sichtbar für alle eingeloggten Nutzer; Recorder
 * ohne Zugriff auf ALLE Komponenten-MPs bekommen vom Backend 404
 * (No-Leak-Policy) und sehen hier die Fehlerbox.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { EmptyState, LargeTitle, Section } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, api } from '@/lib/api';
import { formatDe } from '@/lib/format';
import { TYPE_LABELS } from '@/lib/meterLabels';
import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import type { VirtualMeasuringPointRead, VirtualMpBreakdownResponse } from '@/lib/types';

export function VirtualPointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const vmpId = id ? Number(id) : NaN;

  const [vmp, setVmp] = useState<VirtualMeasuringPointRead | null>(null);
  const [breakdown, setBreakdown] = useState<VirtualMpBreakdownResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Datumsbereich: startet auf dem globalen Bereich der Navigation, ist aber
  // lokal editierbar — die Werte müssen exakt zum gewählten Zeitraum passen.
  const { dateRange } = useFilterPrefs();
  const [from, setFrom] = useState(dateRange.from);
  const [to, setTo] = useState(dateRange.to);

  useEffect(() => {
    if (!Number.isFinite(vmpId)) {
      navigate('/', { replace: true });
      return;
    }
    setError(null);
    api
      .get<VirtualMeasuringPointRead>(`/virtual-measuring-points/${vmpId}`)
      .then(setVmp)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        else setError('Konnte verrechnete Messstelle nicht laden.');
      });
  }, [vmpId, navigate]);

  // Breakdown hängt am Datumsbereich und lädt bei jeder Änderung neu. Ein
  // `cancelled`-Flag verwirft veraltete Antworten bei schnellem Umstellen.
  useEffect(() => {
    if (!Number.isFinite(vmpId)) return;
    // Fehler aus dem vorherigen Request-Zyklus nicht stehen lassen — sonst
    // klebt die Fehlerbox neben frisch geladenen Daten.
    setError(null);
    let cancelled = false;
    const p = new URLSearchParams();
    if (from) p.set('from_at', from);
    if (to) p.set('to_at', to);
    const qs = p.toString();
    api
      .get<VirtualMpBreakdownResponse>(
        `/virtual-measuring-points/${vmpId}/breakdown${qs ? `?${qs}` : ''}`,
      )
      .then((data) => {
        if (!cancelled) setBreakdown(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        else setError('Konnte Aufschlüsselung nicht laden.');
      });
    return () => {
      cancelled = true;
    };
  }, [vmpId, from, to]);

  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 space-y-5 p-4 pb-12 md:p-7">
        <BackLink />

        {error ? (
          <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
            {error}
          </div>
        ) : null}

        {vmp ? (
          <>
            <LargeTitle title={`${vmp.name} (verrechnet)`} />
            <p className="text-body-sm text-secondary">
              {TYPE_LABELS[vmp.type]}
              {vmp.note ? ` · ${vmp.note}` : ''}
            </p>
          </>
        ) : !error ? (
          <div className="text-tertiary">Lade…</div>
        ) : null}

        <Section header="Zeitraum">
          <div className="flex flex-wrap gap-3 p-3">
            <label className="text-caption text-tertiary">
              Von
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="ml-2 rounded-lg border-hairline border-border bg-fill px-2 py-1 text-label"
              />
            </label>
            <label className="text-caption text-tertiary">
              Bis
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="ml-2 rounded-lg border-hairline border-border bg-fill px-2 py-1 text-label"
              />
            </label>
          </div>
        </Section>

        <Section header="Komponenten-Werte">
          {breakdown && vmp ? (
            breakdown.components.length === 0 ? (
              <EmptyState
                title="Keine Komponenten"
                description="Diese Verrechnung hat keine Komponenten."
              />
            ) : (
              <div className="overflow-x-auto p-1">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-caption text-tertiary">
                      <th scope="col" className="w-6 p-2" aria-label="Vorzeichen" />
                      <th scope="col" className="p-2 font-medium">
                        Messstelle
                      </th>
                      {vmp.type === 'electricity' ? (
                        <th scope="col" className="p-2 font-medium">
                          Richtung
                        </th>
                      ) : null}
                      <th scope="col" className="p-2 text-right font-medium">
                        Wert
                      </th>
                      <th scope="col" className="p-2 text-right font-medium">
                        Beitrag
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Key inkl. unit: das Backend liefert defensiv eine Zeile je
                        (Komponente, Einheit) — bei gemischten Einheiten (Wärme)
                        kann dieselbe component_id mehrfach vorkommen. */}
                    {breakdown.components.map((c) => (
                      <tr key={`${c.component_id}-${c.unit}`} className="border-border/50 border-b">
                        <td
                          className={`num p-2 text-center font-semibold ${
                            c.sign < 0 ? 'text-danger' : 'text-primary'
                          }`}
                        >
                          {c.sign < 0 ? '−' : '+'}
                        </td>
                        <td className="p-2 text-label">{c.measuring_point_name}</td>
                        {vmp.type === 'electricity' ? (
                          <td className="p-2 text-secondary">
                            {c.direction === 'einspeisung' ? 'Einspeisung' : 'Bezug'}
                          </td>
                        ) : null}
                        <td className="p-2 text-right tabular-nums text-label">
                          {formatDe(c.consumption)} {c.unit}
                        </td>
                        <td
                          className={`p-2 text-right tabular-nums ${
                            Number(c.contribution) < 0 ? 'text-danger' : 'text-label'
                          }`}
                        >
                          {formatDe(c.contribution)} {c.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {breakdown.totals.map((t) => (
                      <tr key={t.unit} className="border-t border-border">
                        <td className="p-2" />
                        <td
                          className="p-2 font-semibold text-label"
                          colSpan={vmp.type === 'electricity' ? 3 : 2}
                        >
                          Netto
                        </td>
                        <td
                          className={`p-2 text-right font-semibold tabular-nums ${
                            Number(t.net) < 0 ? 'text-danger' : 'text-label'
                          }`}
                        >
                          {formatDe(t.net)} {t.unit}
                        </td>
                      </tr>
                    ))}
                  </tfoot>
                </table>
              </div>
            )
          ) : !error ? (
            <div className="p-3 text-tertiary">Lade…</div>
          ) : null}
        </Section>
      </div>
    </div>
  );
}

/**
 * Zurück zur Übersicht der verrechneten Messstellen — die liegt im
 * Admin-Bereich. Recorder (sehen die Detail-Seite bei Vollzugriff ebenfalls)
 * landen stattdessen auf den Auswertungen, sonst wäre der Link eine Sackgasse.
 */
function BackLink() {
  const { me } = useAuth();
  const isAdmin = me?.role === 'admin';
  return (
    <Link
      to={isAdmin ? '/admin/verrechnung' : '/auswertungen'}
      className="inline-flex items-center gap-1 text-caption font-semibold text-primary-deep transition-colors hover:text-primary"
    >
      <ArrowLeft size={14} />
      {isAdmin ? 'Verrechnete Messstellen' : 'Auswertungen'}
    </Link>
  );
}
