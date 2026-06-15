import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pencil, Search, Trash2 } from 'lucide-react';

import { Card, Row, RowGroup, TextField } from '@/components/ui';

interface MasterDataListProps<T> {
  /** `null` = noch ladend (nichts rendern); `[]` = Empty-State zeigen. */
  items: T[] | null;
  /** Icon-Node, das in jeder Zeile links erscheint. */
  icon: ReactNode;
  getId: (item: T) => number;
  getName: (item: T) => string;
  /** Vorab kleingeschriebener Heuhaufen fürs Filtern (Name, Ort, Kontakt …). */
  getSearchText: (item: T) => string;
  /** Anzahl zugeordneter Messstellen für die Sublabel-Zeile. */
  mpCount: (id: number) => number;
  searchPlaceholder: string;
  emptyState: ReactNode;
  onEdit: (item: T) => void;
  /** Macht Confirm + Löschen + Refresh; wirft bei Abbruch/Fehler nicht nach außen. */
  onDelete: (item: T) => Promise<void>;
}

function countLabel(n: number): string {
  if (n === 0) return 'Keine Messstellen';
  return `${n} ${n === 1 ? 'Messstelle' : 'Messstellen'}`;
}

/**
 * Kompakte, einspaltige Stammdaten-Liste mit Suchfeld — geteilt von den
 * Mieter-, Lieferanten- und Eigentümer-Seiten. Zeigt pro Eintrag nur Name +
 * Messstellen-Anzahl; alle weiteren Felder leben im Bearbeiten-Dialog.
 */
export function MasterDataList<T>({
  items,
  icon,
  getId,
  getName,
  getSearchText,
  mpCount,
  searchPlaceholder,
  emptyState,
  onEdit,
  onDelete,
}: MasterDataListProps<T>) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());

  if (items === null) return null;
  if (items.length === 0) return <>{emptyState}</>;

  const needle = query.trim().toLowerCase();
  const filtered = needle ? items.filter((item) => getSearchText(item).includes(needle)) : items;

  async function handleDelete(item: T) {
    const id = getId(item);
    setPending((prev) => new Set(prev).add(id));
    try {
      await onDelete(item);
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-3">
      <TextField
        aria-label="Suchen"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        trailing={<Search size={16} className="text-tertiary" />}
      />

      {filtered.length === 0 ? (
        <div className="text-tertiary">Keine Treffer.</div>
      ) : (
        <Card padded={false}>
          <RowGroup>
            {filtered.map((item) => {
              const id = getId(item);
              const name = getName(item);
              return (
                <Row
                  key={id}
                  icon={icon}
                  label={name}
                  sublabel={countLabel(mpCount(id))}
                  trailing={
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        aria-label={`${name} bearbeiten`}
                        title="Bearbeiten"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-fill hover:text-primary-deep"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        disabled={pending.has(id)}
                        aria-label={`${name} löschen`}
                        title="Löschen"
                        className="hover:bg-danger/10 flex h-8 w-8 items-center justify-center rounded-full text-tertiary transition-colors hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  }
                />
              );
            })}
          </RowGroup>
        </Card>
      )}
    </div>
  );
}
