import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { Dropdown } from './Dropdown';
import type { DropdownOption } from './MultiSelectDropdown';
import { TextField } from './TextField';
import { cx } from './cx';

/**
 * Suchbare Einfach-Auswahl als Formularfeld-Dropdown — gleiche Such-/Popover-
 * Mechanik wie {@link MultiSelectDropdown}, aber genau ein Wert: Klick auf eine
 * Option übernimmt sie und schließt das Panel. Suchfeld erscheint bei langen
 * Listen (> ``searchThreshold``). Der Trigger zeigt das gewählte Label bzw.
 * ``placeholder``.
 */
export function SingleSelectDropdown<T extends string | number>({
  options,
  value,
  onChange,
  placeholder = 'Auswählen…',
  searchThreshold = 8,
}: {
  options: DropdownOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  searchThreshold?: number;
}) {
  const [search, setSearch] = useState('');
  const showSearch = options.length > searchThreshold;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, search]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  return (
    <Dropdown variant="field" label={selectedLabel}>
      {(close) => (
        <div className="flex flex-col">
          {showSearch ? (
            <div className="border-b-hairline border-separator p-2">
              <TextField
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suchen…"
                trailing={<Search size={14} className="text-tertiary" />}
              />
            </div>
          ) : null}
          <ul className="max-h-[44vh] divide-y divide-separator overflow-y-auto">
            {visible.length === 0 ? (
              <li className="px-3 py-3 text-caption text-tertiary">Keine Treffer.</li>
            ) : (
              visible.map((o) => (
                <li key={String(o.value)}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setSearch('');
                      close();
                    }}
                    className={cx(
                      'flex w-full items-center px-3 py-2 text-left text-body-sm hover:bg-fill',
                      o.value === value ? 'font-semibold text-primary' : 'text-label',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </Dropdown>
  );
}
