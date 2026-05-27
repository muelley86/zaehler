import { useEffect } from 'react';
import { MapPin, X } from 'lucide-react';

import { MAP_PROVIDERS } from '@/components/LocationMapSheet';

/**
 * Vollbild-Anzeige des an einem Reading hängenden Fotos.
 *
 * Das Bild kommt direkt vom Backend (``/api/v1/readings/{id}/photo``);
 * der Browser schickt das Session-Cookie automatisch mit (Same-Origin).
 * Schließt auf Klick außerhalb des Bildes oder ESC. Wenn das Foto im EXIF
 * GPS-Koordinaten hatte (Backend hat sie beim Upload extrahiert), wird am
 * unteren Rand eine Info-Bar mit Koordinaten + Links auf OSM/Google/Apple
 * Maps eingeblendet.
 */
export function PhotoLightbox({
  readingId,
  lat,
  lon,
  onClose,
}: {
  readingId: number;
  lat: number | null;
  lon: number | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasGps = lat !== null && lon !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto-Vorschau"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      data-testid="photo-lightbox"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X size={20} />
      </button>
      <img
        src={`/api/v1/readings/${readingId}/photo`}
        alt={`Foto zur Erfassung #${readingId}`}
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {hasGps ? (
        <div
          data-testid="photo-lightbox-gps"
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-card bg-black/70 px-4 py-3 text-caption text-white backdrop-blur"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-1.5">
            <MapPin size={14} aria-hidden />
            <span className="num">
              {lat.toFixed(6)}, {lon.toFixed(6)}
            </span>
          </span>
          {MAP_PROVIDERS.map((p) => (
            <a
              key={p.id}
              href={p.url(lat, lon)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`photo-lightbox-map-${p.id}`}
              className="rounded-pill bg-white/15 px-3 py-1 font-semibold text-white hover:bg-white/25"
            >
              {p.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
