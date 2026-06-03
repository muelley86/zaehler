/**
 * Tests für das wiederverwendbare MultiSelectDropdown (schwebendes Popover mit
 * Checkbox-Liste, Aktiv-Zähler, Suche bei langen Listen, Alle/Keine).
 */

import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MultiSelectDropdown } from './MultiSelectDropdown';

interface Opt {
  value: string;
  label: string;
}

function Harness({ options, searchThreshold = 8 }: { options: Opt[]; searchThreshold?: number }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  return (
    <div>
      <button type="button">außerhalb</button>
      <MultiSelectDropdown
        label="Test"
        options={options}
        selected={sel}
        onChange={setSel}
        searchThreshold={searchThreshold}
      />
    </div>
  );
}

const ABC: Opt[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('MultiSelectDropdown', () => {
  it('öffnet das Panel, togglet Optionen und zählt am Trigger', async () => {
    const user = userEvent.setup();
    render(<Harness options={ABC} />);

    // Zu: keine Checkbox sichtbar
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Test' }));
    await user.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(screen.getByText('1')).toBeInTheDocument(); // Badge
    await user.click(screen.getByRole('checkbox', { name: 'Gamma' }));
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Beta' })).not.toBeChecked();
  });

  it('"Alle"/"Keine" wählt alle bzw. keine', async () => {
    const user = userEvent.setup();
    render(<Harness options={ABC} />);

    await user.click(screen.getByRole('button', { name: 'Test' }));
    await user.click(screen.getByRole('button', { name: 'Alle' }));
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Keine' }));
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).not.toBeChecked();
  });

  it('zeigt bei langen Listen ein Suchfeld und filtert', async () => {
    const many: Opt[] = Array.from({ length: 10 }, (_, i) => ({
      value: String(i),
      label: `Item ${i}`,
    }));
    const user = userEvent.setup();
    render(<Harness options={many} />);

    await user.click(screen.getByRole('button', { name: 'Test' }));
    await user.type(screen.getByPlaceholderText('Suchen…'), 'Item 3');
    expect(screen.getByRole('checkbox', { name: 'Item 3' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Item 0' })).not.toBeInTheDocument();
  });

  it('schließt bei Escape und bei Klick außerhalb', async () => {
    const user = userEvent.setup();
    render(<Harness options={ABC} />);

    await user.click(screen.getByRole('button', { name: 'Test' }));
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Test' }));
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'außerhalb' }));
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).not.toBeInTheDocument();
  });
});
