/**
 * QrCodesAdminPage — Admin-Verwaltung für QR-Tokens.
 *
 * Workflow im Bürobetrieb:
 *  1. "Neue QR-Codes erzeugen": Anzahl wählen, Backend liefert Token-Liste
 *     zurück, alle erscheinen sofort als "frei" in der Liste.
 *  2. "Auswahl drucken": ausgewählte Tokens werden auf A4 ausgedruckt —
 *     wahlweise als Schnitt-Bogen 2×4 (Default), Avery L4731REV (25,4 ×
 *     10 mm, 189/Bogen) oder Avery 3320 / 32×10-R (32 × 10 mm, 44/Bogen).
 *     Layout-Wahl und Druckparameter bleiben pro Browser in localStorage.
 *  3. Vor Ort: Mitarbeiter klebt einen Sticker auf den Zähler, scannt mit
 *     dem Smartphone und ordnet via /erfassen?token=… der MP zu.
 *  4. Hier in der Verwaltung sieht der Admin den Status und kann bei Bedarf
 *     Tokens lösen, neu zuordnen oder löschen.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link2, Plus, Printer, Settings2, Trash2, Unlink } from 'lucide-react';

import {
  Button,
  Card,
  EmptyState,
  LargeTitle,
  Pill,
  Section,
  Select,
  TextField,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeDe } from '@/lib/format';
import type { QrTokenRead } from '@/lib/types';

import {
  DEFAULT_LAYOUTS,
  LAYOUT_ORDER,
  openTokensPrintWindow,
  type LabelLayout,
  type LabelLayoutId,
} from './QrTokensPrintSheet';

/**
 * Override-fähige Felder pro Layout — landen in localStorage, sodass der
 * Admin die Avery-Bögen einmalig nach einem Testdruck einjustieren und
 * danach vergessen kann.
 */
type LayoutOverride = Partial<
  Pick<LabelLayout, 'marginTopMm' | 'marginLeftMm' | 'hPitchMm' | 'vPitchMm'>
>;

const STORAGE_KEY = 'qr-print-layout-v1';

interface StoredPrefs {
  selectedLayout: LabelLayoutId;
  overrides: Partial<Record<LabelLayoutId, LayoutOverride>>;
}

function loadPrefs(): StoredPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { selectedLayout: 'cut-2x4', overrides: {} };
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    const selected = parsed.selectedLayout;
    const valid = selected !== undefined && (LAYOUT_ORDER as string[]).includes(selected);
    return {
      selectedLayout: valid ? selected : 'cut-2x4',
      overrides: parsed.overrides ?? {},
    };
  } catch {
    return { selectedLayout: 'cut-2x4', overrides: {} };
  }
}

function savePrefs(prefs: StoredPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota voll oder Privacy-Mode — egal, keine kritischen Daten.
  }
}

function applyOverride(layout: LabelLayout, override: LayoutOverride | undefined): LabelLayout {
  if (!override) return layout;
  return {
    ...layout,
    marginTopMm: override.marginTopMm ?? layout.marginTopMm,
    marginLeftMm: override.marginLeftMm ?? layout.marginLeftMm,
    hPitchMm: override.hPitchMm ?? layout.hPitchMm,
    vPitchMm: override.vPitchMm ?? layout.vPitchMm,
  };
}

type Filter = 'all' | 'assigned' | 'unassigned';

