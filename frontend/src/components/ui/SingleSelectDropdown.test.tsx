/**
 * Tests für das suchbare Einfach-Auswahl-Dropdown (Formularfeld-Variante):
 * Auswahl übernimmt + schließt, Trigger zeigt das Label, Suche bei langen
 * Listen, Schließen bei Escape / Klick außerhalb.
 */

import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SingleSelectDropdown } from './SingleSelectDropdown';

interface Opt {
  value: number;
  label: string;
}

function Harness({ options, searchThreshold = 8 }: { options: Opt[]; searchThreshold?: number }) {
  const [val, setVal] = useState<number | null>(null);
  return (
    <div>
      <button type="button">außerhalb</button>
      <SingleSelectDropdown
        options={options}
        value={val}
        onChange={setVal}
        placeholder="Wählen"
        searchThreshold={searchThreshold}
      />
    </div>
  );
}

const ABC: Opt[] = [
  { value: 1, label: 'Alpha' },
  { value: 2, label: 'Beta' },
  { value: 3, label: 'Gamma' },
];

describe('SingleSelectDropdown', () => {
  it('wählt eine Option, schließt und zeigt das Label am Trigger', async () => {
    const user = userEvent.setup();
    render(<Harness options={ABC} />);

    // Trigger zeigt Placeholder; Optionen sind zu.
    expect(screen.getByRole('button', { name: 'Wählen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Beta' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Wählen' }));
    await user.click(await screen.findByRole('button', { name: 'Beta' }));

    // Panel geschlossen (Alpha-Option weg), Trigger zeigt jetzt "Beta".
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
  });

  it('zeigt bei langen Listen ein Suchfeld und filtert', async () => {
    const many: Opt[] = Array.from({ length: 10 }, (_, i) => ({ value: i, label: `Item ${i}` }));
    const user = userEvent.setup();
    render(<Harness options={many} />);

    await user.click(screen.getByRole('button', { name: 'Wählen' }));
    await user.type(screen.getByPlaceholderText('Suchen…'), 'Item 3');
    expect(screen.getByRole('button', { name: 'Item 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Item 0' })).toBeNull();
  });

  it('schließt bei Escape und bei Klick außerhalb', async () => {
    const user = userEvent.setup();
    render(<Harness options={ABC} />);

    await user.click(screen.getByRole('button', { name: 'Wählen' }));
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Wählen' }));
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'außerhalb' }));
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
  });
});
