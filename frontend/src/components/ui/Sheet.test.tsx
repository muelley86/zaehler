/**
 * a11y-Tests für die generische Sheet-Komponente (Bottom-Sheet/Modal):
 * Dialog-Rolle + Titel-Verknüpfung, Fokus-Management (rein/raus), Escape
 * (inkl. defaultPrevented-Fall) und der Tab-Trap am Panel.
 */

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MultiSelectDropdown } from './MultiSelectDropdown';
import { Sheet } from './Sheet';

function OpenerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Test-Sheet">
        <button type="button">Inhalt</button>
      </Sheet>
    </div>
  );
}

describe('Sheet', () => {
  it('setzt role=dialog, aria-modal und verknüpft den Titel per aria-labelledby', () => {
    render(
      <Sheet open onClose={() => {}} title="Mein Titel">
        <div>Inhalt</div>
      </Sheet>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const titleEl = within(dialog).getByText('Mein Titel');
    expect(dialog).toHaveAttribute('aria-labelledby', titleEl.id);
  });

  it('fokussiert nach dem Öffnen automatisch das erste fokussierbare Element im Panel', async () => {
    render(
      <Sheet open onClose={() => {}} title="T">
        <button type="button">Inhalt</button>
      </Sheet>,
    );

    const closeBtn = screen.getByRole('button', { name: 'Schließen' });
    await waitFor(() => expect(closeBtn).toHaveFocus());
  });

  it('gibt beim Schließen den Fokus an den Opener zurück', async () => {
    const user = userEvent.setup();
    render(<OpenerHarness />);

    const openerBtn = screen.getByRole('button', { name: 'Öffnen' });
    await user.click(openerBtn);

    const closeBtn = await screen.findByRole('button', { name: 'Schließen' });
    await waitFor(() => expect(closeBtn).toHaveFocus());

    await user.click(closeBtn);
    await waitFor(() => expect(openerBtn).toHaveFocus());
  });

  it('schließt bei Escape', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="T">
        <button type="button">Inhalt</button>
      </Sheet>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('schließt NICHT bei Escape, wenn defaultPrevented (z. B. von einem offenen Dropdown-Popover)', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="T">
        <button type="button">Inhalt</button>
      </Sheet>,
    );

    function preventer(e: KeyboardEvent) {
      e.preventDefault();
    }
    document.addEventListener('keydown', preventer, { capture: true });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    document.removeEventListener('keydown', preventer, { capture: true });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('Tab am letzten fokussierbaren Element springt zyklisch zum ersten', async () => {
    const user = userEvent.setup();
    render(
      <Sheet open onClose={() => {}} title="T">
        <button type="button">Erster Inhalt</button>
        <button type="button">Letzter Inhalt</button>
      </Sheet>,
    );

    const closeBtn = screen.getByRole('button', { name: 'Schließen' });
    await waitFor(() => expect(closeBtn).toHaveFocus());

    screen.getByRole('button', { name: 'Letzter Inhalt' }).focus();
    await user.tab();
    expect(closeBtn).toHaveFocus();
  });

  it('Shift+Tab am ersten fokussierbaren Element (Schließen-Button) springt zyklisch zum letzten', async () => {
    const user = userEvent.setup();
    render(
      <Sheet open onClose={() => {}} title="T">
        <button type="button">Erster Inhalt</button>
        <button type="button">Letzter Inhalt</button>
      </Sheet>,
    );

    const closeBtn = screen.getByRole('button', { name: 'Schließen' });
    await waitFor(() => expect(closeBtn).toHaveFocus());

    const lastBtn = screen.getByRole('button', { name: 'Letzter Inhalt' });
    closeBtn.focus();
    await user.tab({ shift: true });
    expect(lastBtn).toHaveFocus();
  });

  it('erstes Escape schließt ein offenes Dropdown-Popover im Sheet, erst das zweite das Sheet', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Sheet open onClose={onClose} title="Filter">
        <MultiSelectDropdown
          label="Typ"
          options={[{ value: 'a', label: 'Alpha' }]}
          selected={new Set<string>()}
          onChange={() => {}}
        />
      </Sheet>,
    );

    await user.click(screen.getByRole('button', { name: 'Typ' }));
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeInTheDocument();

    // 1. Escape: schließt nur das Dropdown-Popover, das Sheet bleibt offen.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // 2. Escape: kein Popover mehr offen → das Sheet schließt.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
