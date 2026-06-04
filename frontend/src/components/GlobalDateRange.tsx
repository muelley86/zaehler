import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { formatRangeShort } from '@/lib/dateRange';
import { DateInput, Dropdown } from '@/components/ui';
import { cx } from '@/components/ui/cx';

/**
 * Globaler Datumsbereich — immer sichtbares Steuerelement in der Navigation.
 * Zeigt den aktiven Zeitraum, erlaubt Jahres-Sprünge per `◀`/`▶` und ein
 * von/bis-Popover. `sidebar` = volle Breite (Desktop-Sidebar), `mobile` =
 * kompakte, zentrierte Leiste.
 */
export function GlobalDateRange({ variant }: { variant: 'sidebar' | 'mobile' }) {
  const { dateRange, setFrom, setTo, stepYear } = useFilterPrefs();

  return (
    <div
      data-testid={`global-date-range-${variant}`}
      className={cx('flex items-center gap-1', variant === 'mobile' && 'justify-center')}
    >
      <YearArrow dir="prev" onClick={() => stepYear(-1)} />
      <div className={variant === 'sidebar' ? 'min-w-0 flex-1' : 'min-w-0'}>
        <Dropdown
          label={formatRangeShort(dateRange)}
          variant={variant === 'sidebar' ? 'field' : 'pill'}
          dense
        >
          <div className="flex flex-col gap-2 p-3">
            <label className="flex flex-col gap-1 text-caption text-tertiary">
              von
              <DateInput value={dateRange.from} onChange={setFrom} aria-label="von" />
            </label>
            <label className="flex flex-col gap-1 text-caption text-tertiary">
              bis
              <DateInput value={dateRange.to} onChange={setTo} aria-label="bis" />
            </label>
          </div>
        </Dropdown>
      </div>
      <YearArrow dir="next" onClick={() => stepYear(1)} />
    </div>
  );
}

function YearArrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Ein Jahr zurück' : 'Ein Jahr vor'}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-fill hover:text-label"
    >
      <Icon size={18} />
    </button>
  );
}
