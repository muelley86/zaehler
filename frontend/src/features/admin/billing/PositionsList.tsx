/**
 * Positionsliste eines Abrechnungskreises, gruppiert nach heutigem Empfänger. Gruppen und
 * Positionen innerhalb einer Gruppe werden per Griff verschoben (Drag & Drop via @dnd-kit, per
 * Tastatur: Leertaste, Pfeiltasten, Leertaste). Eine Position wechselt die Gruppe nicht — der
 * Empfänger kommt aus der Messstelle; die interne Umlage bleibt immer am Ende. Gruppen sind
 * standardmäßig eingeklappt; eingeklappt lassen sie sich weiter als Ganzes verschieben.
 */
import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent, ScreenReaderInstructions } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, Pencil, Trash2 } from 'lucide-react';

import { cx } from '@/components/ui/cx';
import { formatDateDe } from '@/lib/format';
import type { BillingPositionRead } from '@/lib/types';

import {
  flattenGroups,
  groupPositions,
  mieterBadge,
  moveGroup,
  movePosition,
} from './positionGroups';
import type { PositionGroup } from './positionGroups';

const GRIP =
  'flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-tertiary hover:bg-fill-strong hover:text-label active:cursor-grabbing';

const DRAGGING = 'relative z-20 opacity-90 shadow-glass';

// Stabile Optionen: `useSensor` memoisiert über das Options-Objekt.
const POINTER_OPTIONS = { activationConstraint: { distance: 5 } };
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

// @dnd-kit bringt nur englische Ansagen mit.
const INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Leertaste nimmt den Eintrag auf, Pfeiltasten verschieben ihn, Leertaste legt ihn ab, Escape bricht ab.',
};

function announcements(name: (id: string | number) => string): Announcements {
  return {
    onDragStart: ({ active }) => `„${name(active.id)}“ aufgenommen.`,
    onDragOver: ({ active, over }) =>
      over ? `„${name(active.id)}“ über „${name(over.id)}“.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `„${name(active.id)}“ an Stelle von „${name(over.id)}“ abgelegt.`
        : `„${name(active.id)}“ abgelegt.`,
    onDragCancel: ({ active }) => `Verschieben von „${name(active.id)}“ abgebrochen.`,
  };
}

function groupTitle(g: PositionGroup): string {
  return g.recipient ?? 'Ohne Empfänger';
}

export interface PositionsListProps {
  positions: BillingPositionRead[];
  /** Neue Reihenfolge aller Positionen (IDs). */
  onReorder: (ids: number[]) => void;
  onEdit: (p: BillingPositionRead) => void;
  onRemove: (p: BillingPositionRead) => void;
}

export function PositionsList({ positions, onReorder, onEdit, onRemove }: PositionsListProps) {
  const groups = useMemo(() => groupPositions(positions), [positions]);
  // Gruppen-Keys bleiben über Neuladen und Umsortieren stabil, der Klappzustand also auch.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());
  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const labelById = useMemo(() => new Map(positions.map((p) => [p.id, p.label])), [positions]);
  // Pointer erst ab 5 px, damit ein Tipp auf den Griff kein Drag startet (wie im Dashboard).
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );
  // Memoisiert: jeder DndContext meldet seine Ansagen bei neuer Referenz neu an.
  const groupAnnouncements = useMemo(
    () =>
      announcements((id) => {
        const g = groups.find((x) => x.key === id);
        return g ? groupTitle(g) : String(id);
      }),
    [groups],
  );
  const positionAnnouncements = useMemo(
    () => announcements((id) => labelById.get(Number(id)) ?? String(id)),
    [labelById],
  );

  function handleGroupDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const next = moveGroup(groups, String(active.id), String(over.id));
    if (next) onReorder(flattenGroups(next));
  }

  function handlePositionDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const next = movePosition(groups, Number(active.id), Number(over.id));
    if (next) onReorder(flattenGroups(next));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleGroupDragEnd}
      accessibility={{
        announcements: groupAnnouncements,
        screenReaderInstructions: INSTRUCTIONS,
      }}
    >
      <SortableContext items={groups.map((g) => g.key)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3 px-3 pb-3">
          {groups.map((g) => (
            <SortableGroup
              key={g.key}
              group={g}
              open={openGroups.has(g.key)}
              onToggle={() => toggleGroup(g.key)}
            >
              {/* Eigener Kontext je Gruppe: Positionen bleiben in ihrer Gruppe. */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handlePositionDragEnd}
                accessibility={{
                  announcements: positionAnnouncements,
                  screenReaderInstructions: INSTRUCTIONS,
                }}
              >
                <SortableContext
                  items={g.positions.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="divide-y divide-separator">
                    {g.positions.map((p) => (
                      <SortablePosition
                        key={p.id}
                        position={p}
                        parentLabel={
                          p.parent_position_id !== null
                            ? (labelById.get(p.parent_position_id) ?? '?')
                            : null
                        }
                        onEdit={onEdit}
                        onRemove={onRemove}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </SortableGroup>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableGroup({
  group,
  open,
  onToggle,
  children,
}: {
  group: PositionGroup;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.key });
  const title = groupTitle(group);
  const mieter = mieterBadge(group);
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(
        'overflow-hidden rounded-card border-hairline border-border bg-surface-solid',
        isDragging && DRAGGING,
      )}
      role="group"
      aria-label={`Empfänger „${title}“`}
    >
      {/* Kopfzeile hebt den Rechnungsempfänger ab; interne Umlage neutral statt Akzentfarbe. */}
      <div
        className={cx(
          'flex items-center gap-1 border-b-hairline border-l-4 border-b-border px-3 py-2.5',
          group.internal
            ? 'border-l-border-strong bg-fill-strong'
            : 'border-l-primary bg-accent-tint',
        )}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Empfänger „${title}“ verschieben`}
          className={GRIP}
        >
          <GripVertical size={16} aria-hidden />
        </button>
        <h2 className="min-w-0 flex-1 text-body-sm font-semibold text-label">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full min-w-0 items-center gap-1 text-left"
          >
            {open ? (
              <ChevronDown size={16} aria-hidden className="shrink-0" />
            ) : (
              <ChevronRight size={16} aria-hidden className="shrink-0" />
            )}
            <span className="truncate">{title}</span>
          </button>
        </h2>
        <span className="shrink-0 rounded-full bg-surface-solid px-2 py-0.5 text-caption text-secondary">
          {group.positions.length} {group.positions.length === 1 ? 'Position' : 'Positionen'}
        </span>
        {mieter ? (
          <span className="shrink-0 rounded-full bg-surface-solid px-2 py-0.5 text-caption font-semibold text-primary-deep">
            {mieter}
          </span>
        ) : null}
        {group.internal ? (
          <span className="shrink-0 rounded-full bg-surface-solid px-2 py-0.5 text-caption text-secondary">
            Interne Umlage – immer zuletzt
          </span>
        ) : null}
      </div>
      <div id={panelId}>{open ? children : null}</div>
    </section>
  );
}

