/**
 * Modaler QR-Scanner: öffnet die Smartphone-Kamera, dekodiert einen QR-Code
 * mit ``mp=...`` und navigiert in die Erfassungsmaske der Messstelle.
 *
 * Die ``html5-qrcode``-Library wird per dynamischem Import geladen (~70 KB),
 * sodass das Initial-Bundle der App nicht wächst — der Scanner wird nur
 * beim ersten Öffnen geladen.
 *
 * Sicherheits-Invariante: ``parseScannedUrl`` extrahiert ausschließlich die
 * MP-ID; die Origin aus dem QR-Inhalt wird verworfen, damit ein unter-
 * geschobener Fremd-QR keine Cross-Origin-Navigation erzwingen kann.
 *
 * **Wichtig:** Der Camera-Effect hängt nur von ``open`` ab. ``navigate`` und
 * ``onClose`` werden über Refs gespiegelt, damit Parent-Re-Renders den
 * laufenden Stream NICHT neu starten — sonst würde der Browser bei jedem
 * Re-Render erneut nach Kamera-Erlaubnis fragen und der iOS-Privacy-
 * Indikator dauerhaft "blinken".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X } from 'lucide-react';

import { parseScannedUrl } from './parseScannedUrl';

/** Minimaler Subtype der ``html5-qrcode``-API, damit der dynamische Import
 *  TypeScript-strikt bleibt. Wir nutzen nur den Konstruktor + start/stop.
 *  ``qrbox`` darf eine Funktion sein — dann wird sie pro Viewport-Aenderung
 *  aufgerufen und liefert die aktuelle Erkennungsbox in Stream-Pixeln. */
