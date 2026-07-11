/**
 * Ausstehende Synchronisierung (/sync): zeigt die Offline-Warteschlange des
 * angemeldeten Users, erlaubt manuelles Synchronisieren und löst Konflikte
 * (Plausibilitätswarnung, Duplikat, Foto-Fehler) per Detail-Sheet auf.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';

import { Button, EmptyState, LargeTitle, Section, Sheet } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { useAuth } from '@/features/auth/auth-context';
import { formatDateTimeDe, formatDe } from '@/lib/format';
import type { OutboxReading, OutboxStatus } from '@/lib/offline/db';
import {
  acknowledgeConflict,
  completeWithoutPhotos,
  discardItem,
  listItems,
  retryPhotos,
  subscribeOutbox,
} from '@/lib/offline/outbox';
import { useOnlineStatus } from './offline-context';

const STATUS_LABELS: Record<OutboxStatus, string> = {
  pending: 'Wartet',
  photos_pending: 'Foto ausstehend',
  conflict_warning: 'Konflikt',
  conflict_duplicate: 'Duplikat',
  photo_error: 'Foto-Fehler',
  error: 'Fehler',
};

const WARNING_STATUSES: readonly OutboxStatus[] = [
  'conflict_warning',
  'conflict_duplicate',
  'photo_error',
  'error',
];

function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 p-4 md:p-7">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: OutboxStatus }) {
  const isWarning = WARNING_STATUSES.includes(status);
  return (
    <span
      className={
        isWarning
          ? 'border-warning/40 bg-warning/10 rounded-pill border-hairline px-2 py-0.5 text-caption font-semibold text-secondary'
          : 'rounded-pill border-hairline border-border bg-fill px-2 py-0.5 text-caption text-secondary'
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Wert + Zeitpunkt aus dem Server-Problem (previous bzw. existing). */
function serverComparison(item: OutboxReading): { label: string; value: string } | null {
  const problem = item.problem;
  if (!problem) return null;
  if (item.status === 'conflict_warning') {
    const previous = problem['previous'] as { value?: string; reading_at?: string } | undefined;
    const next = problem['next'] as { value?: string; reading_at?: string } | undefined;
    const neighbor = previous ?? next;
    if (neighbor?.value !== undefined) {
      return {
        label: previous ? 'Letzter Serverstand' : 'Nächster Serverstand',
        value: `${formatDe(neighbor.value)} ${item.registerUnit}`,
      };
    }
  }
  if (item.status === 'conflict_duplicate') {
    const existing = problem['existing'] as { value?: string } | undefined;
    if (existing?.value !== undefined) {
      return {
        label: 'Bereits gespeicherter Wert',
        value: `${formatDe(existing.value)} ${item.registerUnit}`,
      };
    }
  }
  return null;
}