export function QrCodesAdminPage() {
  const [tokens, setTokens] = useState<QrTokenRead[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [prefs, setPrefs] = useState<StoredPrefs>(() => loadPrefs());
  const [paramsOpen, setParamsOpen] = useState(false);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

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
    const baseLayout = DEFAULT_LAYOUTS[prefs.selectedLayout];
    const layout = applyOverride(baseLayout, prefs.overrides[prefs.selectedLayout]);
    const ok = openTokensPrintWindow(list, layout);
    if (!ok) {
      window.alert(
        'Druckfenster konnte nicht geöffnet werden — bitte Pop-up-Blocker für diese Seite erlauben.',
      );
    }
  }

  function setSelectedLayout(id: LabelLayoutId) {
    setPrefs((p) => ({ ...p, selectedLayout: id }));
  }

  function setOverrideField(id: LabelLayoutId, field: keyof LayoutOverride, value: number | null) {
    setPrefs((p) => {
      const current = { ...(p.overrides[id] ?? {}) };
      if (value === null) {
        delete current[field];
      } else {
        current[field] = value;
      }
      const nextOverrides = { ...p.overrides };
      if (Object.keys(current).length === 0) {
        delete nextOverrides[id];
      } else {
        nextOverrides[id] = current;
      }
      return { ...p, overrides: nextOverrides };
    });
  }

  function resetOverride(id: LabelLayoutId) {
    setPrefs((p) => {
      const next = { ...p.overrides };
      delete next[id];
      return { ...p, overrides: next };
    });
  }

  const activeLayout = DEFAULT_LAYOUTS[prefs.selectedLayout];
  const activeOverride = prefs.overrides[prefs.selectedLayout];
  const supportsOverride = prefs.selectedLayout !== 'cut-2x4';

  return (
    <>
      <LargeTitle title="QR-Codes" />

      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm onCreated={refresh} />

      <Section header="Druck-Layout">
        <div className="space-y-3 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Select
              label="Bogenformat"
              value={prefs.selectedLayout}
              onChange={(e) => setSelectedLayout(e.target.value as LabelLayoutId)}
              hint={activeLayout.description}
            >
              {LAYOUT_ORDER.map((id) => (
                <option key={id} value={id}>
                  {DEFAULT_LAYOUTS[id].name}
                </option>
              ))}
            </Select>
            {supportsOverride ? (
              <Button
                type="button"
                variant="bordered"
                size="sm"
                leftIcon={<Settings2 size={14} />}
                onClick={() => setParamsOpen((v) => !v)}
              >
                {paramsOpen ? 'Parameter verbergen' : 'Druckparameter anpassen'}
              </Button>
            ) : null}
          </div>

          {supportsOverride ? (
            <p className="text-caption text-tertiary">
              Reine QR-Codes ohne Beschriftung — ein 10 × 10 mm Quadrat, zentriert auf jedem
              Etikett. Vor dem ersten Echtdruck eine Testseite auf Normalpapier ausgeben und gegen
              den Etikettenbogen halten; Margin/Pitch ggf. unten korrigieren.
            </p>
          ) : null}

          {supportsOverride && paramsOpen ? (
            <PrintParamsPanel
              layout={activeLayout}
              override={activeOverride}
              onChange={(field, value) => setOverrideField(prefs.selectedLayout, field, value)}
              onReset={() => resetOverride(prefs.selectedLayout)}
            />
          ) : null}
        </div>
      </Section>

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
    </>
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

function PrintParamsPanel({
  layout,
  override,
  onChange,
  onReset,
}: {
  layout: LabelLayout;
  override: LayoutOverride | undefined;
  onChange: (field: keyof LayoutOverride, value: number | null) => void;
  onReset: () => void;
}) {
  const fields: { key: keyof LayoutOverride; label: string; hint: string }[] = [
    { key: 'marginTopMm', label: 'Rand oben (mm)', hint: 'Blattkante → erstes Etikett' },
    { key: 'marginLeftMm', label: 'Rand links (mm)', hint: 'Blattkante → erstes Etikett' },
    {
      key: 'hPitchMm',
      label: 'Spalten-Pitch (mm)',
      hint: `Etikett-Breite ${layout.labelWidthMm} mm + Lücke`,
    },
    {
      key: 'vPitchMm',
      label: 'Zeilen-Pitch (mm)',
      hint: `Etikett-Höhe ${layout.labelHeightMm} mm + Lücke`,
    },
  ];

  function valueFor(key: keyof LayoutOverride): number {
    return override?.[key] ?? layout[key];
  }

  function handleChange(key: keyof LayoutOverride, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      onChange(key, null);
      return;
    }
    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    if (parsed === layout[key]) {
      onChange(key, null); // Zurück zum Default — kein Override mehr
    } else {
      onChange(key, parsed);
    }
  }

  return (
    <div className="bg-fill/40 rounded-card border-hairline border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-caption-bold uppercase text-tertiary">
          Druckparameter — {layout.name}
        </span>
        {override ? (
          <button
            type="button"
            onClick={onReset}
            className="text-caption font-semibold text-primary-deep hover:underline"
          >
            Auf Standard zurücksetzen
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            value={String(valueFor(f.key))}
            onChange={(e) => handleChange(f.key, e.target.value)}
            numeric
            hint={f.hint}
          />
        ))}
      </div>
    </div>
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
    const w = window.open(`/api/v1/qr-tokens/${token.token}/qr?format=svg&size=large`, '_blank');
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
        <img
          src={previewUrl}
          alt={`QR ${token.token}`}
          className="block h-12 w-12"
          loading="lazy"
        />
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
