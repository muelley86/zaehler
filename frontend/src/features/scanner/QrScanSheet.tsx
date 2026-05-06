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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X } from 'lucide-react';

import { parseScannedUrl } from './parseScannedUrl';

/** Minimaler Subtype der ``html5-qrcode``-API, damit der dynamische Import
 *  TypeScript-strikt bleibt. Wir nutzen nur den Konstruktor + start/stop. */
interface Html5QrcodeInstance {
  start(
    cameraConfig: { facingMode: string } | string,
    config: { fps: number; qrbox?: number | { width: number; height: number } },
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

interface QrScanSheetProps {
  open: boolean;
  onClose: () => void;
}

export function QrScanSheet({ open, onClose }: QrScanSheetProps) {
  const navigate = useNavigate();
  const instanceRef = useRef<Html5QrcodeInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

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
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            const result = parseScannedUrl(decodedText);
            if (!result) {
              // Kein passender QR-Inhalt — weiter scannen, kein Modal-Close.
              return;
            }
            // Stop-Sequenz fire-and-forget: navigate löst Unmount aus, und
            // useEffect-Cleanup räumt parallel auf. Wir warten nicht auf
            // ``stop()``, damit der UX-Übergang sofort passiert.
            void teardown();
            navigate(`/erfassen?mp=${result.mp}`);
            onClose();
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
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        const msg =
          err instanceof Error && /permission|denied|notallowed/i.test(err.message)
            ? 'Kamerazugriff verweigert. Bitte in den Browser-Einstellungen freigeben.'
            : err instanceof Error && /notfound|no.*camera/i.test(err.message)
              ? 'Keine Kamera erkannt. Bitte Messstelle manuell auswählen.'
              : 'Scanner konnte nicht gestartet werden. Bitte Messstelle manuell auswählen.';
        setError(msg);
      }
    })();

    return () => {
      cancelled = true;
      void teardown();
    };
  }, [open, navigate, onClose, teardown]);

  // Body-Scroll-Lock + ESC analog zum Sheet-Komponente. Der Scanner braucht
  // ein eigenes Layout (Vollbild Video), darum kein Re-Use des Sheet-UI.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

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
          onClick={onClose}
          aria-label="Scanner schließen"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* Video-Target für html5-qrcode. Die Library injiziert das
            <video>-Element selbst in dieses div. */}
        <div id={READER_ID} className="h-full w-full max-w-md" />

        {starting && !error ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">
            Kamera wird gestartet…
          </div>
        ) : null}
      </div>

      <div className="px-4 pb-[env(safe-area-inset-bottom)] pt-3 text-center text-caption text-white/80">
        {error ? (
          <div className="mx-auto max-w-md rounded-card border-hairline border-white/20 bg-white/5 p-3 text-white">
            {error}
          </div>
        ) : (
          <div>
            QR-Code in den Sucher halten — die App öffnet die richtige Erfassungsmaske
            automatisch.
          </div>
        )}
      </div>
    </div>
  );
}
