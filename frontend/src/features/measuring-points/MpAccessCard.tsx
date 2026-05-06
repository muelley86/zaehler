/**
 * MpAccessCard — Read-Only-Liste der User mit Zugriff auf eine MP.
 *
 * Auf der Messstellen-Detailseite (admin-only). Admins erscheinen mit
 * source="admin" (impliziter Vollzugriff), explizit zugewiesene Recorder
 * mit source="grant".
 *
 * Editiert wird der Zugriff weiterhin User-zentriert über
 * :file:`features/admin/UserAccessSheet.tsx` — diese Card liefert nur
 * den Lese-Überblick, damit der Admin auf der MP-Seite sieht, wer das
 * sehen kann, ohne in die User-Verwaltung wechseln zu müssen.
 */

import { useEffect, useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';

import { Card } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MpAccessUserRead } from '@/lib/types';

interface MpAccessCardProps {
  mpId: number;
}

export function MpAccessCard({ mpId }: MpAccessCardProps) {
  const [users, setUsers] = useState<MpAccessUserRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MpAccessUserRead[]>(`/measuring-points/${mpId}/users`)
      .then((rows) => {
        if (!cancelled) setUsers(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        else setError('Konnte Zugriffsliste nicht laden.');
      });
    return () => {
      cancelled = true;
    };
  }, [mpId]);

  if (error) {
    return (
      <Card>
        <div className="text-caption-bold uppercase text-tertiary">Zugriff</div>
        <div className="border-danger/40 bg-danger/10 mt-3 rounded-card border-hairline p-3 text-caption text-danger">
          {error}
        </div>
      </Card>
    );
  }

  if (users === null) {
    return (
      <Card>
        <div className="text-caption-bold uppercase text-tertiary">Zugriff</div>
        <div className="mt-3 text-body-sm text-tertiary">Lade…</div>
      </Card>
    );
  }

  const admins = users.filter((u) => u.source === 'admin');
  const recorders = users.filter((u) => u.source === 'grant');

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-caption-bold uppercase text-tertiary">Zugriff</div>
        <div className="inline-flex items-center gap-1.5 text-caption text-tertiary">
          <Users size={14} />
          <span>{users.length}</span>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-body-sm">
        <div>
          <div className="mb-1 text-caption text-tertiary">Admins (impliziter Zugriff)</div>
          {admins.length === 0 ? (
            <div className="text-caption italic text-quaternary">keine</div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {admins.map((u) => (
                <li
                  key={u.user_id}
                  className="inline-flex items-center gap-1 rounded-pill bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-deep"
                >
                  <ShieldCheck size={12} />
                  {u.username}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1 text-caption text-tertiary">Recorder (zugewiesen)</div>
          {recorders.length === 0 ? (
            <div className="text-caption italic text-quaternary">
              Niemand zugewiesen — Zugriff in der Benutzer-Verwaltung vergeben.
            </div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {recorders.map((u) => (
                <li
                  key={u.user_id}
                  className="inline-flex items-center gap-1 rounded-pill border-hairline border-border bg-fill px-2 py-0.5 text-caption font-semibold text-label"
                >
                  {u.username}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
