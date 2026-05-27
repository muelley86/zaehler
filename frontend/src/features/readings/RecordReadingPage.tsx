import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Check, Gauge, ImageIcon, QrCode, X } from 'lucide-react';

import {
  Button,
  EmptyState,
  LargeTitle,
  Pill,
  Section,
  Select,
  TextField,
  TypeBadge,
} from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api, isPlausibilityWarning } from '@/lib/api';
import { formatDateTimeDe, formatDe, localInputToIso, nowForInput, parseDe } from '@/lib/format';
import { tryGetDeviceLocation } from '@/lib/geo';
import { describeMeterType } from '@/lib/meterLabels';
import type {
  DeliveryRead,
  MeasuringPointRead,
  QrTokenResolveResponse,
  ReadingRead,
  RegisterRead,
  RegisterStateRead,
} from '@/lib/types';
import { cx } from '@/components/ui/cx';

// Lazy-Load: der QR-Scanner zieht ``html5-qrcode`` nach (~70 KB) und wird
// nur beim ersten Tap auf "Scannen" tatsächlich geladen.
const QrScanSheet = lazy(() =>
  import('@/features/scanner/QrScanSheet').then((m) => ({ default: m.QrScanSheet })),
);
const TokenAssignSheet = lazy(() =>
  import('@/features/scanner/TokenAssignSheet').then((m) => ({ default: m.TokenAssignSheet })),
);

type Mode = 'reading' | 'delivery';

interface ActiveRegister {
  meterId: number;
  register: RegisterRead;
}

function activeRegistersOf(mp: MeasuringPointRead): ActiveRegister[] {
  const out: ActiveRegister[] = [];
  for (const meter of mp.physical_meters) {
    if (meter.removed_at !== null) continue;
    for (const r of meter.registers) {
      if (r.is_active) out.push({ meterId: meter.id, register: r });
    }
  }
  return out;
}

