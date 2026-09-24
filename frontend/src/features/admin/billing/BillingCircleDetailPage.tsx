/**
 * Detail eines Abrechnungskreises: Stammdaten, Positionen (Messstellen bzw. Restmenge mit
 * Gültigkeitszeitraum, Unterzähler, Agrarmonitor-Rechnungszeile; nach Empfänger gruppiert und
 * per Drag & Drop sortierbar) und Prüfbericht zum Stichtag.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';

import { Button, LargeTitle, Section, Select, Sheet, TextField } from '@/components/ui';
import { api } from '@/lib/api';
import type {
  BillingCheckRead,
  BillingCircleRead,
  BillingPositionKind,
  BillingPositionRead,
  MeasuringPointRead,
  OwnerRead,
} from '@/lib/types';

import { BillingRunsSection } from './BillingRunsSection';
import { CircleFields } from './CircleFields';
import { HistoryCard } from './HistoryCard';
import { InvoicesSection } from './InvoicesSection';
import { MonthReadingsSection } from './MonthReadingsSection';
import { PositionsList } from './PositionsList';
import { circleBody, circleFormState, errorText, lastDayOfPreviousMonth } from './circleForm';
import type { CircleFormState } from './circleForm';

export function BillingCircleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const circleId = Number(id);
  const navigate = useNavigate();
  const [circle, setCircle] = useState<BillingCircleRead | null>(null);
  const [positions, setPositions] = useState<BillingPositionRead[]>([]);
  const [meters, setMeters] = useState<MeasuringPointRead[]>([]);
  const [owners, setOwners] = useState<OwnerRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editCircle, setEditCircle] = useState(false);
  const [positionSheet, setPositionSheet] = useState<{
    position: BillingPositionRead | null;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<BillingCircleRead>(`/billing-circles/${circleId}`),
      api.get<BillingPositionRead[]>(`/billing-circles/${circleId}/positions`),
    ])
      .then(([c, p]) => {
        if (cancelled) return;
        setCircle(c);
        setPositions(p);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte den Abrechnungskreis nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [circleId, tick]);

  useEffect(() => {
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then((d) => setMeters(d.filter((m) => m.type === 'electricity')))
      .catch(() => {
        /* Auswahl bleibt leer */
      });
    api
      .get<OwnerRead[]>('/owners')
      .then(setOwners)
      .catch(() => {
        /* Auswahl bleibt leer */
      });
  }, []);

  async function removeCircle() {
    if (!circle || !window.confirm(`Abrechnungskreis "${circle.code}" wirklich löschen?`)) return;
    try {
      await api.delete(`/billing-circles/${circle.id}`);
      navigate('/admin/abrechnungskreise');
    } catch (err) {
      setError(errorText(err, 'Löschen fehlgeschlagen.'));
    }
  }

  async function removePosition(p: BillingPositionRead) {
    if (!window.confirm(`Position "${p.label}" wirklich löschen?`)) return;
    try {
      await api.delete(`/billing-circles/${circleId}/positions/${p.id}`);
      refresh();
    } catch (err) {
      setError(errorText(err, 'Löschen fehlgeschlagen.'));
    }
  }

  function reorderPositions(ids: number[]) {
    // Sofort anzeigen, dann speichern. Speichervorgänge laufen nacheinander, damit bei schnellem
    // Umsortieren die letzte Reihenfolge gewinnt; erst danach neu laden (auch Zählerstände und
    // Prüfbericht folgen der Reihenfolge, bei Fehler kommt der Serverstand zurück).
    const byId = new Map(positions.map((p) => [p.id, p]));
    setPositions(
      ids.flatMap((id, i) => {
        const p = byId.get(id);
        return p ? [{ ...p, sort_order: (i + 1) * 10 }] : [];
      }),
    );
    pendingSaves.current += 1;
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await api.put(`/billing-circles/${circleId}/positions/order`, { position_ids: ids });
        setError(null);
      } catch (err) {
        setError(errorText(err, 'Reihenfolge konnte nicht gespeichert werden.'));
      }
      pendingSaves.current -= 1;
      if (pendingSaves.current === 0) refresh();
    });
  }

  return (
    <>
      <Link
        to="/admin/abrechnungskreise"
        className="mb-2 inline-flex items-center gap-1 text-body text-primary"
      >
        <ArrowLeft size={16} /> Abrechnungskreise
      </Link>
      <LargeTitle
        title={circle ? `${circle.code} – ${circle.name}` : 'Abrechnungskreis'}
        subtitle={
          circle
            ? `${circle.rechnungsleger} · ${circle.abnahmestelle}${
                circle.marktlokation ? ` · MaLo ${circle.marktlokation}` : ''
              }`
            : undefined
        }
        trailing={
          circle ? (
            <div className="flex gap-2">
              <Link
                to={`/admin/abrechnungskreise/${circleId}/assistent`}
                className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-caption text-white"
              >
                Monat abrechnen
              </Link>
              <Button variant="bordered" size="sm" onClick={() => setEditCircle(true)}>
                Bearbeiten
              </Button>
              <Button variant="bordered" size="sm" onClick={() => void removeCircle()}>
                Löschen
              </Button>
            </div>
          ) : null
        }
      />
      {error ? (
        <div className="mb-3 rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </div>
      ) : null}

      <Section
        header={
          <div className="flex items-center justify-between gap-2">
            <span>Positionen</span>
            <Button
              variant="bordered"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setPositionSheet({ position: null })}
            >
              Position hinzufügen
            </Button>
          </div>
        }
      >
        {positions.length === 0 ? (
          <div className="p-5 text-caption text-tertiary">Noch keine Positionen.</div>
        ) : (
          <>
            <p className="px-5 py-3 text-caption text-tertiary">
              Gruppiert nach Empfänger (Stand heute). Reihenfolge über den Griff verschieben — sie
              gilt für Abrechnungslauf, Agrarmonitor-Übertragung und Excel. Ein Stammdaten-Import
              setzt sie wieder auf die Reihenfolge der Excel.
            </p>
            <PositionsList
              positions={positions}
              onReorder={reorderPositions}
              onEdit={(p) => setPositionSheet({ position: p })}
              onRemove={(p) => void removePosition(p)}
            />
          </>
        )}
      </Section>

      <BillingRunsSection circleId={circleId} />

      <InvoicesSection circleId={circleId} />

      <HistoryCard circleId={circleId} />

      <MonthReadingsSection circleId={circleId} tick={tick} />

      <CheckSection circleId={circleId} tick={tick} />

      <Sheet open={editCircle} onClose={() => setEditCircle(false)} title="Kreis bearbeiten">
        {circle && editCircle ? (
          <CircleEditForm
            circle={circle}
            onSaved={() => {
              setEditCircle(false);
              refresh();
            }}
            onCancel={() => setEditCircle(false)}
          />
        ) : null}
      </Sheet>
      <Sheet
        open={positionSheet !== null}
        onClose={() => setPositionSheet(null)}
        title={positionSheet?.position ? 'Position bearbeiten' : 'Position hinzufügen'}
      >
        {positionSheet ? (
          <PositionForm
            circleId={circleId}
            position={positionSheet.position}
            positions={positions}
            meters={meters}
            owners={owners}
            onSaved={() => {
              setPositionSheet(null);
              refresh();
            }}
            onCancel={() => setPositionSheet(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function CircleEditForm({
  circle,
  onSaved,
  onCancel,
}: {
  circle: BillingCircleRead;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<CircleFormState>(() => circleFormState(circle));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/billing-circles/${circle.id}`, circleBody(state));
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Speichern fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <CircleFields state={state} onChange={setState} />
      {error ? <div className="text-caption text-danger">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Speichern'}
        </Button>
        <Button type="button" variant="bordered" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function PositionForm({
  circleId,
  position,
  positions,
  meters,
  owners,
  onSaved,
  onCancel,
}: {
  circleId: number;
  position: BillingPositionRead | null;
  positions: BillingPositionRead[];
  meters: MeasuringPointRead[];
  owners: OwnerRead[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(position?.label ?? '');
  const [kind, setKind] = useState<BillingPositionKind>(position?.kind ?? 'meter');
  const [mpId, setMpId] = useState(position?.measuring_point_id?.toString() ?? '');
  const [parentId, setParentId] = useState(position?.parent_position_id?.toString() ?? '');
  const [ownerId, setOwnerId] = useState(position?.owner_id?.toString() ?? '');
  const [kst, setKst] = useState(position?.kostenstelle?.toString() ?? '');
  const [invoiceLine, setInvoiceLine] = useState(position?.invoice_line ?? '');
  const [note, setNote] = useState(position?.note ?? '');
  const [validFrom, setValidFrom] = useState(position?.valid_from ?? '');
  const [validTo, setValidTo] = useState(position?.valid_to ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parents = positions.filter(
    (p) => p.kind === 'meter' && p.parent_position_id === null && p.id !== position?.id,
  );
  const sortedMeters = useMemo(
    () => [...meters].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [meters],
  );

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (kind === 'rest' && !/^\d{1,5}$/.test(kst.trim())) {
      setError('Kostenstelle muss eine Ganzzahl von 0 bis 99999 sein.');
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      label: label.trim(),
      kind,
      // Reihenfolge nur per Drag & Drop; neue Positionen setzt der Server ans Ende.
      measuring_point_id: kind === 'meter' && mpId ? Number(mpId) : null,
      parent_position_id: kind === 'meter' && parentId ? Number(parentId) : null,
      owner_id: kind === 'rest' && ownerId ? Number(ownerId) : null,
      kostenstelle: kind === 'rest' ? Number(kst.trim()) : null,
      invoice_line: invoiceLine.trim() || null,
      note: note.trim() || null,
      valid_from: validFrom,
      valid_to: validTo || null,
    };
    try {
      if (position) {
        await api.patch(`/billing-circles/${circleId}/positions/${position.id}`, body);
      } else {
        await api.post(`/billing-circles/${circleId}/positions`, body);
      }
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Speichern fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <TextField
        label="Bezeichnung"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        required
      />
      <Select
        label="Art"
        value={kind}
        onChange={(e) => setKind(e.target.value as BillingPositionKind)}
      >
        <option value="meter">Messstelle</option>
        <option value="rest">Restmenge (ohne Zähler)</option>
      </Select>
      {kind === 'meter' ? (
        <>
          <Select
            label="Messstelle"
            value={mpId}
            onChange={(e) => setMpId(e.target.value)}
            required
          >
            <option value="">— bitte wählen —</option>
            {sortedMeters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Select
            label="Unterzähler von (optional)"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            hint="Der Verbrauch wird vom Hauptzähler abgezogen (z. B. Nebenzähler hinter dem Hauptzähler)."
          >
            <option value="">— kein Hauptzähler —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </>
      ) : (
        <>
          <Select
            label="Empfänger"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            required
          >
            <option value="">— bitte wählen —</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <TextField
            label="Kostenstelle"
            value={kst}
            onChange={(e) => setKst(e.target.value.replace(/\D/g, '').slice(0, 5))}
            inputMode="numeric"
            required
          />
        </>
      )}
      <TextField
        label="Rechnungszeile Agrarmonitor (optional)"
        value={invoiceLine}
        onChange={(e) => setInvoiceLine(e.target.value)}
        hint="Leer = Standard: Mieter bzw. „Strom (gewerblich) Kostenstelle …“"
        maxLength={120}
      />
      <TextField label="Bemerkung" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Gültig ab"
          type="date"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
          required
        />
        <TextField
          label="Gültig bis"
          type="date"
          value={validTo}
          onChange={(e) => setValidTo(e.target.value)}
        />
      </div>
      {error ? <div className="text-caption text-danger">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Speichern'}
        </Button>
        <Button type="button" variant="bordered" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function CheckSection({ circleId, tick }: { circleId: number; tick: number }) {
  const [stichtag, setStichtag] = useState(lastDayOfPreviousMonth);
  const [report, setReport] = useState<BillingCheckRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stichtag) return;
    let cancelled = false;
    api
      .get<BillingCheckRead>(`/billing-circles/${circleId}/check?stichtag=${stichtag}`)
      .then((d) => {
        if (!cancelled) {
          setReport(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Prüfbericht fehlgeschlagen.'));
      });
    return () => {
      cancelled = true;
    };
  }, [circleId, stichtag, tick]);

  return (
    <Section header="Prüfbericht">
      <div className="space-y-3 p-5">
        <TextField
          label="Stichtag"
          type="date"
          value={stichtag}
          onChange={(e) => setStichtag(e.target.value)}
          hint="In der Regel der Monatsletzte des Abrechnungsmonats."
        />
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        {report ? (
          <>
            {report.findings.length === 0 ? (
              <div className="rounded-card bg-success/10 p-3 text-caption text-success">
                Keine Befunde – alle Positionen haben Empfänger und Kostenstelle.
              </div>
            ) : (
              <ul className="space-y-1" aria-label="Befunde">
                {report.findings.map((f, i) => (
                  <li
                    key={`${f.position_id ?? 'kreis'}-${f.code}-${i}`}
                    className="rounded-card bg-danger/10 px-3 py-2 text-caption text-danger"
                  >
                    <strong>{f.label}:</strong> {f.message}
                  </li>
                ))}
              </ul>
            )}
            {report.positions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-caption">
                  <thead className="text-tertiary">
                    <tr>
                      <th className="py-1 pr-3">Position</th>
                      <th className="py-1 pr-3">Empfänger</th>
                      <th className="py-1 pr-3">KST</th>
                      <th className="py-1">Rechnungszeile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.positions.map((r) => (
                      <tr key={r.position_id} className="border-t border-separator">
                        <td className="py-1 pr-3 text-label">{r.label}</td>
                        <td className="py-1 pr-3">
                          {r.owner_name ?? '—'}
                          {r.recipient_kind === 'mieter' ? ' (Mieter)' : ''}
                          {r.internal_allocation ? ' (intern)' : ''}
                        </td>
                        <td className="num py-1 pr-3">{r.kostenstelle ?? '—'}</td>
                        <td className="py-1">{r.invoice_line ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Section>
  );
}
