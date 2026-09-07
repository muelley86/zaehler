import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cx } from './cx';

// Auswahl deckt die im Sheet üblichen Steuerelemente ab (Buttons, Inputs,
// Links, Formularfelder) — ausreichend für Fokus-erstes-Element und den
// Tab-Trap, ohne den Aufwand eines vollen a11y-Utility-Pakets.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

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
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Ignoriert bereits konsumierte Escapes — z. B. ein offenes
      // Dropdown-Popover, das per capture-Listener zuerst dran ist und
      // sich selbst schließt, statt gleich das ganze Sheet zuzumachen.
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Fokus-Management: beim Öffnen den zuletzt fokussierten Opener merken
  // und den Fokus ins Panel holen (erstes fokussierbares Element, sonst der
  // Schließen-Button) — per requestAnimationFrame, weil das Portal-Panel
  // erst nach dem Commit im DOM steht. Beim Schließen (Effekt-Cleanup) geht
  // der Fokus zurück an den Opener.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const focusable = panel ? getFocusableElements(panel) : [];
      const target = focusable[0] ?? closeButtonRef.current;
      target?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

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

  // Tab-Trap AM PANEL (nicht an document) — an den Rändern der
  // fokussierbaren Liste zyklisch wrappen. Bewusst nicht global, damit ein
  // portaled Dropdown-Popover (liegt außerhalb des Panels im DOM) seinen
  // eigenen Tab-Kreis behält und hier nicht mit hineingezogen wird.
  function handlePanelKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = getFocusableElements(panel);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

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
        aria-label="Sheet schließen"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handlePanelKeyDown}
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
            <div id={titleId} className="text-headline text-label">
              {title}
            </div>
            <button
              ref={closeButtonRef}
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
