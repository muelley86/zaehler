/**
 * Rahmen einer Dashboard-Kachel: Kopfzeile mit Griff (Drag & Drop via
 * @dnd-kit), Titel, ▲/▼ (verlässliche Alternative auf dem Handy und für
 * Tastatur-Nutzer) und Auf-/Zuklappen. Eingeklappt bleibt nur die Kopfzeile.
 * Den Inhalt (eigene Glass-Card(s)) liefert die jeweilige Karte.
 */

import { useId } from 'react';
import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical } from 'lucide-react';

import { cx } from '@/components/ui/cx';
import type { DashboardTileId } from '@/lib/types';

const ICON_BUTTON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-fill hover:text-label disabled:pointer-events-none disabled:opacity-30';

export interface DashboardTileProps {
  id: DashboardTileId;
  title: string;
  /** Optionaler Zähler hinter dem Titel („Fällige Messstellen · 3“) — nicht in den Button-Labels. */
  count?: number;
  collapsed: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: DashboardTileId, delta: number) => void;
  onToggle: (id: DashboardTileId) => void;
  className?: string;
  children: ReactNode;
}

export function DashboardTile({
  id,
  title,
  count,
  collapsed,
  isFirst,
  isLast,
  onMove,
  onToggle,
  className,
  children,
}: DashboardTileProps) {
  const bodyId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx('space-y-2', isDragging && 'relative z-20 opacity-80', className)}
      data-tile={id}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Kachel „${title}“ verschieben`}
          className={cx(ICON_BUTTON, 'cursor-grab touch-none active:cursor-grabbing')}
        >
          <GripVertical size={16} aria-hidden />
        </button>
        <h2 className="flex-1 truncate px-1 text-caption-bold uppercase text-tertiary">
          {count !== undefined && count > 0 ? `${title} · ${count}` : title}
        </h2>
        <button
          type="button"
          onClick={() => onMove(id, -1)}
          disabled={isFirst}
          aria-label={`„${title}“ nach oben`}
          className={ICON_BUTTON}
        >
          <ArrowUp size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onMove(id, 1)}
          disabled={isLast}
          aria-label={`„${title}“ nach unten`}
          className={ICON_BUTTON}
        >
          <ArrowDown size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? `„${title}“ aufklappen` : `„${title}“ zuklappen`}
          className={ICON_BUTTON}
        >
          <ChevronDown
            size={18}
            aria-hidden
            className={cx('transition-transform', collapsed && '-rotate-90')}
          />
        </button>
      </div>
      <div id={bodyId} hidden={collapsed} className="space-y-4">
        {collapsed ? null : children}
      </div>
    </section>
  );
}
