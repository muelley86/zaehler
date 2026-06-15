/**
 * Tests für die geteilte Stammdaten-Liste: ganze Zeile verlinkt auf die
 * Detailseite, die Bearbeiten/Löschen-Buttons lösen ihre Aktion aus ohne zu
 * navigieren (preventDefault/stopPropagation).
 */

import { User } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

import { renderWithRouter } from '@/tests/render';

import { MasterDataList } from './MasterDataList';

interface Item {
  id: number;
  name: string;
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderList(
  props: { onEdit?: (i: Item) => void; onDelete?: (i: Item) => Promise<void> } = {},
) {
  const items: Item[] = [{ id: 3, name: 'Eigt-A' }];
  return renderWithRouter(
    <>
      <MasterDataList
        items={items}
        icon={<User size={18} />}
        getId={(i) => i.id}
        getName={(i) => i.name}
        getSearchText={(i) => i.name.toLowerCase()}
        mpCount={() => 0}
        getDetailHref={(i) => `/admin/eigentuemer/${i.id}`}
        searchPlaceholder="suchen…"
        emptyState={<div>leer</div>}
        onEdit={props.onEdit ?? (() => {})}
        onDelete={props.onDelete ?? (async () => {})}
      />
      <LocationProbe />
    </>,
    { initialEntries: ['/admin/eigentuemer'] },
  );
}

describe('MasterDataList', () => {
  it('macht die ganze Zeile zu einem Link auf die Detailseite', () => {
    renderList();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/eigentuemer/3');
  });

  it('löst Bearbeiten aus, ohne zur Detailseite zu navigieren', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderList({ onEdit });

    await user.click(screen.getByRole('button', { name: /Eigt-A bearbeiten/ }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    // Buttons isolieren den Klick — die Route bleibt auf der Liste.
    expect(screen.getByTestId('loc')).toHaveTextContent('/admin/eigentuemer');
    expect(screen.getByTestId('loc')).not.toHaveTextContent('/admin/eigentuemer/3');
  });

  it('löst Löschen aus, ohne zur Detailseite zu navigieren', async () => {
    const onDelete = vi.fn(async () => {});
    const user = userEvent.setup();
    renderList({ onDelete });

    await user.click(screen.getByRole('button', { name: /Eigt-A löschen/ }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('loc')).not.toHaveTextContent('/admin/eigentuemer/3');
  });
});