function SortablePosition({
  position: p,
  parentLabel,
  onEdit,
  onRemove,
}: {
  position: BillingPositionRead;
  parentLabel: string | null;
  onEdit: (p: BillingPositionRead) => void;
  onRemove: (p: BillingPositionRead) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: p.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(
        'flex items-center gap-2 py-3 pl-3 pr-5',
        // Gebändert: jede zweite Position hinterlegt. Beim Ziehen aus, sonst schlüge
        // `even:` (höhere Spezifität) den festen Drag-Hintergrund.
        isDragging ? cx(DRAGGING, 'bg-surface-solid') : 'even:bg-fill',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Position „${p.label}“ verschieben`}
        className={GRIP}
      >
        <GripVertical size={16} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-label">
          {p.label}
          {p.kind === 'rest' ? (
            <span className="ml-2 rounded-full bg-fill px-2 py-0.5 text-caption text-secondary">
              Restmenge
            </span>
          ) : null}
        </div>
        <div className="truncate text-caption text-tertiary">
          {p.kind === 'meter'
            ? `Messstelle: ${p.measuring_point_name ?? '—'}`
            : `KST ${p.kostenstelle ?? '—'}`}
          {parentLabel !== null ? ` · Unterzähler von ${parentLabel}` : ''}
          {p.invoice_line ? ` · ${p.invoice_line}` : ''}
        </div>
        <div className="text-caption text-quaternary">
          ab {formatDateDe(p.valid_from)}
          {p.valid_to ? ` bis ${formatDateDe(p.valid_to)}` : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onEdit(p)}
        aria-label={`Position ${p.label} bearbeiten`}
        className="flex h-8 w-8 items-center justify-center rounded-full text-secondary hover:bg-fill-strong"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => onRemove(p)}
        aria-label={`Position ${p.label} löschen`}
        className="flex h-8 w-8 items-center justify-center rounded-full text-danger hover:bg-danger/10"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}
