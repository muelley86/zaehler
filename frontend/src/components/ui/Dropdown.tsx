import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

import { cx } from './cx';

const PANEL_WIDTH = 256; // entspricht w-64

/**
 * Generische Popover-Hülle: ein Trigger-Button, der ein schwebendes Panel
 * öffnet. Das Panel wird per Portal an ``document.body`` gerendert und fix
 * positioniert — so entkommt es ``overflow-hidden``/Stacking-Contexts von
 * Vorfahren (z. B. der ``glass``-Filterkarte) und liegt immer obenauf.
 * Schließt bei Klick außerhalb und Escape.
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
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = badge !== undefined && badge > 0;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rawLeft = align === 'right' ? r.right - PANEL_WIDTH : r.left;
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - PANEL_WIDTH - 8));
    setPos({ top: r.bottom + 4, left, width: PANEL_WIDTH });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    place();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return (
    <div className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) place();
          setOpen((o) => !o);
        }}
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
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
              className="glass z-50 max-h-[70vh] max-w-[calc(100vw-1rem)] overflow-hidden rounded-card border-hairline border-border bg-surface-high shadow-glass dark:shadow-glass-dark"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
