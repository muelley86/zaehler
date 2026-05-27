import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Vollbild-Anzeige des an einem Reading hängenden Fotos.
 *
 * Das Bild kommt direkt vom Backend (``/api/v1/readings/{id}/photo``);
 * der Browser schickt das Session-Cookie automatisch mit (Same-Origin).
 * Schließt auf Klick außerhalb des Bildes oder ESC.
 */
export function PhotoLightbox({ readingId, onClose }: { readingId: number; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    </div>
  );
}
