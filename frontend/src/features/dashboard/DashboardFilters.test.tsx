/**
 * Tests für die Dashboard-Filterleiste. Sie schaltet per JS (`useIsDesktop`)
 * zwischen zwei Darstellungen um — Dropdowns dürfen NIE doppelt im DOM stehen:
 *  - Mobile (Default in der Testumgebung, `matchMedia().matches === false`):
 *    Toolbar-Button + Chips, Dropdowns im Sheet.
 *  - Desktop (matchMedia-Spy): Dropdowns inline, kein Dialog, keine Chips.
 */

import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { DESKTOP_QUERY } from '@/lib/useMediaQuery';
import {
  activeFilterChips,
  buildFilterOptions,
  countActiveFilters,
  emptyFilters,
  type DashboardFilters as Filters,
} from './dashboardSelectors';
import { dashboardItem, virtualItem } from './testFixtures';
import { DashboardFilters } from './DashboardFilters';

const WASSER = dashboardItem({ id: 1, name: 'Wasser Garten', type: 'water' });
const STROM = dashboardItem({ id: 2, name: 'Strom Haus', type: 'electricity' });
const VMP = virtualItem({ id: 9, name: 'PV-Saldo' });

/** Stellt `matchMedia` so, dass `useIsDesktop()` true liefert. */
function mockDesktop(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const mql = {
      matches: query === DESKTOP_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    // Partial-Mock: `useMediaQuery` liest nur `matches` und meldet sich per
    // add/removeEventListener an — der Rest der MediaQueryList-Schnittstelle
    // wird nie berührt, daher der Doppel-Cast über `unknown`.
    return mql as unknown as MediaQueryList;
  });
}

function Harness({ withVirtual = false }: { withVirtual?: boolean }) {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const items = [WASSER, STROM];
  const virtualItems = withVirtual ? [VMP] : [];
  const options = buildFilterOptions(items, virtualItems, filters);
  return (
    <DashboardFilters
      filters={filters}
      options={options}
      virtualAvailable={virtualItems.length > 0}
      activeCount={countActiveFilters(filters)}
      chips={activeFilterChips(filters, options, items)}
      onChange={setFilters}
      onReset={() => setFilters(emptyFilters())}
    />
  );
}

/** Öffnet das Sheet und kreuzt „Wasser" im Zählerart-Dropdown an. */
function selectWasserInSheet(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Zählerart' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Wasser' }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardFilters — Mobile', () => {
  it('zeigt die Dropdowns erst im Sheet', () => {
    render(<Harness />);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zählerart' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Zählerart' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Messstellen' })).toBeInTheDocument();
  });

  it('macht eine Auswahl als Chip sichtbar und nennt sie im Filter-Button', () => {
    render(<Harness />);

    selectWasserInSheet();

    expect(screen.getByRole('button', { name: 'Filter (1 aktiv)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zählerart: Wasser entfernen' })).toHaveTextContent(
      'Zählerart: Wasser',
    );
  });

  it('entfernt einen Filter per Klick auf den Chip', () => {
    render(<Harness />);
    selectWasserInSheet();

    fireEvent.click(screen.getByRole('button', { name: 'Zählerart: Wasser entfernen' }));

    expect(screen.queryByRole('button', { name: 'Zählerart: Wasser entfernen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('bietet „Filter zurücksetzen" ausschließlich im Sheet an', () => {
    render(<Harness />);
    selectWasserInSheet();

    expect(screen.getAllByRole('button', { name: 'Filter zurücksetzen' })).toHaveLength(1);
    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(screen.queryByRole('button', { name: 'Zählerart: Wasser entfernen' })).toBeNull();
  });

  it('blendet die verrechneten Messstellen nur ein, wenn es welche gibt', () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.queryByRole('button', { name: 'Verrechnete Messstellen' })).toBeNull();
    unmount();

    render(<Harness withVirtual />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByRole('button', { name: 'Verrechnete Messstellen' })).toBeInTheDocument();
  });
});

describe('DashboardFilters — Desktop', () => {
  it('zeigt die Dropdowns inline, ohne Sheet und ohne Chips', () => {
    mockDesktop();
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Zählerart' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Filter$/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Zählerart' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wasser' }));

    // Kein Chip auf Desktop — die Auswahl steht als Badge am Dropdown selbst.
    expect(screen.queryByRole('button', { name: 'Zählerart: Wasser entfernen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter zurücksetzen' })).toBeInTheDocument();
  });
});
