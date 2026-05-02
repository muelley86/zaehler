import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, Pencil, Search, Trash2 } from 'lucide-react';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  Button,
  EmptyState,
  LargeTitle,
  Pill,
  Section,
  Sheet,
  TextField,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeDe, formatDe, parseDe, toInputDateTime } from '@/lib/format';
import type {
  DeliveryRead,
  Me,
  MeasuringPointRead,
  MeterType,
  ReadingRead,
} from '@/lib/types';

type ItemKind = 'reading' | 'correction' | 'delivery';

const TYPE_LABELS: Record<MeterType, string> = {
  electricity: 'Strom',
  gas: 'Gas',
  water: 'Wasser',
  oil: 'Ölheizung',
};

interface RegisterIndex {
  registerId: number;
  obisCode: string;
  unit: string;
  label: string;
  meterId: number;
  serialNumber: string;
  meterRemovedAt: string | null;
  mpId: number;
  mpName: string;
  mpType: MeterType;
  locationId: number | null;
  locationName: string | null;
}

type EditTarget =
  | { kind: 'reading'; reading: ReadingRead; info: RegisterIndex }
  | { kind: 'delivery'; delivery: DeliveryRead; info: RegisterIndex };

export function ReadingsListPage() {
  const { me } = useAuth();
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [readings, setReadings] = useState<ReadingRead[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const [locationFilter, setLocationFilter] = useState<Set<number | null>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<MeterType>>(new Set());
  const [mpFilter, setMpFilter] = useState<Set<number>>(new Set());
  const [obisFilter, setObisFilter] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<Set<ItemKind>>(new Set());

  useEffect(() => {
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then(setPoints)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, []);

  useEffect(() => {
    const readingParams = new URLSearchParams();
    readingParams.set('limit', '5000');
    if (from) readingParams.set('from_at', `${from}T00:00:00`);
    if (to) readingParams.set('to_at', `${to}T23:59:59`);
    api
      .get<ReadingRead[]>(`/readings?${readingParams}`)
      .then(setReadings)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
    const deliveryParams = new URLSearchParams();
    deliveryParams.set('limit', '5000');
    if (from) deliveryParams.set('from_date', from);
    if (to) deliveryParams.set('to_date', to);
    const params = deliveryParams;
    api
      .get<DeliveryRead[]>(`/deliveries?${params}`)
      .then(setDeliveries)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, [from, to, tick]);

  const refresh = () => setTick((t) => t + 1);

  const registerIndex = useMemo<Map<number, RegisterIndex>>(() => {
    const index = new Map<number, RegisterIndex>();
    if (!points) return index;
    for (const mp of points) {
      for (const meter of mp.physical_meters) {
        for (const r of meter.registers) {
          index.set(r.id, {
            registerId: r.id,
            obisCode: r.obis_code,
            unit: r.unit,
            label: r.label,
            meterId: meter.id,
            serialNumber: meter.serial_number,
            meterRemovedAt: meter.removed_at,
            mpId: mp.id,
            mpName: mp.name,
            mpType: mp.type,
            locationId: mp.location_id,
            locationName: mp.location_name,
          });
        }
      }
    }
    return index;
  }, [points]);

  type Item =
    | {
        kind: 'reading' | 'correction';
        date: string;
        info: RegisterIndex;
        reading: ReadingRead;
        sortKey: string;
      }
    | {
        kind: 'delivery';
        date: string;
        info: RegisterIndex;
        delivery: DeliveryRead;
        sortKey: string;
      };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const r of readings) {
      const info = registerIndex.get(r.register_id);
      if (!info) continue;
      out.push({
        kind: isCorrection(r) ? 'correction' : 'reading',
        date: r.reading_at,
        info,
        reading: r,
        sortKey: `${r.reading_at}-${String(r.id).padStart(8, '0')}`,
      });
    }
    for (const d of deliveries) {
      const info = registerIndex.get(d.register_id);
      if (!info) continue;
      out.push({
        kind: 'delivery',
        date: d.delivery_date,
        info,
        delivery: d,
        sortKey: `${d.delivery_date}T${d.created_at}-${String(d.id).padStart(8, '0')}`,
      });
    }
    out.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    return out;
  }, [readings, deliveries, registerIndex]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const { info } = item;
      if (locationFilter.size > 0 && !locationFilter.has(info.locationId)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(info.mpType)) return false;
      if (mpFilter.size > 0 && !mpFilter.has(info.mpId)) return false;
      if (obisFilter.size > 0 && !obisFilter.has(info.obisCode)) return false;
      if (kindFilter.size > 0 && !kindFilter.has(item.kind)) return false;
      if (search) {
        const needle = search.toLowerCase();
        const note =
          item.kind === 'delivery' ? (item.delivery.note ?? '') : (item.reading.note ?? '');
        const haystack =
          note +
          ' ' +
          info.mpName +
          ' ' +
          (info.locationName ?? '') +
          ' ' +
          info.serialNumber +
          ' ' +
          info.obisCode;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [items, locationFilter, typeFilter, mpFilter, obisFilter, search, kindFilter]);

  const counts = useMemo(() => {
    const c: Record<ItemKind, number> = { reading: 0, correction: 0, delivery: 0 };
    for (const item of items) c[item.kind] += 1;
    return c;
  }, [items]);

  const locations = useMemo(() => {
    const map = new Map<number | null, string>();
    points?.forEach((mp) => {
      if (mp.location_id !== null && !map.has(mp.location_id)) {
        map.set(mp.location_id, mp.location_name ?? `#${mp.location_id}`);
      }
    });
    return Array.from(map.entries());
  }, [points]);

  const obisCodes = useMemo(() => {
    const set = new Set<string>();
    registerIndex.forEach((r) => set.add(r.obisCode));
    return Array.from(set).sort();
  }, [registerIndex]);

  function downloadCsv() {
    const header = [
      'Datum',
      'Art',
      'Messstelle',
      'Standort',
      'Typ',
      'Seriennummer',
      'OBIS',
      'Bezeichnung',
      'Wert',
      'Einheit',
      'Notiz',
      'Erfasser',
      'Erfasst_am',
    ];
    const lines = [header.join(';')];
    for (const item of filtered) {
      const { info } = item;
      if (item.kind === 'delivery') {
        const d = item.delivery;
        lines.push(
          [
            d.delivery_date,
            'Lieferung',
            info.mpName,
            info.locationName ?? '',
            TYPE_LABELS[info.mpType],
            info.serialNumber,
            info.obisCode,
            info.label,
            d.amount.replace('.', ','),
            info.unit,
            d.note ?? '',
            d.created_by_username ?? '',
            d.created_at.replace('T', ' ').slice(0, 19),
          ]
            .map(csvField)
            .join(';'),
        );
      } else {
        const r = item.reading;
        lines.push(
          [
            r.reading_at.replace('T', ' ').slice(0, 16),
            item.kind === 'correction' ? 'Bestandskorrektur' : 'Erfassung',
            info.mpName,
            info.locationName ?? '',
            TYPE_LABELS[info.mpType],
            info.serialNumber,
            info.obisCode,
            info.label,
            r.value.replace('.', ','),
            info.unit,
            r.note ?? '',
            r.created_by_username ?? '',
            r.created_at.replace('T', ' ').slice(0, 19),
          ]
            .map(csvField)
            .join(';'),
        );
      }
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erfassungen_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <div className="space-y-5">
        <LargeTitle title="Erfassungen" />
        <div className="mx-4 rounded-ios-lg bg-ios-red/15 p-3 text-ios-red">{error}</div>
      </div>
    );
  }
  if (!points) {
    return (
      <div className="space-y-5">
        <LargeTitle title="Erfassungen" />
        <div className="px-4 text-ios-tertiary">Lade…</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <LargeTitle
        title="Erfassungen"
        trailing={
          <Button
            variant="tinted"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={downloadCsv}
            disabled={filtered.length === 0}
          >
            CSV ({filtered.length})
          </Button>
        }
      />

      <div className="px-4 space-y-5">
        <Section header="Filter">
          <div className="space-y-3 p-4">
            <TextField
              type="text"
              placeholder="Suchen (Messstelle, Notiz, SN…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              trailing={<Search size={16} className="text-ios-tertiary" />}
            />
            <FilterRow label="Standorte">
              {locations.map(([id, name]) => (
                <Pill
                  key={String(id)}
                  active={locationFilter.has(id)}
                  onClick={() => setLocationFilter(toggle(locationFilter, id))}
                >
                  {name}
                </Pill>
              ))}
              <Pill
                active={locationFilter.has(null)}
                onClick={() => setLocationFilter(toggle(locationFilter, null))}
              >
                ohne Standort
              </Pill>
            </FilterRow>
            <FilterRow label="Zählerart">
              {(Object.keys(TYPE_LABELS) as MeterType[]).map((t) => (
                <Pill
                  key={t}
                  active={typeFilter.has(t)}
                  onClick={() => setTypeFilter(toggle(typeFilter, t))}
                >
                  {TYPE_LABELS[t]}
                </Pill>
              ))}
            </FilterRow>
            <FilterRow label="Messstellen">
              {points.map((mp) => (
                <Pill
                  key={mp.id}
                  active={mpFilter.has(mp.id)}
                  onClick={() => setMpFilter(toggle(mpFilter, mp.id))}
                >
                  {mp.name}
                </Pill>
              ))}
            </FilterRow>
            <FilterRow label="OBIS">
              {obisCodes.map((code) => (
                <Pill
                  key={code}
                  active={obisFilter.has(code)}
                  onClick={() => setObisFilter(toggle(obisFilter, code))}
                >
                  {code}
                </Pill>
              ))}
            </FilterRow>
            <FilterRow label="Zeitraum">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-ios bg-ios-elevated px-3 py-1.5 text-ios-footnote"
              />
              <span className="text-ios-tertiary">—</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-ios bg-ios-elevated px-3 py-1.5 text-ios-footnote"
              />
            </FilterRow>
            <FilterRow label="Art">
              <Pill
                active={kindFilter.has('reading')}
                onClick={() => setKindFilter(toggle(kindFilter, 'reading'))}
              >
                Erfassungen ({counts.reading})
              </Pill>
              <Pill
                active={kindFilter.has('correction')}
                onClick={() => setKindFilter(toggle(kindFilter, 'correction'))}
              >
                Bestandskorrekturen ({counts.correction})
              </Pill>
              <Pill
                active={kindFilter.has('delivery')}
                onClick={() => setKindFilter(toggle(kindFilter, 'delivery'))}
              >
                Lieferungen ({counts.delivery})
              </Pill>
            </FilterRow>
            {(locationFilter.size ||
              typeFilter.size ||
              mpFilter.size ||
              obisFilter.size ||
              from ||
              to ||
              search ||
              kindFilter.size) ? (
              <button
                type="button"
                onClick={() => {
                  setLocationFilter(new Set());
                  setTypeFilter(new Set());
                  setMpFilter(new Set());
                  setObisFilter(new Set());
                  setFrom('');
                  setTo('');
                  setKindFilter(new Set());
                  setSearch('');
                }}
                className="text-ios-footnote text-ios-blue"
              >
                Filter zurücksetzen
              </button>
            ) : null}
            <div className="text-ios-caption text-ios-tertiary">
              {readings.length} Stände + {deliveries.length} Lieferungen geladen (je max 5000)
            </div>
          </div>
        </Section>

        {filtered.length === 0 ? (
          <EmptyState title="Keine Treffer." />
        ) : (
          <Section header={`${filtered.length} Einträge`}>
            <ul className="divide-y divide-ios-separator/60">
              {filtered.map((item) =>
                item.kind === 'delivery' ? (
                  <DeliveryItem
                    key={`d-${item.delivery.id}`}
                    delivery={item.delivery}
                    info={item.info}
                    me={me}
                    onEdit={() =>
                      setEditTarget({
                        kind: 'delivery',
                        delivery: item.delivery,
                        info: item.info,
                      })
                    }
                    onChanged={refresh}
                  />
                ) : (
                  <ReadingItem
                    key={`r-${item.reading.id}`}
                    reading={item.reading}
                    info={item.info}
                    me={me}
                    onEdit={() =>
                      setEditTarget({
                        kind: 'reading',
                        reading: item.reading,
                        info: item.info,
                      })
                    }
                    onChanged={refresh}
                  />
                ),
              )}
            </ul>
          </Section>
        )}
      </div>

      <Sheet
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={
          editTarget?.kind === 'delivery' ? 'Lieferung bearbeiten' : 'Erfassung bearbeiten'
        }
      >
        {editTarget?.kind === 'reading' ? (
          <EditForm
            reading={editTarget.reading}
            info={editTarget.info}
            onSaved={() => {
              setEditTarget(null);
              refresh();
            }}
            onCancel={() => setEditTarget(null)}
          />
        ) : editTarget?.kind === 'delivery' ? (
          <DeliveryEditForm
            delivery={editTarget.delivery}
            info={editTarget.info}
            onSaved={() => {
              setEditTarget(null);
              refresh();
            }}
            onCancel={() => setEditTarget(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function ReadingItem({
  reading,
  info,
  me,
  onEdit,
  onChanged,
}: {
  reading: ReadingRead;
  info: RegisterIndex;
  me: Me | null;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const editable = me ? canEdit(me, reading) : false;
  const correction = isCorrection(reading);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        `Erfassung vom ${formatDateTimeDe(reading.reading_at)} (${info.mpName}, ${info.obisCode}) wirklich löschen?`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.delete(`/readings/${reading.id}`);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.problem.detail ?? err.problem.title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`px-4 py-3 ${correction ? 'bg-ios-orange/5' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-ios-headline">{info.mpName}</span>
            <span className="rounded-full bg-ios-fill/15 px-1.5 py-0.5 text-ios-caption text-ios-secondary">
              {info.obisCode}
            </span>
            {correction ? (
              <span className="rounded-full bg-ios-orange/20 px-2 py-0.5 text-ios-caption font-medium text-ios-orange">
                Korrektur
              </span>
            ) : null}
          </div>
          <div className="text-ios-footnote text-ios-tertiary">
            {formatDateTimeDe(reading.reading_at)} · SN {info.serialNumber}
            {info.locationName ? ` · ${info.locationName}` : ''}
          </div>
          {reading.note ? (
            <div className="mt-1 text-ios-footnote text-ios-secondary">{reading.note}</div>
          ) : null}
          <div className="mt-1 text-ios-caption text-ios-tertiary">
            {reading.created_by_username ?? '—'} ·{' '}
            {reading.created_at.replace('T', ' ').slice(0, 16)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-rounded text-ios-headline tabular-nums">
            {formatDe(reading.value)}
          </div>
          <div className="text-ios-caption text-ios-tertiary">{info.unit}</div>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <Button
          variant="plain"
          size="sm"
          leftIcon={<Pencil size={14} />}
          disabled={!editable}
          onClick={onEdit}
        >
          Bearbeiten
        </Button>
        <Button
          variant="plain"
          size="sm"
          leftIcon={<Trash2 size={14} />}
          disabled={!editable || busy}
          onClick={() => void remove()}
          className="text-ios-red hover:bg-ios-red/10"
        >
          Löschen
        </Button>
      </div>
    </li>
  );
}

function EditForm({
  reading,
  info,
  onSaved,
  onCancel,
}: {
  reading: ReadingRead;
  info: RegisterIndex;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(reading.value.replace('.', ','));
  const [readingAt, setReadingAt] = useState(toInputDateTime(reading.reading_at));
  const [note, setNote] = useState(reading.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { reading_at: readingAt, note: note || null };
      if (value !== reading.value.replace('.', ',')) {
        body['value'] = parseDe(value);
      }
      await api.patch(`/readings/${reading.id}`, body);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div className="text-ios-footnote text-ios-tertiary">
        {info.mpName} · {info.obisCode} ({info.unit})
      </div>
      <TextField
        label="Stand"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputClassName="font-rounded"
      />
      <TextField
        label="Ablesezeitpunkt"
        type="datetime-local"
        value={readingAt}
        onChange={(e) => setReadingAt(e.target.value)}
      />
      <TextField
        label="Notiz"
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={error}
      />
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

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-ios-footnote text-ios-secondary">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function DeliveryItem({
  delivery,
  info,
  me,
  onEdit,
  onChanged,
}: {
  delivery: DeliveryRead;
  info: RegisterIndex;
  me: Me | null;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const editable = me?.role === 'admin';
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        `Lieferung vom ${delivery.delivery_date} (${info.mpName}, ${formatDe(delivery.amount)} ${info.unit}) wirklich löschen?`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.delete(`/deliveries/${delivery.id}`);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.problem.detail ?? err.problem.title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="bg-ios-blue/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-ios-headline">{info.mpName}</span>
            <span className="rounded-full bg-ios-blue/20 px-2 py-0.5 text-ios-caption font-medium text-ios-blue">
              Lieferung
            </span>
          </div>
          <div className="text-ios-footnote text-ios-tertiary">
            {delivery.delivery_date} · {info.label}
            {info.locationName ? ` · ${info.locationName}` : ''}
          </div>
          {delivery.note ? (
            <div className="mt-1 text-ios-footnote text-ios-secondary">{delivery.note}</div>
          ) : null}
          <div className="mt-1 text-ios-caption text-ios-tertiary">
            {delivery.created_by_username ?? '—'} ·{' '}
            {delivery.created_at.replace('T', ' ').slice(0, 16)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-rounded text-ios-headline tabular-nums text-ios-blue">
            + {formatDe(delivery.amount)}
          </div>
          <div className="text-ios-caption text-ios-tertiary">{info.unit}</div>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <Button
          variant="plain"
          size="sm"
          leftIcon={<Pencil size={14} />}
          disabled={!editable}
          onClick={onEdit}
          title={editable ? 'Bearbeiten' : 'Nur Admin'}
        >
          Bearbeiten
        </Button>
        <Button
          variant="plain"
          size="sm"
          leftIcon={<Trash2 size={14} />}
          disabled={!editable || busy}
          onClick={() => void remove()}
          className="text-ios-red hover:bg-ios-red/10"
        >
          Löschen
        </Button>
      </div>
    </li>
  );
}

function DeliveryEditForm({
  delivery,
  info,
  onSaved,
  onCancel,
}: {
  delivery: DeliveryRead;
  info: RegisterIndex;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(delivery.amount.replace('.', ','));
  const [date, setDate] = useState(delivery.delivery_date);
  const [note, setNote] = useState(delivery.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doSave(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { delivery_date: date, note: note || null };
      if (amount !== delivery.amount.replace('.', ',')) {
        body['amount'] = parseDe(amount);
      }
      await api.patch(`/deliveries/${delivery.id}`, body);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void doSave();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="text-ios-footnote text-ios-tertiary">
        {info.mpName} · {info.label} ({info.unit})
      </div>
      <TextField
        label={`Menge (${info.unit})`}
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputClassName="font-rounded"
      />
      <TextField
        label="Lieferdatum"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <TextField
        label="Notiz"
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={error}
      />
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

function isCorrection(reading: ReadingRead): boolean {
  return (reading.note ?? '').trim().toLowerCase().startsWith('bestandskorrektur');
}

function canEdit(me: Me, reading: ReadingRead): boolean {
  if (me.role === 'admin') return true;
  if (reading.created_by_user_id !== me.id) return false;
  const created = new Date(reading.created_at);
  const ageHours = (Date.now() - created.getTime()) / 3600_000;
  return ageHours <= 24;
}

function csvField(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
