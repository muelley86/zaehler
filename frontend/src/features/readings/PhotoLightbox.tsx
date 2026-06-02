import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react';

import { MAP_PROVIDERS } from '@/components/LocationMapSheet';
import type { ReadingPhotoRead } from '@/lib/types';

/**
 * Vollbild-Galerie der an einem Reading hängenden Fotos (bis zu 6).
 *
 * Die Bilder kommen direkt vom Backend
 * (``/api/v1/readings/{id}/photos/{photoId}``); der Browser schickt das
 * Session-Cookie automatisch mit (Same-Origin). Schließt auf Klick außerhalb
 * des Bildes oder ESC; mit ←/→ bzw. Pfeil-Buttons blättert man. Hatte ein Foto
 * im EXIF GPS, zeigt eine Info-Bar Koordinaten + Karten-Links.
 */
export function PhotoLightbox({
  readingId,
  photos,
  startIndex = 0,
  onClose,
}: {
  readingId: number;
  photos: ReadingPhotoRead[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const count = photos.length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % count);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + count) % count);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, count]);

  if (count === 0) return null;
  const safeIndex = Math.min(index, count - 1);
  const photo = photos[safeIndex]!;
  const hasGps = photo.photo_lat !== null && photo.photo_lon !== null;

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

      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Vorheriges Foto"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + count) % count);
            }}
            className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            aria-label="Nächstes Foto"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % count);
            }}
            className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight size={22} />
          </button>
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-pill bg-black/60 px-3 py-1 text-caption text-white">
            {safeIndex + 1} / {count}
          </div>
        </>
      ) : null}

      <img
        src={`/api/v1/readings/${readingId}/photos/${photo.id}`}
        alt={`Foto ${safeIndex + 1} zur Erfassung #${readingId}`}
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
              {photo.photo_lat!.toFixed(6)}, {photo.photo_lon!.toFixed(6)}
            </span>
          </span>
          {MAP_PROVIDERS.map((p) => (
            <a
              key={p.id}
              href={p.url(photo.photo_lat!, photo.photo_lon!)}
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