export function PendingSyncPage() {
  const { me } = useAuth();
  const { isOnline, syncPhase, lastSyncAt, runSyncNow } = useOnlineStatus();
  const [items, setItems] = useState<OutboxReading[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!me) return;
    void listItems(me.id)
      .then(setItems)
      .catch(() => setItems([]));
  }, [me]);

  useEffect(() => {
    reload();
    return subscribeOutbox(reload);
  }, [reload]);

  const detail = items?.find((item) => item.id === detailId) ?? null;
  const closeDetail = () => setDetailId(null);

  async function handleAcknowledge(item: OutboxReading) {
    await acknowledgeConflict(item.id);
    closeDetail();
    runSyncNow();
  }

  async function handleDiscard(item: OutboxReading) {
    if (!window.confirm('Diesen Eintrag endgültig verwerfen?')) return;
    await discardItem(item.id);
    closeDetail();
  }

  async function handleRetryPhotos(item: OutboxReading) {
    await retryPhotos(item.id);
    closeDetail();
    runSyncNow();
  }

  async function handleWithoutPhotos(item: OutboxReading) {
    await completeWithoutPhotos(item.id);
    closeDetail();
  }

  const syncing = syncPhase === 'syncing';

  return (
    <PageContainer>
      <LargeTitle
        title="Synchronisierung"
        trailing={
          <Button
            variant="tinted"
            size="sm"
            leftIcon={<RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />}
            onClick={runSyncNow}
            disabled={!isOnline || syncing}
          >
            {syncing ? 'Läuft…' : 'Jetzt synchronisieren'}
          </Button>
        }
      />

      <div className="px-1 pb-3 text-caption text-tertiary">
        {!isOnline
          ? 'Offline — Einträge werden synchronisiert, sobald der Server erreichbar ist.'
          : lastSyncAt
            ? `Zuletzt synchronisiert: ${formatDateTimeDe(lastSyncAt.toISOString())}`
            : null}
      </div>

      {items === null ? (
        <div className="text-tertiary">Lade…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={32} />}
          title="Alles synchronisiert"
          description="Es warten keine offline erfassten Einträge."
        />
      ) : (
        <Section header={`Ausstehend (${items.length})`}>
          <div className="divide-y divide-separator">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDetailId(item.id)}
                className="hover:bg-fill/40 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                data-testid="pending-sync-item"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-medium text-label">
                    {item.mpName} · {item.registerLabel}
                  </div>
                  <div className="text-caption text-tertiary">
                    {formatDateTimeDe(item.readingAt)}
                  </div>
                </div>
                <div className="num shrink-0 text-body text-secondary">
                  {formatDe(item.value)} {item.registerUnit}
                </div>
                <StatusPill status={item.status} />
              </button>
            ))}
          </div>
        </Section>
      )}

      <Sheet open={detail !== null} onClose={closeDetail} title="Eintrag">
        {detail ? (
          <div className="space-y-4 p-5">
            <div>
              <div className="text-headline text-label">
                {detail.mpName} · {detail.registerLabel} ({detail.obisCode})
              </div>
              <div className="mt-1 text-caption text-tertiary">
                Erfasst {formatDateTimeDe(detail.createdAt)} für{' '}
                {formatDateTimeDe(detail.readingAt)}
              </div>
            </div>

            <div className="bg-fill/40 rounded-card border-hairline border-border p-3">
              <div className="text-caption text-tertiary">Eigener Wert</div>
              <div className="num text-title-3 text-label">
                {formatDe(detail.value)} {detail.registerUnit}
              </div>
              {(() => {
                const cmp = serverComparison(detail);
                return cmp ? (
                  <div className="mt-2 border-t-hairline border-separator pt-2">
                    <div className="text-caption text-tertiary">{cmp.label}</div>
                    <div className="num text-body font-semibold text-label">{cmp.value}</div>
                  </div>
                ) : null;
              })()}
              {detail.note ? (
                <div className="mt-2 text-caption text-secondary">Notiz: {detail.note}</div>
              ) : null}
            </div>

            {detail.status === 'conflict_warning' && detail.problem ? (
              <div className="border-warning/40 bg-warning/10 rounded-card border-hairline p-3 text-caption text-secondary">
                {String(detail.problem.detail ?? detail.problem.title)}
              </div>
            ) : null}
            {detail.status === 'conflict_duplicate' ? (
              <div className="border-warning/40 bg-warning/10 rounded-card border-hairline p-3 text-caption text-secondary">
                Für dieses Register und diesen Zeitpunkt existiert bereits ein Eintrag mit
                abweichendem Wert. Der Servereintrag bleibt bestehen — dieser Eintrag kann nur
                verworfen werden.
              </div>
            ) : null}
            {(detail.status === 'photo_error' || detail.status === 'error') && detail.lastError ? (
              <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
                {detail.lastError}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              {detail.status === 'conflict_warning' ? (
                <Button variant="filled" onClick={() => void handleAcknowledge(detail)}>
                  Trotzdem speichern
                </Button>
              ) : null}
              {detail.status === 'photo_error' ? (
                <>
                  <Button variant="filled" onClick={() => void handleRetryPhotos(detail)}>
                    Foto erneut versuchen
                  </Button>
                  <Button variant="bordered" onClick={() => void handleWithoutPhotos(detail)}>
                    Ohne Foto abschließen
                  </Button>
                </>
              ) : null}
              {detail.status !== 'photo_error' ? (
                <Button variant="bordered" onClick={() => void handleDiscard(detail)}>
                  Verwerfen
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>
    </PageContainer>
  );
}
