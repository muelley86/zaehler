import { useEffect, useState } from 'react';

import { EmptyState, LargeTitle, Section } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { AuditLogRead } from '@/lib/types';

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

  if (error) {
    return (
      <div className="space-y-5">
        <LargeTitle title="Audit-Log" />
        <div className="mx-4 rounded-ios-lg bg-ios-red/15 p-3 text-ios-red">{error}</div>
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="space-y-5">
        <LargeTitle title="Audit-Log" />
        <div className="px-4 text-ios-tertiary">Lade…</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <LargeTitle title="Audit-Log" />
      <div className="px-4">
        {rows.length === 0 ? (
          <EmptyState title="Keine Einträge" />
        ) : (
          <Section header={`${rows.length} Einträge`}>
            <ul className="divide-y divide-ios-separator/60">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-ios-headline">{r.action}</div>
                    <div className="text-ios-caption text-ios-tertiary">
                      {r.created_at.replace('T', ' ').slice(0, 19)}
                    </div>
                  </div>
                  <div className="text-ios-footnote text-ios-secondary">
                    {r.entity_type}
                    {r.entity_id !== null ? ` · #${r.entity_id}` : ''}
                    {r.user_id !== null ? ` · user #${r.user_id}` : ''}
                  </div>
                  {r.diff ? (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-ios bg-ios-elevated p-2 text-ios-caption text-ios-secondary">
                      {JSON.stringify(r.diff, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
