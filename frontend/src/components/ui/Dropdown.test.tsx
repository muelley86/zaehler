/**
 * Tests für die Positionierungslogik des Dropdown-Popovers (`place()`):
 * öffnet standardmäßig nach unten, klappt aber nach oben auf, wenn der
 * Trigger nahe am unteren Viewport-Rand sitzt (z. B. im mobilen
 * Bottom-Sheet) und dort mehr Platz ist — siehe CLAUDE.md-Defekt
 * „Zählerart"-Dropdown im Erfassen-Sheet.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dropdown } from './Dropdown';

// DOMRect hat in jsdom keinen praktischen Konstruktor für Testzwecke — ein
// einfaches Objekt mit den benötigten Feldern erfüllt die Struktur bereits,
// ein Cast ist nicht nötig (die Rückgabetyp-Annotation reicht TypeScript).
function mockRect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 20,
    right: 120,
    width: 100,
    height: bottom - top,
    x: 20,
    y: top,
    toJSON: () => ({}),
  };
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

async function openDropdown() {
  const user = userEvent.setup();
  render(
    <Dropdown label="Test">
      <div>Inhalt</div>
    </Dropdown>,
  );
  await user.click(screen.getByRole('button', { name: 'Test' }));
  const content = screen.getByText('Inhalt');
  // content -> Panel-Div (Portal-Root mit dem inline style) -> document.body
  const panel = content.parentElement;
  if (!panel) throw new Error('Panel nicht gefunden');
  return panel;
}

describe('Dropdown place()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  it('öffnet nach unten, wenn genug Platz unterhalb des Triggers ist', async () => {
    setViewport(390, 812);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(mockRect(100, 140));

    const panel = await openDropdown();

    expect(panel.style.top).toBe('144px');
    expect(panel.style.bottom).toBe('');
  });

  it('öffnet nach oben, wenn der Trigger nahe am unteren Viewport-Rand sitzt (Bottom-Sheet)', async () => {
    setViewport(390, 1218);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(mockRect(1080, 1120));

    const panel = await openDropdown();

    expect(panel.style.bottom).toBe('142px');
    expect(panel.style.top).toBe('');
    const maxHeight = Number.parseFloat(panel.style.maxHeight);
    expect(maxHeight).toBeLessThanOrEqual(1072);
    expect(maxHeight).toBeLessThanOrEqual(0.7 * 1218);
  });

  it('begrenzt maxHeight nie unter 160px, auch bei sehr wenig Platz auf beiden Seiten', async () => {
    setViewport(390, 300);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(mockRect(140, 160));

    const panel = await openDropdown();

    const maxHeight = Number.parseFloat(panel.style.maxHeight);
    expect(maxHeight).toBeGreaterThanOrEqual(160);
  });
});
