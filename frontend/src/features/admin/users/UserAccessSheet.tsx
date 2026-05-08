/**
 * UserAccessSheet — Editor für Per-Recorder MP-Zugriff (Feature B).
 *
 * Admin öffnet das Sheet pro Recorder-User; lädt aktuelle Zuweisungen plus
 * die volle MP-Liste, zeigt Multi-Select mit Filter (Name + Typ-Pills) und
 * "Alle/Keine"-Toggle auf der gefilterten Sicht.
 *
 * Beim Speichern wird das vollständige neue Set per ``PUT
 * /users/{id}/measuring-points`` an das Backend geschickt — der Server
 * berechnet selbst Diff und Audit-Einträge.
 */

import { useEffect, useMemo, useState } from 'react';
import { Save, Search, X } from 'lucide-react';

import { Button, Pill, Sheet, Switch, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { describeMeterType } from '@/lib/meterLabels';
import type {
  MeasuringPointRead,
  MeterType,
  UserAccessRead,
  UserAccessUpdate,
  UserRead,
} from '@/lib/types';

type TypeFilter = 'all' | MeterType;

interface UserAccessSheetProps {
  user: UserRead;
  onClose: () => void;
  onSaved?: () => void;
}

export function UserAccessSheet({ user, onClose, onSaved }: UserAccessSheetProps) {
  const [allMps, setAllMps] = useState<MeasuringPointRead[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [canAssignTokens, setCanAssignTokens] = useState<boolean>(user.can_assign_qr_tokens);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Initialer Load: Liste aller MPs (Admin sieht alle) + aktuelle Access-Liste.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<MeasuringPointRead[]>('/measuring-points'),
      api.get<UserAccessRead>(`/users/${user.id}/measuring-points`),
    ])
      .then(([mps, access]) => {
        if (cancelled) return;
        setAllMps(mps);
        setSelected(new Set(access.measuring_point_ids));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setLoadingError(err.problem.detail ?? err.problem.title);
        } else {
          setLoadingError('Konnte Zugriffsdaten nicht laden.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const filtered = useMemo(() => {
    if (!allMps) return [];
    const q = search.trim().toLowerCase();
    return allMps.filter((mp) => {
      if (typeFilter !== 'all' && mp.type !== typeFilter) return false;
      if (q && !mp.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allMps, typeFilter, search]);

  const filteredIds = useMemo(() => filtered.map((mp) => mp.id), [filtered]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) next.add(id);
      return next;
    });
  }

  function deselectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) next.delete(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body: UserAccessUpdate = { measuring_point_ids: Array.from(selected) };
      await api.put<UserAccessRead>(`/users/${user.id}/measuring-points`, body);
      // Token-Assign-Flag separat patchen, falls geändert
      if (canAssignTokens !== user.can_assign_qr_tokens) {
        await api.patch(`/users/${user.id}`, { can_assign_qr_tokens: canAssignTokens });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    if (!allMps) return { all: 0, electricity: 0, water: 0, heating: 0 };
    const c = { all: allMps.length, electricity: 0, water: 0, heating: 0 };
    for (const mp of allMps) c[mp.type] += 1;
    return c;
  }, [allMps]);

  return (
    <Sheet open onClose={onClose} title={`Messstellen-Zugriff · ${user.username}`}>
      {loadingError ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
          {loadingError}
        </div>
      ) : null}

      {allMps === null && !loadingError ? <div className="text-tertiary">Lade…</div> : null}

      {allMps !== null ? (
        <div className="space-y-4">
          <div className="rounded-card border-hairline border-border bg-fill p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <Switch
                checked={canAssignTokens}
                onChange={() => setCanAssignTokens((v) => !v)}
                ariaLabel="QR-Codes zuweisen"
              />
              <div className="min-w-0 flex-1">
                <div className="text-body font-semibold text-label">QR-Codes zuweisen</div>
                <div className="text-caption text-tertiary">
                  Erlaubt diesem Recorder, einen frisch geklebten QR-Sticker selbst einer
                  zugänglichen Messstelle zuzuordnen — ohne Admin-Eingriff.
                </div>
              </div>
            </label>
          </div>

          <div className="text-body-sm text-secondary">
            {selected.size} von {counts.all} Messstellen zugeordnet.
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Pill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
              Alle · {counts.all}
            </Pill>
            <Pill
              active={typeFilter === 'electricity'}
              onClick={() => setTypeFilter('electricity')}
            >
              Strom · {counts.electricity}
            </Pill>
            <Pill active={typeFilter === 'water'} onClick={() => setTypeFilter('water')}>
              Wasser · {counts.water}
            </Pill>
            <Pill active={typeFilter === 'heating'} onClick={() => setTypeFilter('heating')}>
              Heizung · {counts.heating}
            </Pill>
          </div>

          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary"
            />
            <TextField
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen…"
              inputClassName="pl-9"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="text-caption text-tertiary">
              Sichtbar: {filtered.length}
              {filteredIds.length !== allMps.length ? ` (von ${allMps.length})` : ''}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="bordered"
                size="sm"
                onClick={selectAllFiltered}
                disabled={filteredIds.length === 0 || allFilteredSelected}
              >
                Alle auswählen
              </Button>
              <Button
                type="button"
                variant="bordered"
                size="sm"
                onClick={deselectAllFiltered}
                disabled={filteredIds.length === 0 || !filteredIds.some((id) => selected.has(id))}
              >
                Keine
              </Button>
            </div>
          </div>

          <ul className="max-h-[50vh] divide-y divide-separator overflow-y-auto rounded-card border-hairline border-border bg-fill">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-caption text-tertiary">
                Keine Messstellen für den aktuellen Filter.
              </li>
            ) : (
              filtered.map((mp) => {
                const checked = selected.has(mp.id);
                return (
                  <li key={mp.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-fill-strong">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(mp.id)}
                        className="mt-1 h-4 w-4 accent-primary"
                        aria-label={`Zugriff auf ${mp.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-body font-semibold text-label">{mp.name}</div>
                        <div className="text-caption text-tertiary">
                          {describeMeterType(mp.type, mp.heating_source)}
                          {mp.location_name ? ` · ${mp.location_name}` : ''}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })
            )}
          </ul>

          {error ? (
            <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="filled"
              leftIcon={<Save size={14} />}
              onClick={() => void save()}
              disabled={busy}
              fullWidth
            >
              {busy ? 'Speichere…' : 'Speichern'}
            </Button>
            <Button
              type="button"
              variant="bordered"
              leftIcon={<X size={14} />}
              onClick={onClose}
              disabled={busy}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
