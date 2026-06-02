import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Camera, Download, ImageIcon, Pencil, Search, Trash2, X } from 'lucide-react';

import { useAuth } from '@/features/auth/auth-context';
import { PhotoLightbox } from '@/features/readings/PhotoLightbox';
import {
  Button,
  EmptyState,
  LargeTitle,
  Pill,
  Section,
  Sheet,
  TextField,
  TypeBadge,
} from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api, isPlausibilityWarning } from '@/lib/api';
import {
  formatDateDe,
  formatDateTimeDe,
  formatDateTimeSecDe,
  formatDe,
  localInputToIso,
  parseDe,
  toInputDateTime,
} from '@/lib/format';
import { tryGetDeviceLocation } from '@/lib/geo';
import type {
  DeliveryRead,
  Me,
  MeasuringPointRead,
  MeterType,
  ReadingPhotoRead,
  ReadingRead,
} from '@/lib/types';
import { cx } from '@/components/ui/cx';

import { TYPE_LABELS } from '@/lib/meterLabels';

type ItemKind = 'reading' | 'correction' | 'delivery';

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
  transformerFactor: number | null;
}

type EditTarget =
  | { kind: 'reading'; reading: ReadingRead; info: RegisterIndex }
  | { kind: 'delivery'; delivery: DeliveryRead; info: RegisterIndex };

type Item =
  | {
      kind: 'reading' | 'correction';
      day: string;
      date: string;
      info: RegisterIndex;
      reading: ReadingRead;
      sortKey: string;
    }
  | {
      kind: 'delivery';
      day: string;
      date: string;
      info: RegisterIndex;
      delivery: DeliveryRead;
      sortKey: string;
    };

