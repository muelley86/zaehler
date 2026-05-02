import { useEffect } from 'react';
import type { ReactNode } from 'react';
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        className={cx(
          'relative z-10 w-full max-w-lg rounded-t-ios-xl bg-ios-surface shadow-ios-elevated',
          'md:max-h-[80vh] md:rounded-ios-xl',
          'max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-ios-separator/60 bg-ios-surface px-4 py-3">
          <div className="text-ios-headline">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ios-fill/15 text-ios-secondary hover:bg-ios-fill/25"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
