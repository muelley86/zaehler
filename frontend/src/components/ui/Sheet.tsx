import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cx } from './cx';

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Body-Scroll während offenem Sheet sperren — sonst kann auf iOS der
  // Hintergrund unter dem Backdrop weiter mitscrollen.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  // Render via Portal direkt auf document.body. Kritisch für iOS Safari:
  // Ein Ancestor mit ``backdrop-filter`` (.glass) oder ``transform`` macht
  // das Element zum containing block für ``position: fixed``, wodurch das
  // Sheet auf die Container-Größe schrumpft — sichtbar als "kleines
  // graues Fenster" statt eines viewport-füllenden Modals.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        className={cx(
          'glass relative z-10 w-full max-w-lg border-hairline border-border bg-surface-high',
          'shadow-glass dark:shadow-glass-dark',
          'rounded-t-sheet md:rounded-card',
          'md:max-h-[80vh]',
          'max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]',
        )}
      >
        {/* Handle-Bar nur auf Mobile sichtbar */}
        <div className="bg-surface-high/95 glass sticky top-0 z-10">
          <div className="flex justify-center pt-2 md:hidden">
            <div className="h-1 w-9 rounded-full bg-fill-strong" />
          </div>
          <div className="flex items-center justify-between border-b-hairline border-separator px-5 py-3">
            <div className="text-headline text-label">{title}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-fill text-secondary transition-colors hover:bg-fill-strong"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