export function ReadingsListPage() {
  const { me } = useAuth();
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [readings, setReadings] = useState<ReadingRead[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    id: number;
    photos: ReadingPhotoRead[];
  } | null>(null);

  const [locationFilter, setLocationFilter] = useState<Set<number | null>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<MeterType>>(new Set());
  const [mpFilter, setMpFilter] = useState<Set<number>>(new Set());
  const [obisFilter, setObisFilter] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  // Verzögerter Filterwert — die Filterung läuft 250 ms nach dem letzten
  // Tastendruck statt nach jedem Zeichen. Das Eingabefeld selbst zeigt
  // weiterhin sofort den aktuellen `search`-Wert, nur die teure Filter-
  // Pipeline (über tausende Readings) wird debounced.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<Set<ItemKind>>(new Set());

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then(setPoints)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const readingParams = new URLSearchParams();
    readingParams.set('limit', '5000');
    if (from) readingParams.set('from_at', `${from}T00:00:00`);
    if (to) readingParams.set('to_at', `${to}T23:59:59`);
    api
      .get<ReadingRead[]>(`/readings?${readingParams}`, controller.signal)
      .then(setReadings)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
    const deliveryParams = new URLSearchParams();
    deliveryParams.set('limit', '5000');
    if (from) deliveryParams.set('from_date', from);
    if (to) deliveryParams.set('to_date', to);
    api
      .get<DeliveryRead[]>(`/deliveries?${deliveryParams}`, controller.signal)
      .then(setDeliveries)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
    return () => controller.abort();
  }, [from, to, tick]);

  // Stabile Referenz für memoizierte Item-Komponenten.
  const refresh = useCallback(() => setTick((t) => t + 1), []);

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
            transformerFactor: mp.transformer_factor,
          });
        }
      }
    }
    return index;
  }, [points]);

  // Vorwert pro Reading-ID (chronologisch im selben Register).
  const prevValueByReading = useMemo<Map<number, number | null>>(() => {
    const byRegister = new Map<number, ReadingRead[]>();
    for (const r of readings) {
      const list = byRegister.get(r.register_id) ?? [];
      list.push(r);
      byRegister.set(r.register_id, list);
    }
    const out = new Map<number, number | null>();
    for (const list of byRegister.values()) {
      list.sort((a, b) => a.reading_at.localeCompare(b.reading_at));
      let prev: number | null = null;
      for (const r of list) {
        out.set(r.id, prev);
        prev = Number(r.value);
      }
    }
    return out;
  }, [readings]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const r of readings) {
      const info = registerIndex.get(r.register_id);
      if (!info) continue;
      out.push({
        kind: isCorrection(r) ? 'correction' : 'reading',
        day: toLocalDayKey(new Date(r.reading_at)),
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
        day: toLocalDayKey(new Date(d.delivery_at)),
        date: d.delivery_at,
        info,
        delivery: d,
        sortKey: `${d.delivery_at}-${String(d.id).padStart(8, '0')}`,
      });
    }
    out.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    return out;
  }, [readings, deliveries, registerIndex]);

  const filtered = useMemo(() => {
    const needle = debouncedSearch ? debouncedSearch.toLowerCase() : '';
    return items.filter((item) => {
      const { info } = item;
      if (locationFilter.size > 0 && !locationFilter.has(info.locationId)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(info.mpType)) return false;
      if (mpFilter.size > 0 && !mpFilter.has(info.mpId)) return false;
      if (obisFilter.size > 0 && !obisFilter.has(info.obisCode)) return false;
      if (kindFilter.size > 0 && !kindFilter.has(item.kind)) return false;
      if (needle) {
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
  }, [items, locationFilter, typeFilter, mpFilter, obisFilter, debouncedSearch, kindFilter]);

  // Tag-Gruppen für die Anzeige
  const groupedByDay = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of filtered) {
      const arr = groups.get(item.day) ?? [];
      arr.push(item);
      groups.set(item.day, arr);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

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
            formatDateTimeDe(d.delivery_at),
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
            formatDateTimeSecDe(d.created_at),
          ]
            .map(csvField)
            .join(';'),
        );
      } else {
        const r = item.reading;
        lines.push(
          [
            formatDateTimeDe(r.reading_at),
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
            formatDateTimeSecDe(r.created_at),
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
      <PageContainer>
        <LargeTitle title="Erfassungen" />
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      </PageContainer>
    );
  }
  if (!points) {
    return (
      <PageContainer>
        <LargeTitle title="Erfassungen" />
        <div className="text-tertiary">Lade…</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
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

      <Section header="Filter">
        <div className="space-y-3 p-5">
          <TextField
            type="text"
            placeholder="Suchen (Messstelle, Notiz, SN…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            trailing={<Search size={16} className="text-tertiary" />}
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
            <DateInput value={from} onChange={setFrom} aria-label="von" />
            <span className="text-tertiary">—</span>
            <DateInput value={to} onChange={setTo} aria-label="bis" />
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
          {locationFilter.size ||
          typeFilter.size ||
          mpFilter.size ||
          obisFilter.size ||
          from ||
          to ||
          search ||
          kindFilter.size ? (
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
              className="text-caption font-semibold text-primary"
            >
              Filter zurücksetzen
            </button>
          ) : null}
          <div className="text-caption text-tertiary">
            {readings.length} Stände + {deliveries.length} Lieferungen geladen (je max 5000)
          </div>
        </div>
      </Section>

      {filtered.length === 0 ? (
        <EmptyState title="Keine Treffer." />
      ) : (
        <div className="space-y-5">
          {groupedByDay.map(([day, group]) => (
            <Section key={day} header={dayLabel(day)} footer={`${group.length} Einträge`}>
              <ul className="divide-y divide-separator">
                {group.map((item) =>
                  item.kind === 'delivery' ? (
                    <DeliveryItem
                      key={`d-${item.delivery.id}`}
                      delivery={item.delivery}
                      info={item.info}
                      me={me}
                      setEditTarget={setEditTarget}
                      onChanged={refresh}
                    />
                  ) : (
                    <ReadingItem
                      key={`r-${item.reading.id}`}
                      reading={item.reading}
                      info={item.info}
                      kind={item.kind}
                      previous={prevValueByReading.get(item.reading.id) ?? null}
                      me={me}
                      setEditTarget={setEditTarget}
                      onChanged={refresh}
                      onOpenPhoto={setLightboxPhoto}
                    />
                  ),
                )}
              </ul>
            </Section>
          ))}
        </div>
      )}

      <Sheet
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget?.kind === 'delivery' ? 'Lieferung bearbeiten' : 'Erfassung bearbeiten'}
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

      {lightboxPhoto !== null ? (
        <PhotoLightbox
          readingId={lightboxPhoto.id}
          photos={lightboxPhoto.photos}
          onClose={() => setLightboxPhoto(null)}
        />
      ) : null}
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

function DateInput({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (s: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="num rounded-pill border-hairline border-border bg-fill px-3 py-1.5 text-body-sm text-label outline-none focus:border-primary focus:bg-surface-solid"
      {...rest}
    />
  );
}

// React.memo: rendert nur, wenn sich Props effektiv ändern. Mit stabilem
// `setEditTarget` (React garantiert stable setState) und stabilem `onChanged`
// (useCallback im Parent) re-rendert ein Item beim Sheet-Open / Filter-Wechsel
// nur dann, wenn seine eigenen Daten sich geändert haben.
const ReadingItem = memo(function ReadingItem({
  reading,
  info,
  kind,
  previous,
  me,
  setEditTarget,
  onChanged,
  onOpenPhoto,
}: {
  reading: ReadingRead;
  info: RegisterIndex;
  kind: 'reading' | 'correction';
  previous: number | null;
  me: Me | null;
  setEditTarget: (target: EditTarget) => void;
  onChanged: () => void;
  onOpenPhoto: (photo: { id: number; photos: ReadingPhotoRead[] }) => void;
}) {
  const editable = me ? canEdit(me, reading) : false;
  const correction = kind === 'correction';
  const [busy, setBusy] = useState(false);

  const onEdit = useCallback(
    () => setEditTarget({ kind: 'reading', reading, info }),
    [setEditTarget, reading, info],
  );

  const current = Number(reading.value);
  const rawDelta = !correction && previous !== null ? current - previous : null;
  const delta =
    rawDelta !== null && info.transformerFactor !== null
      ? rawDelta * info.transformerFactor
      : rawDelta;

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
    <li className="px-5 py-3.5">
      <div className="flex items-start gap-3">
        <TypeBadge type={info.mpType} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-body font-semibold text-label">{info.mpName}</span>
            <span className="num rounded-badge bg-fill px-1.5 py-0.5 text-caption text-secondary">
              {info.obisCode}
            </span>
            {correction ? (
              <span className="rounded-full bg-[color-mix(in_oklch,var(--gas),transparent_82%)] px-2 py-0.5 text-caption font-semibold text-gas">
                Korrektur
              </span>
            ) : null}
            {reading.photos.length > 0 ? (
              <button
                type="button"
                onClick={() => onOpenPhoto({ id: reading.id, photos: reading.photos })}
                aria-label="Fotos anzeigen"
                title="Fotos anzeigen"
                data-testid="reading-photo-indicator"
                className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-caption text-primary hover:bg-fill-strong"
              >
                <ImageIcon size={12} />
                {reading.photos.length > 1 ? `Fotos (${reading.photos.length})` : 'Foto'}
              </button>
            ) : null}
          </div>
          <div className="num text-caption text-tertiary">
            {formatDateTimeDe(reading.reading_at)} · SN {info.serialNumber}
            {info.locationName ? ` · ${info.locationName}` : ''}
          </div>
          {reading.note ? (
            <div className="mt-1 text-caption text-secondary">{reading.note}</div>
          ) : null}
          <div className="mt-1 text-caption text-tertiary">
            {reading.created_by_username ?? '—'} ·{' '}
            <span className="num">{formatDateTimeDe(reading.created_at)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-headline text-label">{formatDe(reading.value)}</div>
          <div className="text-caption text-tertiary">{info.unit}</div>
          {delta !== null ? (
            <div
              data-testid="reading-row-delta"
              className={cx(
                'num mt-1 text-caption font-semibold',
                delta < 0 ? 'text-danger' : 'text-success',
              )}
            >
              {delta < 0 ? '' : '+'}
              {formatDe(delta)}
            </div>
          ) : null}
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
          className="hover:bg-danger/10 text-danger"
        >
          Löschen
        </Button>
      </div>
    </li>
  );
});

const DeliveryItem = memo(function DeliveryItem({
  delivery,
  info,
  me,
  setEditTarget,
  onChanged,
}: {
  delivery: DeliveryRead;
  info: RegisterIndex;
  me: Me | null;
  setEditTarget: (target: EditTarget) => void;
  onChanged: () => void;
}) {
  const editable = me?.role === 'admin';
  const [busy, setBusy] = useState(false);

  const onEdit = useCallback(
    () => setEditTarget({ kind: 'delivery', delivery, info }),
    [setEditTarget, delivery, info],
  );

  async function remove() {
    if (
      !window.confirm(
        `Lieferung vom ${formatDateTimeDe(delivery.delivery_at)} (${info.mpName}, ${formatDe(delivery.amount)} ${info.unit}) wirklich löschen?`,
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
    <li className="bg-[color-mix(in_oklch,var(--primary),transparent_94%)] px-5 py-3.5">
      <div className="flex items-start gap-3">
        <TypeBadge type={info.mpType} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-body font-semibold text-label">{info.mpName}</span>
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-deep">
              Lieferung
            </span>
          </div>
          <div className="text-caption text-tertiary">
            <span className="num">{formatDateTimeDe(delivery.delivery_at)}</span> · {info.label}
            {info.locationName ? ` · ${info.locationName}` : ''}
          </div>
          {delivery.note ? (
            <div className="mt-1 text-caption text-secondary">{delivery.note}</div>
          ) : null}
          <div className="mt-1 text-caption text-tertiary">
            {delivery.created_by_username ?? '—'} ·{' '}
            <span className="num">{formatDateTimeDe(delivery.created_at)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-headline text-primary">+ {formatDe(delivery.amount)}</div>
          <div className="text-caption text-tertiary">{info.unit}</div>
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
          className="hover:bg-danger/10 text-danger"
        >
          Löschen
        </Button>
      </div>
    </li>
  );
});

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
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [removeIds, setRemoveIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patchOnce(acknowledge: boolean) {
    const body: Record<string, unknown> = {
      reading_at: localInputToIso(readingAt),
      note: note || null,
      acknowledge_warnings: acknowledge,
    };
    if (value !== reading.value.replace('.', ',')) {
      body['value'] = parseDe(value);
    }
    await api.patch(`/readings/${reading.id}`, body);
  }

  async function applyPhotoChange(): Promise<void> {
    for (const pid of removeIds) {
      await api.delete(`/readings/${reading.id}/photos/${pid}`);
    }
    if (pendingPhotos.length > 0) {
      // Fallback fuer EXIF-Strip auf iOS: Browser-Position einmal holen.
      // Backend nutzt sie nur, wenn das EXIF kein GPS hat.
      const fallbackGps = await tryGetDeviceLocation();
      for (const file of pendingPhotos) {
        const fd = new FormData();
        fd.append('photo', file);
        if (fallbackGps) {
          fd.append('gps_lat', String(fallbackGps.lat));
          fd.append('gps_lon', String(fallbackGps.lon));
        }
        await api.upload<ReadingRead>(`/readings/${reading.id}/photos`, fd, 'POST');
      }
    }
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await patchOnce(false);
      await applyPhotoChange();
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && isPlausibilityWarning(err)) {
        const detail = err.problem.detail ?? err.problem.title;
        if (window.confirm(`${detail}\n\nTrotzdem speichern?`)) {
          try {
            await patchOnce(true);
            await applyPhotoChange();
            onSaved();
          } catch (retryErr) {
            if (retryErr instanceof ApiError) {
              setError(retryErr.problem.detail ?? retryErr.problem.title);
            } else {
              setError('Speichern fehlgeschlagen.');
            }
          }
        }
      } else if (err instanceof ApiError) {
        setError(err.problem.detail ?? err.problem.title);
      } else if (err instanceof RangeError) {
        setError(err.message);
      } else {
        setError('Speichern fehlgeschlagen.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div className="text-caption text-tertiary">
        {info.mpName} · <span className="num">{info.obisCode}</span> ({info.unit})
      </div>
      <TextField
        label="Stand"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        numeric
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

      <PhotoEditField
        readingId={reading.id}
        existing={reading.photos}
        pending={pendingPhotos}
        removeIds={removeIds}
        onAdd={(files) => setPendingPhotos((prev) => [...prev, ...files])}
        onRemovePending={(idx) => setPendingPhotos((prev) => prev.filter((_, i) => i !== idx))}
        onToggleExisting={(pid) =>
          setRemoveIds((prev) =>
            prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid],
          )
        }
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

const MAX_PHOTOS_PER_READING = 6;

function PhotoEditField({
  readingId,
  existing,
  pending,
  removeIds,
  onAdd,
  onRemovePending,
  onToggleExisting,
}: {
  readingId: number;
  existing: ReadingPhotoRead[];
  pending: File[];
  removeIds: number[];
  onAdd: (files: File[]) => void;
  onRemovePending: (idx: number) => void;
  onToggleExisting: (photoId: number) => void;
}) {
  // Zwei separate Inputs: ``capture`` zwingt iOS in die Kamera, ohne
  // ``capture`` greift der System-Picker (Mehrfachauswahl).
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  // Aktuelle Gesamtzahl = behaltene Bestands-Fotos + neue.
  const keptExisting = existing.filter((p) => !removeIds.includes(p.id)).length;
  const total = keptExisting + pending.length;
  const full = total >= MAX_PHOTOS_PER_READING;

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    onAdd(Array.from(picked).slice(0, MAX_PHOTOS_PER_READING - total));
  }

  function open(ref: React.RefObject<HTMLInputElement>) {
    if (!ref.current) return;
    ref.current.value = '';
    ref.current.click();
  }

  return (
    <div className="space-y-2">
      <div className="text-caption-bold uppercase text-tertiary">Fotos ({total}/6)</div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => addFiles(e.target.files)}
        className="hidden"
        data-testid="edit-photo-camera-input"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => addFiles(e.target.files)}
        className="hidden"
        data-testid="edit-photo-gallery-input"
      />
      <div className="flex flex-wrap gap-2">
        {existing.map((p) => {
          const markedForRemoval = removeIds.includes(p.id);
          return (
            <div key={p.id} className="relative">
              <img
                src={`/api/v1/readings/${readingId}/photos/${p.id}`}
                alt="Foto"
                className={cx(
                  'h-20 w-20 rounded-card border-hairline border-border object-cover',
                  markedForRemoval && 'opacity-30',
                )}
              />
              <button
                type="button"
                onClick={() => onToggleExisting(p.id)}
                aria-label={markedForRemoval ? 'Doch behalten' : 'Foto entfernen'}
                className={cx(
                  'absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-white shadow',
                  markedForRemoval ? 'bg-secondary' : 'bg-danger',
                )}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
        {pending.map((file, idx) => (
          <PendingThumb key={idx} file={file} onRemove={() => onRemovePending(idx)} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="bordered"
          size="sm"
          leftIcon={<Camera size={14} />}
          onClick={() => open(cameraInputRef)}
          disabled={full}
        >
          Foto aufnehmen
        </Button>
        <Button
          type="button"
          variant="bordered"
          size="sm"
          leftIcon={<ImageIcon size={14} />}
          onClick={() => open(galleryInputRef)}
          disabled={full}
        >
          Aus Galerie
        </Button>
      </div>
    </div>
  );
}

function PendingThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="relative">
      {url ? (
        <img
          src={url}
          alt="Neu"
          className="h-20 w-20 rounded-card border-hairline border-primary object-cover"
        />
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Verwerfen"
        className="absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white shadow"
      >
        <X size={13} />
      </button>
    </div>
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
  // ISO-Z muss in lokale datetime-local-Form konvertiert werden — sonst
  // zeigt das Input-Feld UTC (= 2h Versatz in MESZ).
  const [deliveryAt, setDeliveryAt] = useState(toInputDateTime(delivery.delivery_at));
  const [note, setNote] = useState(delivery.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doSave(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        delivery_at: localInputToIso(deliveryAt),
        note: note || null,
      };
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
      <div className="text-caption text-tertiary">
        {info.mpName} · {info.label} ({info.unit})
      </div>
      <TextField
        label={`Menge (${info.unit})`}
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        numeric
      />
      <TextField
        label="Lieferzeitpunkt"
        type="datetime-local"
        value={deliveryAt}
        onChange={(e) => setDeliveryAt(e.target.value)}
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
      <div className="mb-1.5 text-caption-bold uppercase text-tertiary">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function dayLabel(day: string): string {
  const today = new Date();
  const todayKey = toLocalDayKey(today);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const yKey = toLocalDayKey(yesterday);
  if (day === todayKey) return 'Heute';
  if (day === yKey) return 'Gestern';
  return formatDateDe(day);
}

function toLocalDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
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
  // Schutz gegen CSV-Formel-Injection in Excel/Calc: Werte, die mit
  // ``=``, ``+``, ``-`` oder ``@`` beginnen, werden mit einem Apostroph
  // prefixed, damit Tabellen sie nicht als Formel ausführen.
  let safe = value;
  if (/^[=+\-@]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[;"\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