export function RecordReadingPage() {
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [stateByRegister, setStateByRegister] = useState<Map<number, RegisterStateRead>>(
    () => new Map(),
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mpId, setMpId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('reading');
  // QR-/URL-Param-Hinweis ("?mp=42 nicht gefunden" oder Token-Probleme).
  // Einmaliger Toast, der nach Anzeige automatisch verworfen wird.
  const [paramWarning, setParamWarning] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  // Sheet zum Zuordnen eines noch unzugeordneten Tokens (für Admin und
  // Recorder mit can_assign_qr_tokens-Flag).
  const [assignToken, setAssignToken] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then(setPoints)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setLoadError(err.problem.detail ?? err.problem.title);
      });
  }, []);

  // Letzte Stände aller MPs nachladen — wir brauchen sie für die
  // Plausibilitäts-Deltas pro Register.
  const refreshStates = (current: MeasuringPointRead[] | null) => {
    if (!current) return;
    void Promise.all(
      current.map((mp) =>
        api
          .get<RegisterStateRead[]>(`/measuring-points/${mp.id}/state`)
          .catch(() => [] as RegisterStateRead[]),
      ),
    ).then((results) => {
      const next = new Map<number, RegisterStateRead>();
      for (const list of results) {
        for (const s of list) next.set(s.register_id, s);
      }
      setStateByRegister(next);
    });
  };

  useEffect(() => {
    refreshStates(points);
  }, [points]);

  // Token-Pfad: wenn ?token=X gesetzt ist, beim Backend auflösen.
  // - assigned MP → setMpId, URL aufräumen
  // - unassigned + can_assign → Assign-Modal öffnen, URL aufräumen
  // - unassigned + !can_assign → Hinweis "Bitte Admin um Zuordnung bitten"
  // - 404 → Hinweis "ungültiger QR-Code"
  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam === null) return;

    const next = new URLSearchParams(searchParams);
    next.delete('token');

    api
      .get<QrTokenResolveResponse>(`/qr-tokens/${tokenParam}/resolve`)
      .then((resolved) => {
        if (resolved.measuring_point_id !== null) {
          setMpId(resolved.measuring_point_id);
        } else if (resolved.can_assign) {
          setAssignToken(tokenParam);
        } else {
          setParamWarning(
            'Dieser QR-Code ist noch keiner Messstelle zugeordnet — bitte den Admin um die Zuordnung bitten.',
          );
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setParamWarning('Ungültiger QR-Code — keine Zuordnung gefunden.');
        } else {
          setParamWarning('QR-Code konnte nicht aufgelöst werden.');
        }
      })
      .finally(() => setSearchParams(next, { replace: true }));
  }, [searchParams, setSearchParams]);

  // MP-Auswahl: URL-Param ?mp= hat IMMER Priorität (auch wenn der User schon
  // eine andere MP gewählt hat — typisch nach einem QR-Scan, der per
  // navigate() den Param setzt während wir bereits auf /erfassen sind).
  // Der Param wird nach Anwendung aus der URL entfernt, damit er beim
  // nächsten manuellen Wechsel nicht zurückspringt.
  useEffect(() => {
    if (!points) return;

    const mpParam = searchParams.get('mp');
    if (mpParam !== null) {
      const parsed = Number.parseInt(mpParam, 10);
      const target = Number.isFinite(parsed)
        ? (points.find((mp) => mp.id === parsed) ?? null)
        : null;
      if (target && activeRegistersOf(target).length > 0) {
        setMpId(target.id);
      } else {
        setParamWarning(
          target
            ? `Messstelle „${target.name}" hat keine aktiven Register.`
            : `Messstelle mit ID ${mpParam} wurde nicht gefunden.`,
        );
      }
      const next = new URLSearchParams(searchParams);
      next.delete('mp');
      setSearchParams(next, { replace: true });
      return;
    }

    // Default: erste MP mit aktiven Registern, falls noch keine ausgewählt
    if (mpId !== null && points.some((mp) => mp.id === mpId)) return;
    const first = points.find((mp) => activeRegistersOf(mp).length > 0);
    if (first) setMpId(first.id);
  }, [points, mpId, searchParams, setSearchParams]);

  // Stabiler Close-Callback — verhindert, dass der QrScanSheet-Effect bei
  // jedem Parent-Re-Render neu startet (sonst neuer getUserMedia-Aufruf
  // und damit neuer Permission-Prompt).
  const handleScannerClose = useCallback(() => setScannerOpen(false), []);

  const selectedMP = useMemo(
    () => (points && mpId !== null ? (points.find((mp) => mp.id === mpId) ?? null) : null),
    [points, mpId],
  );
  const selectedRegisters = useMemo(
    () => (selectedMP ? activeRegistersOf(selectedMP) : []),
    [selectedMP],
  );
  const deliveryRegisters = useMemo(
    () => selectedRegisters.filter((ar) => ar.register.accepts_deliveries),
    [selectedRegisters],
  );

  if (!points) {
    return (
      <PageContainer>
        <LargeTitle title="Erfassen" />
        <div className="text-tertiary">Lade…</div>
        {loadError ? (
          <div className="border-danger/40 bg-danger/10 mt-3 rounded-card border-hairline p-3 text-caption text-danger">
            {loadError}
          </div>
        ) : null}
      </PageContainer>
    );
  }

  const recordableMPs = points.filter((mp) => activeRegistersOf(mp).length > 0);
  if (recordableMPs.length === 0) {
    return (
      <PageContainer>
        <LargeTitle title="Erfassen" />
        <EmptyState
          icon={<Gauge size={32} />}
          title="Keine aktiven Register"
          description="Lege zuerst eine Messstelle an."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-5">
        <LargeTitle title="Erfassen" />

        {paramWarning ? (
          <div
            data-testid="record-param-warning"
            className="border-warning/40 bg-warning/10 flex items-start justify-between gap-3 rounded-card border-hairline p-3 text-caption text-secondary"
            style={{ borderColor: 'var(--gas)' }}
          >
            <span>{paramWarning}</span>
            <button
              type="button"
              onClick={() => setParamWarning(null)}
              className="font-semibold text-primary-deep hover:underline"
              aria-label="Hinweis schließen"
            >
              OK
            </button>
          </div>
        ) : null}

        <Section header="Messstelle">
          <div className="p-5">
            <div className="flex items-stretch gap-2">
              <div className="flex-1">
                <Select value={mpId ?? ''} onChange={(e) => setMpId(Number(e.target.value))}>
                  {recordableMPs.map((mp) => (
                    <option key={mp.id} value={mp.id}>
                      {mp.name}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                aria-label="QR-Code scannen"
                title="QR-Code scannen"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border-hairline border-border bg-fill text-secondary transition-colors hover:bg-fill-strong hover:text-label"
              >
                <QrCode size={20} />
              </button>
            </div>
            {selectedMP ? (
              <div className="mt-3 flex items-center gap-2.5 text-caption text-tertiary">
                <TypeBadge type={selectedMP.type} size="sm" />
                <span>{describeMeterType(selectedMP.type, selectedMP.heating_source)}</span>
                {selectedMP.location_name ? <span>· {selectedMP.location_name}</span> : null}
              </div>
            ) : null}
            {selectedMP && selectedMP.transformer_factor !== null ? (
              <div className="border-primary/40 mt-3 rounded-card border-hairline bg-primary-soft p-3 text-caption text-primary-deep">
                Wandlerfaktor ×{selectedMP.transformer_factor} — gib hier den Sekundärwert vom
                Zähler ein. Verbräuche werden mit diesem Faktor multipliziert.
              </div>
            ) : null}
          </div>
        </Section>

        {deliveryRegisters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill active={mode === 'reading'} onClick={() => setMode('reading')}>
              Stände
            </Pill>
            <Pill active={mode === 'delivery'} onClick={() => setMode('delivery')}>
              Lieferung
            </Pill>
          </div>
        ) : null}

        {selectedMP ? (
          mode === 'reading' ? (
            <ReadingsForm
              mp={selectedMP}
              registers={selectedRegisters}
              stateByRegister={stateByRegister}
              onSaved={() => refreshStates(points)}
            />
          ) : (
            <DeliveryForm registers={deliveryRegisters} onSaved={() => refreshStates(points)} />
          )
        ) : null}

        <Suspense fallback={null}>
          {scannerOpen ? <QrScanSheet open={scannerOpen} onClose={handleScannerClose} /> : null}
        </Suspense>
        <Suspense fallback={null}>
          {assignToken !== null ? (
            <TokenAssignSheet
              token={assignToken}
              measuringPoints={recordableMPs}
              onAssigned={(mpAssignedId) => {
                setMpId(mpAssignedId);
                setAssignToken(null);
              }}
              onClose={() => setAssignToken(null)}
            />
          ) : null}
        </Suspense>
      </div>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Stände-Formular: alle aktiven Register einer MP gleichzeitig erfassen.
// ---------------------------------------------------------------------------

function ReadingsForm({
  mp,
  registers,
  stateByRegister,
  onSaved,
}: {
  mp: MeasuringPointRead;
  registers: ActiveRegister[];
  stateByRegister: Map<number, RegisterStateRead>;
  onSaved: () => void;
}) {
  // Pro MP eigene Form-State, damit Wechsel der MP die Eingaben löscht.
  const [values, setValues] = useState<Record<number, string>>({});
  const [readingAt, setReadingAt] = useState(nowForInput());
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  // Reset, wenn die MP wechselt.
  useEffect(() => {
    setValues({});
    setReadingAt(nowForInput());
    setNote('');
    setPhoto(null);
    setSuccess(null);
    setError(null);
    setPhotoWarning(null);
  }, [mp.id]);

  // Stabile Referenz, damit React.memo in RegisterRow greift und nur die
  // tatsächlich getippte Zeile re-rendert (wichtig bei mehreren Registern).
  const setValue = useCallback((registerId: number, v: string) => {
    setValues((prev) => ({ ...prev, [registerId]: v }));
  }, []);

  async function postOne(
    registerId: number,
    numeric: string,
    acknowledge: boolean,
  ): Promise<ReadingRead> {
    return api.post<ReadingRead>('/readings', {
      register_id: registerId,
      value: numeric,
      reading_at: localInputToIso(readingAt),
      note: note || null,
      acknowledge_warnings: acknowledge,
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setPhotoWarning(null);
    const filled = registers
      .map((ar) => ({
        ar,
        raw: (values[ar.register.id] ?? '').trim(),
      }))
      .filter((x) => x.raw !== '');
    if (filled.length === 0) {
      setError('Bitte mindestens einen Wert eingeben.');
      return;
    }
    setBusy(true);
    let savedCount = 0;
    const savedIds: number[] = [];
    try {
      for (const { ar, raw } of filled) {
        let numeric: string;
        try {
          numeric = parseDe(raw);
        } catch (err) {
          if (err instanceof RangeError) {
            throw new Error(`${ar.register.label}: ${err.message}`);
          }
          throw err;
        }
        let saved: ReadingRead | null = null;
        try {
          saved = await postOne(ar.register.id, numeric, false);
        } catch (err) {
          if (err instanceof ApiError && isPlausibilityWarning(err)) {
            const detail = err.problem.detail ?? err.problem.title;
            const ok = window.confirm(
              `${ar.register.label} (${ar.register.obis_code}): ${detail}\n\nTrotzdem speichern?`,
            );
            if (!ok) continue;
            saved = await postOne(ar.register.id, numeric, true);
          } else {
            throw err;
          }
        }
        if (saved !== null) {
          savedCount += 1;
          savedIds.push(saved.id);
        }
      }
      // Foto-Upload für alle erfolgreich gespeicherten Readings dieses
      // Submits. Läuft NACH den Reading-POSTs (CLAUDE.md: "Foto-Uploads
      // NICHT in der DB-Transaktion"), und blockt nicht den Erfolgs-Toast:
      // wenn das Foto scheitert, bleibt der Stand erhalten, der User
      // bekommt eine separate Warnung.
      let photoUploaded = 0;
      let gpsWasMissing = false;
      if (photo && savedIds.length > 0) {
        // Browser-Position einmalig als Fallback holen — Backend
        // bevorzugt EXIF-GPS und nutzt diese Werte nur, wenn das Foto
        // keine GPS-Tags hat (typisch fuer iOS-capture-Aufnahmen).
        const fallbackGps = await tryGetDeviceLocation();
        if (!fallbackGps) gpsWasMissing = true;
        for (const id of savedIds) {
          const fd = new FormData();
          fd.append('photo', photo);
          if (fallbackGps) {
            fd.append('gps_lat', String(fallbackGps.lat));
            fd.append('gps_lon', String(fallbackGps.lon));
          }
          try {
            await api.upload<ReadingRead>(`/readings/${id}/photo`, fd);
            photoUploaded += 1;
          } catch (err) {
            const reason =
              err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'unbekannt';
            setPhotoWarning(
              `Foto konnte nicht hochgeladen werden (${reason}). Du kannst es später im Bearbeiten-Dialog nachreichen.`,
            );
            break;
          }
        }
      }
      if (savedCount > 0) {
        const baseMsg =
          savedCount === 1
            ? '1 Stand gespeichert.'
            : `${savedCount} Stände gespeichert (${formatDateTimeDe(readingAt)}).`;
        setSuccess(photoUploaded > 0 ? `${baseMsg} Foto angehängt.` : baseMsg);
        // Hinweis, wenn der Standort weder per EXIF noch ueber das Geraet
        // bestimmt werden konnte — z.B. weil der User Standort-Zugriff
        // verweigert hat. Der Upload selbst war erfolgreich.
        if (photoUploaded > 0 && gpsWasMissing) {
          setPhotoWarning(
            'Foto hochgeladen, aber kein Standort verfügbar (Browser-Standort verweigert oder kein GPS im Foto).',
          );
        }
        setValues({});
        setNote('');
        setPhoto(null);
        onSaved();
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof Error) setError(err.message);
      else setError('Konnte Eintrag nicht speichern.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 pb-44 md:pb-8">
      <Section header="Stände">
        <div className="space-y-4 p-5">
          {registers.map((ar) => {
            const state = stateByRegister.get(ar.register.id) ?? null;
            return (
              <RegisterRow
                key={ar.register.id}
                register={ar.register}
                state={state}
                value={values[ar.register.id] ?? ''}
                setValue={setValue}
                transformerFactor={mp.transformer_factor}
              />
            );
          })}
        </div>
      </Section>

      <Section header="Zeitpunkt & Notiz">
        <div className="space-y-3 p-5">
          <TextField
            label="Ablesedatum"
            type="datetime-local"
            value={readingAt}
            onChange={(e) => setReadingAt(e.target.value)}
            required
          />
          <TextField
            label="Notiz (optional)"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="Wird auf alle Register dieser Erfassung übernommen."
          />
        </div>
      </Section>

      <Section header="Foto (optional)">
        <div className="p-5">
          <PhotoPicker photo={photo} onChange={setPhoto} />
        </div>
      </Section>

      {error ? (
        <div
          data-testid="record-error"
          className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger"
        >
          {error}
        </div>
      ) : null}
      {photoWarning ? (
        <div
          data-testid="record-photo-warning"
          className="border-warning/40 bg-warning/10 rounded-card border-hairline p-3 text-caption text-secondary"
          style={{ borderColor: 'var(--gas)' }}
        >
          {photoWarning}
        </div>
      ) : null}
      {success ? (
        <div
          data-testid="record-success"
          className="border-success/40 bg-success/10 rounded-card border-hairline p-3 text-caption text-success"
        >
          {success}
        </div>
      ) : null}

      <StickySave busy={busy} disabled={registers.length === 0} />
    </form>
  );
}

function PhotoPicker({
  photo,
  onChange,
}: {
  photo: File | null;
  onChange: (file: File | null) => void;
}) {
  // Zwei separate Inputs: Kamera mit ``capture``, Galerie ohne. Auf
  // iOS-Standalone-PWAs faellt der Picker ohne ``capture`` oft trotzdem
  // direkt auf die Kamera zurueck, statt eine Galerie-Auswahl
  // anzubieten. Mit zwei Inputs entscheidet der User schon per
  // Button-Klick eindeutig.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    onChange(file);
    // Kein "e.target.value = ''" hier — iOS Safari koppelt dann den
    // Blob-Storage des frisch gewaehlten Files ab. Reset erfolgt erst
    // beim naechsten Picker-Aufruf (siehe ``openCamera``/``openGallery``).
  }

  function openCamera() {
    if (!cameraInputRef.current) return;
    cameraInputRef.current.value = '';
    cameraInputRef.current.click();
  }

  function openGallery() {
    if (!galleryInputRef.current) return;
    galleryInputRef.current.value = '';
    galleryInputRef.current.click();
  }

  return (
    <div className="space-y-3">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        className="hidden"
        data-testid="record-photo-camera-input"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="hidden"
        data-testid="record-photo-gallery-input"
      />
      {previewUrl ? (
        <div className="flex items-center gap-3">
          <img
            src={previewUrl}
            alt="Vorschau"
            className="h-24 w-24 rounded-card border-hairline border-border object-cover"
          />
          <div className="flex flex-1 flex-col gap-2">
            <div className="text-caption text-tertiary">
              {photo?.name} · {photo ? Math.round(photo.size / 1024) : 0} KB
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="bordered"
                size="sm"
                leftIcon={<Camera size={14} />}
                onClick={openCamera}
              >
                Neu aufnehmen
              </Button>
              <Button
                type="button"
                variant="bordered"
                size="sm"
                leftIcon={<ImageIcon size={14} />}
                onClick={openGallery}
              >
                Aus Galerie
              </Button>
              <Button
                type="button"
                variant="plain"
                size="sm"
                leftIcon={<X size={14} />}
                onClick={() => onChange(null)}
                className="text-danger"
              >
                Entfernen
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="bordered"
            leftIcon={<Camera size={16} />}
            onClick={openCamera}
          >
            Foto aufnehmen
          </Button>
          <Button
            type="button"
            variant="bordered"
            leftIcon={<ImageIcon size={16} />}
            onClick={openGallery}
          >
            Aus Galerie
          </Button>
        </div>
      )}
    </div>
  );
}

// React.memo: rendert nur, wenn sich Props effektiv ändern. Zusammen mit
// useCallback(setValue, []) und useMemo für die Delta-Berechnung sorgt das
// dafür, dass beim Tippen in Feld 1 nur dessen RegisterRow re-rendert.
const RegisterRow = memo(function RegisterRow({
  register,
  state,
  value,
  setValue,
  transformerFactor,
}: {
  register: RegisterRead;
  state: RegisterStateRead | null;
  value: string;
  setValue: (registerId: number, v: string) => void;
  transformerFactor: number | null;
}) {
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setValue(register.id, e.target.value),
    [setValue, register.id],
  );

  const { delta, negative } = useMemo(() => {
    let parsed: number | null;
    try {
      parsed = value.trim() === '' ? null : Number(parseDe(value));
    } catch {
      parsed = null;
    }
    const lastValue = state?.last_reading_value ? Number(state.last_reading_value) : null;
    const rawDelta = parsed !== null && lastValue !== null ? parsed - lastValue : null;
    const d =
      rawDelta !== null && transformerFactor !== null ? rawDelta * transformerFactor : rawDelta;
    const neg = d !== null && d < 0 && !register.accepts_deliveries;
    return { delta: d, negative: neg };
  }, [value, state, transformerFactor, register.accepts_deliveries]);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-body font-semibold text-label">{register.label}</span>
        <code className="num rounded-badge bg-fill px-1.5 py-0.5 text-caption text-tertiary">
          {register.obis_code}
        </code>
        <span className="text-caption text-tertiary">
          letzter Stand:{' '}
          {state?.last_reading_value
            ? `${formatDe(state.last_reading_value)} ${register.unit}`
            : '—'}
          {state?.last_reading_at ? ` · ${formatDateTimeDe(state.last_reading_at)}` : ''}
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        <TextField
          label={register.unit}
          type="text"
          inputMode="decimal"
          pattern="[0-9.,]+"
          value={value}
          onChange={onChange}
          placeholder="leer = nicht erfassen"
          numeric
          inputClassName="text-headline"
        />
      </div>
      {delta !== null ? (
        <div
          className={cx(
            'mx-auto w-fit rounded-full px-3 py-1 text-caption font-semibold',
            negative ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success',
          )}
        >
          {negative ? '⚠ ' : '+'}
          {formatDe(delta)} {register.unit}
        </div>
      ) : null}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Lieferungs-Formular: ein Register + Menge + Zeitpunkt.
// ---------------------------------------------------------------------------

function DeliveryForm({
  registers,
  onSaved,
}: {
  registers: ActiveRegister[];
  onSaved: () => void;
}) {
  const [registerId, setRegisterId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [deliveryAt, setDeliveryAt] = useState(nowForInput());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (registers.length === 0) {
      setRegisterId(null);
      return;
    }
    if (!registers.some((ar) => ar.register.id === registerId)) {
      const first = registers[0];
      if (first) setRegisterId(first.register.id);
    }
  }, [registers, registerId]);

  const selected = registers.find((ar) => ar.register.id === registerId) ?? null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (registerId === null) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const numeric = parseDe(amount);
      const created = await api.post<DeliveryRead>(`/registers/${registerId}/deliveries`, {
        amount: numeric,
        delivery_at: localInputToIso(deliveryAt),
        note: note || null,
      });
      setSuccess(
        `Lieferung erfasst: ${formatDe(created.amount)} (${formatDateTimeDe(created.delivery_at)}).`,
      );
      setAmount('');
      setNote('');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Konnte Lieferung nicht erfassen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 pb-44 md:pb-8">
      <Section header="Lieferung">
        <div className="space-y-3 p-5">
          {registers.length > 1 ? (
            <Select
              label="Register"
              value={registerId ?? ''}
              onChange={(e) => setRegisterId(Number(e.target.value))}
            >
              {registers.map((ar) => (
                <option key={ar.register.id} value={ar.register.id}>
                  {ar.register.label} ({ar.register.unit})
                </option>
              ))}
            </Select>
          ) : null}
          <TextField
            label={`Menge (${selected?.register.unit ?? ''})`}
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]+"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            numeric
            inputClassName="text-headline"
          />
          <TextField
            label="Lieferdatum"
            type="datetime-local"
            value={deliveryAt}
            onChange={(e) => setDeliveryAt(e.target.value)}
            required
          />
          <TextField
            label="Notiz (optional)"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Section>

      {error ? (
        <div
          data-testid="record-error"
          className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          data-testid="record-success"
          className="border-success/40 bg-success/10 rounded-card border-hairline p-3 text-caption text-success"
        >
          {success}
        </div>
      ) : null}

      <StickySave busy={busy} disabled={registerId === null} />
    </form>
  );
}

function StickySave({ busy, disabled }: { busy: boolean; disabled: boolean }) {
  return (
    <div className="glass fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-0 right-0 z-30 border-t-hairline border-border bg-surface-high px-4 py-3 md:static md:bottom-auto md:border-0 md:bg-transparent md:p-0 md:pt-2">
      <Button
        type="submit"
        variant="filled"
        size="lg"
        fullWidth
        leftIcon={<Check size={18} />}
        disabled={busy || disabled}
      >
        {busy ? 'Speichere…' : 'Speichern'}
      </Button>
    </div>
  );
}

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 p-4 md:p-7">{children}</div>
    </div>
  );
}
