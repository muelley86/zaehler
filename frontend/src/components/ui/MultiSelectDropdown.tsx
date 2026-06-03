import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { Dropdown } from './Dropdown';
import { TextField } from './TextField';

export interface DropdownOption<T> {
  value: T;
  label: string;
}

/**
 * Einheitlicher Mehrfach-Auswahl-Filter als schwebendes Dropdown — überall
 * gleich konfiguriert: scrollbare Checkbox-Liste, Aktiv-Zähler am Trigger,
 * Suchfeld bei langen Listen (> ``searchThreshold``) und „Alle/Keine".
 *
 * ``onChange`` bekommt jeweils ein neues ``Set`` (die Auswahl wird ersetzt,
 * nicht mutiert).
 */
export function MultiSelectDropdown<T extends string | number | null>({
  label,
  options,
  selected,
  onChange,
  searchThreshold = 8,
}: {
  label: string;
  options: DropdownOption<T>[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  searchThreshold?: number;
}) {
  const [search, setSearch] = useState('');
  const showSearch = options.length > searchThreshold;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, search]);

  function toggle(value: T) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  function selectAllVisible() {
    const next = new Set(selected);
    for (const o of visible) next.add(o.value);
    onChange(next);
  }

  function clearVisible() {
    const next = new Set(selected);
    for (const o of visible) next.delete(o.value);
    onChange(next);
  }

  return (
    <Dropdown label={label} badge={selected.size}>
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
        <div className="flex items-center justify-between gap-2 border-b-hairline border-separator px-3 py-1.5">
          <button
            type="button"
            onClick={selectAllVisible}
            className="text-caption font-semibold text-primary"
          >
            Alle
          </button>
          <button
            type="button"
            onClick={clearVisible}
            className="text-caption font-semibold text-primary"
          >
            Keine
          </button>
        </div>
        <ul className="max-h-[44vh] divide-y divide-separator overflow-y-auto">
          {visible.length === 0 ? (
            <li className="px-3 py-3 text-caption text-tertiary">Keine Treffer.</li>
          ) : (
            visible.map((o) => (
              <li key={String(o.value)}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-fill">
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => toggle(o.value)}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1 truncate text-body-sm text-label">{o.label}</span>
                </label>
              </li>
            ))
          )}
        </ul>
      </div>
    </Dropdown>
  );
}
