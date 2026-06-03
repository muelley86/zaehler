import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { cx } from './cx';

/**
 * Generische Popover-Hülle: ein Trigger-Button, der ein schwebendes Panel
 * über dem Inhalt öffnet. Schließt bei Klick außerhalb und Escape.
 *
 * Basis für {@link MultiSelectDropdown}; direkt nutzbar für beliebigen
 * Panel-Inhalt (z. B. ein Datumsbereich-Filter).
 */
export function Dropdown({
  label,
  badge,
  children,
  align = 'left',
}: {
  label: ReactNode;
  /** Aktiv-Zähler. > 0 → Trigger wird aktiv gestylt und zeigt das Badge. */
  badge?: number;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = badge !== undefined && badge > 0;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className={cx(
          'flex items-center gap-1.5 rounded-pill border-hairline px-3 py-1.5 text-body-sm font-medium tracking-tight transition-[background,color,border-color]',
          active
            ? 'border-primary bg-primary-soft text-primary-deep'
            : 'border-border bg-fill text-secondary hover:bg-fill-strong',
        )}
      >
        <span>{label}</span>
        {active ? (
          <span className="num inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-white">
            {badge}
          </span>
        ) : null}
        <ChevronDown
          size={14}
          aria-hidden
          className={cx('shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div
          className={cx(
            'glass absolute top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border-hairline border-border bg-surface-high shadow-glass dark:shadow-glass-dark',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
