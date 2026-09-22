/**
 * MeasuringPointNotes — Freitext-Notizen zu einer Messstelle.
 *
 * Zwei Darstellungen derselben Logik:
 * - ``card``: eigene Karte auf der Messstellen-Detailseite (Admin).
 * - ``compact``: eingebettet in die Erfassungsseite; zeigt vorhandene
 *   Notizen und ein einklappbares Formular. Schlägt das Laden fehl (z. B.
 *   offline — Notizen werden nicht gecacht), bleibt der Abschnitt leer.
 *
 * Notizen werden nicht bearbeitet. Löschen darf der Ersteller oder ein
 * Admin; das Backend erzwingt das zusätzlich.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, StickyNote, Trash2 } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeDe } from '@/lib/format';
import type { MeasuringPointNoteRead } from '@/lib/types';

export const NOTE_MAX_LENGTH = 500;

interface MeasuringPointNotesProps {
  mpId: number;
  variant: 'card' | 'compact';
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : fallback;
}

export function MeasuringPointNotes({ mpId, variant }: MeasuringPointNotesProps) {
  const { me } = useAuth();
  const [notes, setNotes] = useState<MeasuringPointNoteRead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [formOpen, setFormOpen] = useState(variant === 'card');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNotes(null);
    setLoadError(null);
    api
      .get<MeasuringPointNoteRead[]>(`/measuring-points/${mpId}/notes`)
      .then((rows) => {
        if (!cancelled) setNotes(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err, 'Konnte Notizen nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [mpId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await api.post<MeasuringPointNoteRead>(`/measuring-points/${mpId}/notes`, {
        text,
      });
      setNotes((prev) => [created, ...(prev ?? [])]);
      setText('');
      if (variant === 'compact') setFormOpen(false);
    } catch (err) {
      setActionError(errorMessage(err, 'Notiz konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(note: MeasuringPointNoteRead) {
    if (!window.confirm('Notiz wirklich löschen?')) return;
    setActionError(null);
    try {
      await api.delete(`/measuring-point-notes/${note.id}`);
      setNotes((prev) => (prev ?? []).filter((n) => n.id !== note.id));
    } catch (err) {
      setActionError(errorMessage(err, 'Notiz konnte nicht gelöscht werden.'));
    }
  }

  const canDelete = (note: MeasuringPointNoteRead) =>
    me?.role === 'admin' || (me !== null && note.created_by_user_id === me.id);

  if (variant === 'compact' && (loadError !== null || notes === null)) return null;

  const list =
    notes === null ? (
      <div className="text-body-sm text-tertiary">Lade…</div>
    ) : notes.length === 0 ? (
      variant === 'card' ? (
        <div className="text-caption italic text-quaternary">Noch keine Notizen.</div>
      ) : null
    ) : (
      <ul className="bg-fill/60 divide-y divide-separator overflow-hidden rounded-card border-hairline border-border">
        {notes.map((n) => (
          <li key={n.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="whitespace-pre-wrap break-words text-body-sm text-label">
                {n.text}
              </div>
              <div className="mt-1 text-caption text-tertiary">
                {n.created_by_username ?? '—'} ·{' '}
                <span className="num">{formatDateTimeDe(n.created_at)}</span>
              </div>
            </div>
            {canDelete(n) ? (
              <button
                type="button"
                onClick={() => void remove(n)}
                aria-label="Notiz löschen"
                title="Notiz löschen"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger/10"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    );

  const form = formOpen ? (
    <form onSubmit={(e) => void submit(e)} className="space-y-2">
      <label className="block">
        <span className="sr-only">Neue Notiz</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          rows={3}
          placeholder="Notiz zur Messstelle …"
          className="w-full resize-y rounded-card border-hairline border-border bg-fill px-3.5 py-2.5 text-body text-label outline-none transition-colors placeholder:text-quaternary focus:border-primary focus:bg-surface-solid"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cx(
            'num text-caption',
            text.length >= NOTE_MAX_LENGTH ? 'text-danger' : 'text-tertiary',
          )}
        >
          {text.length}/{NOTE_MAX_LENGTH}
        </span>
        <div className="flex gap-2">
          {variant === 'compact' ? (
            <Button
              type="button"
              variant="bordered"
              size="sm"
              onClick={() => {
                setFormOpen(false);
                setText('');
              }}
              disabled={busy}
            >
              Abbrechen
            </Button>
          ) : null}
          <Button type="submit" variant="filled" size="sm" disabled={busy || !text.trim()}>
            {busy ? 'Speichere…' : 'Notiz hinzufügen'}
          </Button>
        </div>
      </div>
    </form>
  ) : (
    <button
      type="button"
      onClick={() => setFormOpen(true)}
      className="inline-flex items-center gap-1.5 text-caption font-semibold text-primary-deep hover:underline"
    >
      <Plus size={14} />
      Notiz hinzufügen
    </button>
  );

  const errorBox = actionError ? (
    <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-caption text-danger">
      {actionError}
    </div>
  ) : null;

  if (variant === 'compact') {
    return (
      <div className="mt-3 space-y-2" data-testid="mp-notes-compact">
        {list}
        {errorBox}
        {form}
      </div>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-caption-bold uppercase text-tertiary">Notizen</div>
        {notes !== null ? (
          <div className="inline-flex items-center gap-1.5 text-caption text-tertiary">
            <StickyNote size={14} />
            <span>{notes.length}</span>
          </div>
        ) : null}
      </div>
      <div className="mt-3 space-y-3">
        {loadError ? (
          <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-caption text-danger">
            {loadError}
          </div>
        ) : (
          <>
            {form}
            {errorBox}
            {list}
          </>
        )}
      </div>
    </Card>
  );
}
