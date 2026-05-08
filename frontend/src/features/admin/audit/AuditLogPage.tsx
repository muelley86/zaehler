import { useEffect, useMemo, useState } from 'react';

import { EmptyState, LargeTitle, Section } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api } from '@/lib/api';
import { formatDateDe } from '@/lib/format';
import type { AuditLogRead } from '@/lib/types';
import { cx } from '@/components/ui/cx';

const timeFmt = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Lokaler ISO-Datumsteil (YYYY-MM-DD) eines ISO-Strings — fällt bei
 * Parse-Fehler auf die ersten 10 Zeichen des Inputs zurück. */
function localIsoDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFmt.format(d);
}

const ACTION_TONES: Record<string, string> = {
  create: 'bg-success/15 text-success',
  update: 'bg-primary-soft text-primary-deep',
  delete: 'bg-danger/15 text-danger',
  login: 'bg-fill text-secondary',
  logout: 'bg-fill text-secondary',
};

function actionTone(action: string): string {
  const lower = action.toLowerCase();
  for (const key of Object.keys(ACTION_TONES)) {
    if (lower.includes(key)) return ACTION_TONES[key]!;
  }
  return 'bg-fill text-secondary';
}

export function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AuditLogRead[]>('/audit-log')
      .then(setRows)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, []);

  const grouped = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, AuditLogRead[]>();
    for (const r of rows) {
      const day = localIsoDay(r.created_at);
      const list = map.get(day) ?? [];
      list.push(r);
      map.set(day, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  if (error) {
    return (
      <PageContainer>
        <LargeTitle title="Audit-Log" />
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      </PageContainer>
    );
  }
  if (!rows) {
    return (
      <PageContainer>
        <LargeTitle title="Audit-Log" />
        <div className="text-tertiary">Lade…</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <LargeTitle title="Audit-Log" subtitle={`${rows.length} Einträge gesamt`} />
      {rows.length === 0 ? (
        <EmptyState title="Keine Einträge" />
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, list]) => (
            <Section key={day} header={formatDateDe(day)} footer={`${list.length} Aktionen`}>
              <ul className="divide-y divide-separator">
                {list.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 text-caption font-semibold uppercase tracking-tight',
                          actionTone(r.action),
                        )}
                      >
                        {r.action}
                      </span>
                      <div className="num text-caption text-tertiary">
                        {formatLocalTime(r.created_at)}
                      </div>
                    </div>
                    <div className="mt-1.5 text-body text-label">
                      {r.entity_type}
                      {r.entity_id !== null ? (
                        <span className="num text-tertiary"> · #{r.entity_id}</span>
                      ) : null}
                      {r.user_id !== null ? (
                        <span className="num text-tertiary"> · user #{r.user_id}</span>
                      ) : null}
                    </div>
                    {r.diff ? (
                      <pre className="num bg-fill/60 mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-card border-hairline border-border p-3 text-caption text-secondary">
                        {JSON.stringify(r.diff, null, 2)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 space-y-5 p-4 pb-12 md:p-7">{children}</div>
    </div>
  );
}
