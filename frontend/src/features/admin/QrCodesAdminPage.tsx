/**
 * QrCodesAdminPage — Admin-Verwaltung für QR-Tokens.
 *
 * Workflow im Bürobetrieb:
 *  1. "Neue QR-Codes erzeugen": Anzahl wählen, Backend liefert Token-Liste
 *     zurück, alle erscheinen sofort als "frei" in der Liste.
 *  2. "Auswahl drucken": ausgewählte Tokens werden in einem A4-Druckblatt
 *     (2×4-Raster) ausgedruckt — dort lassen sie sich abschneiden und
 *     verkleben.
 *  3. Vor Ort: Mitarbeiter klebt einen Sticker auf den Zähler, scannt mit
 *     dem Smartphone und ordnet via /erfassen?token=… der MP zu.
 *  4. Hier in der Verwaltung sieht der Admin den Status und kann bei Bedarf
 *     Tokens lösen, neu zuordnen oder löschen.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link2, Plus, Printer, Trash2, Unlink } from 'lucide-react';

import { Button, Card, EmptyState, LargeTitle, Pill, Section, TextField } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeDe } from '@/lib/format';
import type { QrTokenRead } from '@/lib/types';

import { openTokensPrintWindow } from './QrTokensPrintSheet';

type Filter = 'all' | 'assigned' | 'unassigned';

export function QrCodesAdminPage() {
  const [tokens, setTokens] = useState<QrTokenRead[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api
      .get<QrTokenRead[]>('/qr-tokens')
      .then(setTokens)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, [tick]);

  const refresh = () => {
    setSelected(new Set());
    setTick((t) => t + 1);
  };

  const visible = useMemo(() => {
    if (!tokens) return [];
    return tokens.filter((t) => {
      if (filter === 'assigned') return t.measuring_point_id !== null;
      if (filter === 'unassigned') return t.measuring_point_id === null;
      return true;
    });
  }, [tokens, filter]);

  const counts = useMemo(() => {
    const c = { all: 0, assigned: 0, unassigned: 0 };
    tokens?.forEach((t) => {
      c.all += 1;
      if (t.measuring_point_id === null) c.unassigned += 1;
      else c.assigned += 1;
    });
    return c;
  }, [tokens]);

  function toggleSelected(token: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visible.map((t) => t.token)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  function printSelected() {
    if (selected.size === 0) return;
    const list = visible.filter((t) => selected.has(t.token));
    openTokensPrintWindow(list);
  }

  return (
    <PageContainer>
      <LargeTitle title="QR-Codes" />

      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm onCreated={refresh} />

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill active={filter === 'all'} onClick={() => setFilter('all')}>
          Alle · {counts.all}
        </Pill>
        <Pill active={filter === 'assigned'} onClick={() => setFilter('assigned')}>
          Zugeordnet · {counts.assigned}
        </Pill>
        <Pill active={filter === 'unassigned'} onClick={() => setFilter('unassigned')}>
          Frei · {counts.unassigned}
        </Pill>

        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="bordered"
            size="sm"
            onClick={selected.size === visible.length ? deselectAll : selectAllVisible}
            disabled={visible.length === 0}
          >
            {selected.size === visible.length && visible.length > 0
              ? 'Auswahl aufheben'
              : 'Alle wählen'}
          </Button>
          <Button
            type="button"
            variant="filled"
            size="sm"
            leftIcon={<Printer size={14} />}
            onClick={printSelected}
            disabled={selected.size === 0}
          >
            Auswahl drucken ({selected.size})
          </Button>
        </div>
      </div>

      {tokens === null ? (
        <div className="text-tertiary">Lade…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            filter === 'unassigned'
              ? 'Keine freien QR-Codes'
              : filter === 'assigned'
                ? 'Keine zugeordneten QR-Codes'
                : 'Noch keine QR-Codes'
          }
          description={'Mit „Neue QR-Codes erzeugen" oben anlegen.'}
        />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-separator">
            {visible.map((t) => (
              <TokenRow
                key={t.id}
                token={t}
                selected={selected.has(t.token)}
                onToggleSelect={() => toggleSelected(t.token)}
                onChanged={refresh}
              />
            ))}
          </ul>
        </Card>
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

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/qr-tokens', { count });
      setOpen(false);
      setCount(12);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Erzeugen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section header="Neue QR-Codes erzeugen">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hover:bg-fill/40 flex w-full items-center gap-2 px-5 py-3.5 text-left text-body font-semibold text-primary-deep transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} />
          QR-Codes auf Vorrat erzeugen
        </button>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-5">
          <TextField
            label="Anzahl"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={String(count)}
            onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            numeric
            hint={
              '1 bis 200 — werden alle als „frei" angelegt und können danach den Messstellen zugeordnet werden.'
            }
            error={error}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="filled" fullWidth disabled={busy}>
              {busy ? 'Erzeuge…' : `${count} erzeugen`}
            </Button>
            <Button type="button" variant="bordered" onClick={() => setOpen(false)} disabled={busy}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}

function TokenRow({
  token,
  selected,
  onToggleSelect,
  onChanged,
}: {
  token: QrTokenRead;
  selected: boolean;
  onToggleSelect: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const previewUrl = `/api/v1/qr-tokens/${token.token}/qr?format=png&size=small`;

  async function unassign() {
    if (!window.confirm(`Zuordnung von ${token.token} wirklich lösen?`)) return;
    setBusy(true);
    try {
      await api.delete(`/qr-tokens/${token.token}/assign`);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.problem.detail ?? err.problem.title);
    } finally {
      setBusy(false);
    }
  }

  async function deleteToken() {
    if (
      !window.confirm(
        `Token ${token.token} unwiderruflich löschen? Der Sticker wird damit unbrauchbar.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.delete(`/qr-tokens/${token.token}`);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.problem.detail ?? err.problem.title);
    } finally {
      setBusy(false);
    }
  }

  function printSingle() {
    const w = window.open(
      `/api/v1/qr-tokens/${token.token}/qr?format=svg&size=large`,
      '_blank',
    );
    if (w) {
      // Browser zeigt das SVG — User druckt mit Strg/Cmd-P selbst.
      w.focus();
    }
  }

  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="h-4 w-4 accent-primary"
        aria-label={`Token ${token.token} zur Auswahl hinzufügen`}
      />
      <div className="rounded-card border-hairline border-border bg-white p-1.5 shadow-glass">
        <img src={previewUrl} alt={`QR ${token.token}`} className="block h-12 w-12" loading="lazy" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="num text-body font-semibold text-label">{token.token}</div>
        <div className="text-caption text-tertiary">
          {token.measuring_point_id !== null && token.measuring_point_name ? (
            <span className="inline-flex items-center gap-1">
              <Link2 size={12} />
              <span className="font-semibold text-primary-deep">{token.measuring_point_name}</span>
              {token.assigned_at ? (
                <span> · seit {formatDateTimeDe(token.assigned_at)}</span>
              ) : null}
            </span>
          ) : (
            <span className="italic">frei — bereit zur Zuordnung</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="plain"
          size="sm"
          leftIcon={<Printer size={14} />}
          onClick={printSingle}
          disabled={busy}
          title="Drucken / SVG anzeigen"
        >
          <span className="sr-only">Drucken</span>
        </Button>
        {token.measuring_point_id !== null ? (
          <Button
            type="button"
            variant="plain"
            size="sm"
            leftIcon={<Unlink size={14} />}
            onClick={() => void unassign()}
            disabled={busy}
            title="Zuordnung lösen"
          >
            <span className="sr-only">Zuordnung lösen</span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="plain"
          size="sm"
          leftIcon={<Trash2 size={14} />}
          onClick={() => void deleteToken()}
          disabled={busy}
          title="Token löschen"
        >
          <span className="sr-only">Löschen</span>
        </Button>
      </div>
    </li>
  );
}