type QrBoxSize = number | { width: number; height: number };
type QrBoxFn = (viewW: number, viewH: number) => QrBoxSize;
// MediaTrackConstraints-Teilmenge — html5-qrcode reicht das Objekt 1:1 an
// ``getUserMedia({ video: ... })`` durch. Wir steuern damit Aufloesung
// und Front-/Rueckkamera-Wahl.
type VideoConstraints = {
  facingMode?: string | { exact: string } | { ideal: string };
  width?: number | { ideal?: number; min?: number; max?: number };
  height?: number | { ideal?: number; min?: number; max?: number };
};
interface Html5QrcodeInstance {
  start(
    cameraConfig: VideoConstraints | string,
    config: {
      fps: number;
      qrbox?: QrBoxSize | QrBoxFn;
      aspectRatio?: number;
      // Aufloesungs-Hints gehoeren hierher und NICHT ins erste Argument
      // (das akzeptiert nur 1 Key — ``facingMode`` ODER ``deviceId``).
      videoConstraints?: VideoConstraints;
      // BarcodeDetector-API in Chromium-Browsern nutzen — deutlich
      // schneller und robuster als die ZXing-JS-Pipeline. Auf Safari
      // ohne Effekt (kein API-Support, Fallback auf ZXing).
      experimentalFeatures?: { useBarCodeDetectorIfSupported?: boolean };
    },
    onSuccess: (decodedText: string) => void,
    onError?: (errorMessage: string) => void,
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

interface Html5QrcodeConstructor {
  new (elementId: string, verbose?: boolean): Html5QrcodeInstance;
}

const READER_ID = 'qr-scanner-reader';

/** iPhone Chrome erkennen — User-Agent enthaelt ``CriOS``. iOS Chrome
 *  nutzt zwar WKWebView (selbe Engine wie Safari), erbt aber bekannte
 *  Camera-Pipeline-Quirks: Permission ist erteilt, aber das Video-
 *  Frame bleibt schwarz. Kein App-Code-Fix moeglich; wir zeigen dem
 *  User einen Hinweis-Banner, dass er auf Safari ausweichen soll. */
function isIphoneChrome(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /CriOS\//.test(ua) && /iPhone|iPad|iPod/.test(ua);
}

interface QrScanSheetProps {
  open: boolean;
  onClose: () => void;
}

export function QrScanSheet({ open, onClose }: QrScanSheetProps) {
  const navigate = useNavigate();
  const instanceRef = useRef<Html5QrcodeInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Diagnose-Hinweis: wenn die Library einen QR dekodiert, aber das
  // Format nicht zu Token/MP passt, zeigen wir den dekodierten Text
  // kurz an. So sieht der User, ob die Kamera ueberhaupt etwas
  // erkennt — und an welchem Format-Quirk es klemmt (z. B. veraltete
  // PWA mit altem parseScannedUrl-Code).
  const [unknownDecoded, setUnknownDecoded] = useState<string | null>(null);
  const unknownTimeoutRef = useRef<number | null>(null);

  // Refs für Callbacks, die der Parent pro Render möglicherweise neu erzeugt.
  // Damit bleibt der Camera-Effect unabhängig vom Render-Zyklus stabil.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Stop & clear in einem zentralen Helper, damit Unmount, manueller Close
  // und Erfolgs-Pfad alle dieselbe Cleanup-Sequenz verwenden.
  const teardown = useCallback(async () => {
    const inst = instanceRef.current;
    instanceRef.current = null;
    if (!inst) return;
    try {
      await inst.stop();
    } catch {
      /* stop() wirft, wenn es nie startete — ignorieren */
    }
    try {
      inst.clear();
    } catch {
      /* clear() wirft selten, ebenfalls unkritisch */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    void (async () => {
      try {
        const mod = (await import('html5-qrcode')) as unknown as {
          Html5Qrcode: Html5QrcodeConstructor;
        };
        if (cancelled) return;

        const instance = new mod.Html5Qrcode(READER_ID);
        instanceRef.current = instance;

        await instance.start(
          // html5-qrcode erlaubt im ersten Argument EXAKT 1 Key
          // (``facingMode`` oder ``deviceId``). Aufloesungs-Hints
          // muessen ueber ``configuration.videoConstraints`` gesetzt
          // werden — sonst wirft die Library zur Laufzeit
          // „'cameraIdOrConfig' object should have exactly 1 key, found
          // 3 keys" und der Scanner startet nie (gemeldet 2026-05-28).
          { facingMode: 'environment' },
          {
            // 15 fps statt 25 — defensiver, verlaesslicher First-Frame
            // auf iOS; QR-Decoding braucht keine 25 Hz.
            fps: 15,
            // qrbox 65 % — kleinerer Suchbereich zwingt den User, den
            // QR mittiger zu halten, und gibt dem Decoder mehr effektive
            // Pixel pro Modul auf kleinen gedruckten Codes (Avery L6008
            // 10 mm). 85 % war zu grosszuegig und liess kleine Codes
            // im Suchraum verschwinden.
            qrbox: (viewW, viewH) => {
              const side = Math.floor(Math.min(viewW, viewH) * 0.65);
              return { width: side, height: side };
            },
            // HD-Aufloesung anfordern, damit Avery-L6008 (10 mm gedruckt)
            // genug Pixel auf der Decode-Region bekommt. ``ideal`` ohne
            // ``min`` — iOS Safari rejected sonst stumm, wenn die
            // Rueckkamera gerade keinen passenden Modus anbietet.
            // aspectRatio bewusst ungesetzt — iPhone-Rueckkameras
            // liefern nativ 4:3 / 16:9; ein hartes 1:1 hat auf iOS
            // WebKit zu stummen schwarzen Frames gefuehrt.
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            // Native BarcodeDetector-API auf Chromium-Browsern (Desktop
            // Chrome/Edge, Android Chrome) statt ZXing-JS-Fallback —
            // signifikant schnellere und robustere Erkennung von
            // kleinen oder leicht verkippten QR-Codes. Auf Safari
            // ohne Effekt.
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          },
          (decodedText) => {
            const result = parseScannedUrl(decodedText);
            if (!result) {
              // Kein passender QR-Inhalt — weiter scannen, kein Modal-Close.
              // Wir zeigen aber kurz den dekodierten Text als Diagnose-
              // Toast, damit der User sieht, was tatsaechlich gescannt
              // wurde (z. B. altes Token-Format aus PWA-Cache).
              const preview =
                decodedText.length > 60 ? decodedText.slice(0, 60) + '…' : decodedText;
              setUnknownDecoded(preview);
              if (unknownTimeoutRef.current !== null) {
                window.clearTimeout(unknownTimeoutRef.current);
              }
              unknownTimeoutRef.current = window.setTimeout(() => {
                setUnknownDecoded(null);
                unknownTimeoutRef.current = null;
              }, 3000);
              return;
            }
            // Stop-Sequenz fire-and-forget: navigate löst Unmount aus, und
            // useEffect-Cleanup räumt parallel auf. Wir warten nicht auf
            // ``stop()``, damit der UX-Übergang sofort passiert.
            void teardown();
            // Token-Pfad: zur Erfassungsmaske mit ?token=, dort wird per
            // resolve aufgelöst. Legacy-MP-Pfad: direkt mit ?mp=.
            const target =
              result.kind === 'token'
                ? `/erfassen?token=${result.token}`
                : `/erfassen?mp=${result.mp}`;
            navigateRef.current(target);
            onCloseRef.current();
          },
          () => {
            /* Pro Frame ohne Treffer — bewusst keine Logs. */
          },
        );
        if (cancelled) {
          void teardown();
          return;
        }
        setStarting(false);

        // Continuous-AutoFocus erzwingen — iOS Safari startet die
        // Rueckkamera ueber ``getUserMedia`` mit Fixed-Focus, weshalb
        // kleine QRs aus 5–10 cm unscharf bleiben (native iOS-Camera-
        // App nutzt continuous AF und erkennt dieselben Codes problem-
        // los). Browser ohne Support ignorieren die ``advanced``-
        // Constraint stillschweigend — kein Crash, nur Log.
        // Diagnose-Log: effektive Aufloesung + FocusMode in Console,
        // damit wir bei Decode-Problemen sehen, was die Hardware wirklich
        // liefert (1080p vs. 640×480, Ultra-Wide vs. Wide-Lens).
        try {
          const reader = document.getElementById(READER_ID);
          const video = reader?.querySelector('video') ?? null;
          const stream = video && video.srcObject instanceof MediaStream ? video.srcObject : null;
          const track = stream?.getVideoTracks()[0] ?? null;
          if (track) {
            console.info('[QrScanSheet] track settings', track.getSettings());
            // ``focusMode`` ist nicht in ``lib.dom.d.ts``, aber W3C-Media-
            // Capture-Standard. Eigener Subtype, damit kein as-Cast noetig.
            interface FocusableConstraintSet extends MediaTrackConstraintSet {
              focusMode?: 'continuous' | 'manual' | 'single-shot' | 'auto';
            }
            interface FocusableTrackConstraints extends MediaTrackConstraints {
              advanced?: FocusableConstraintSet[];
            }
            const focusConstraints: FocusableTrackConstraints = {
              advanced: [{ focusMode: 'continuous' }],
            };
            await track
              .applyConstraints(focusConstraints)
              .catch((e: unknown) => console.info('[QrScanSheet] focusMode set failed', e));
          }
        } catch (e) {
          console.info('[QrScanSheet] post-start diagnostics failed', e);
        }
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        // Original-Fehler in die Console — der UI-Banner zeigt sonst nur
        // einen Fallback-Text und die echte Ursache (z. B. „Failed to
        // fetch dynamically imported module" oder „OverconstrainedError")
        // bleibt unsichtbar.
        console.error('[QrScanSheet] start failed', err);
        const rawMsg = err instanceof Error ? err.message : String(err);
        const msg =
          err instanceof Error && /permission|denied|notallowed/i.test(err.message)
            ? 'Kamerazugriff verweigert. Auf iPhone: Einstellungen → Apps → Browser (Safari/Chrome) → Kamera aktivieren. Sonst: in den Browser-Einstellungen freigeben.'
            : err instanceof Error && /notfound|no.*camera/i.test(err.message)
              ? 'Keine Kamera erkannt. Bitte Messstelle manuell auswählen.'
              : `Scanner konnte nicht gestartet werden: ${rawMsg}. Bitte Messstelle manuell auswählen.`;
        setError(msg);
      }
    })();

    return () => {
      cancelled = true;
      void teardown();
      if (unknownTimeoutRef.current !== null) {
        window.clearTimeout(unknownTimeoutRef.current);
        unknownTimeoutRef.current = null;
      }
    };
    // navigate und onClose absichtlich NICHT in den Deps — wir lesen sie
    // über die Refs und vermeiden dadurch unnötige Stream-Neustarts.
  }, [open, teardown]);

  // Body-Scroll-Lock + ESC analog zur Sheet-Komponente. Der Scanner braucht
  // ein eigenes Layout (Vollbild Video), darum kein Re-Use des Sheet-UI.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Camera size={18} />
          <span className="text-headline">QR-Code scannen</span>
        </div>
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          aria-label="Scanner schließen"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X size={18} />
        </button>
      </div>

      {isIphoneChrome() ? (
        <div
          data-testid="qr-scan-ios-chrome-warning"
          className="mx-4 mb-2 rounded-card border-hairline border-yellow-500/50 bg-yellow-500/15 p-3 text-caption text-white"
        >
          <strong className="font-semibold">Hinweis:</strong> Auf iPhone bleibt die Kamera in Chrome
          haeufig schwarz (System-Quirk). Bitte stattdessen Safari verwenden.
        </div>
      ) : null}

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* Video-Target für html5-qrcode. Die Library injiziert das
            <video>-Element selbst in dieses div. */}
        <div id={READER_ID} className="h-full w-full max-w-md" />

        {starting && !error ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">
            Kamera wird gestartet…
          </div>
        ) : null}

        {unknownDecoded ? (
          <div
            data-testid="qr-scan-unknown"
            className="absolute bottom-4 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-card bg-black/80 px-4 py-2 text-caption text-white backdrop-blur"
          >
            Code erkannt, aber nicht zuordenbar: <span className="num">„{unknownDecoded}"</span>
          </div>
        ) : null}
      </div>

      <div className="px-4 pb-[env(safe-area-inset-bottom)] pt-3 text-center text-caption text-white/80">
        {error ? (
          <div className="mx-auto max-w-md rounded-card border-hairline border-white/20 bg-white/5 p-3 text-white">
            {error}
          </div>
        ) : (
          <div className="space-y-1">
            <div>QR-Code in den Sucher halten — die App öffnet die richtige Maske automatisch.</div>
            <div className="text-white/50">
              Hinweis: Das rote bzw. grüne Symbol oben am Handy ist der System-Indikator für aktive
              Kameranutzung — keine Aufnahme.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
