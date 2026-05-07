/**
 * Tests für den QR-Scanner-Modal.
 *
 * Der echte ``html5-qrcode``-Import ist gemockt — wir simulieren die beiden
 * relevanten Pfade: erfolgreicher Decode und Permission-Denied.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';

// Wird im Test pro Fall überschrieben (Decode-Erfolg vs. Permission-Denied).
// Reset passiert in beforeEach, damit der TS-Control-Flow im Test-Body den
// declared Union-Typ behält und Optional-Calls (``capturedSuccess?.(...)``)
// nicht zu ``never`` narrowen.
let _capturedSuccess: ((decodedText: string) => void) | null = null;
let _startBehavior: 'success' | 'denied' = 'success';

vi.mock('html5-qrcode', () => {
  return {
    Html5Qrcode: class {
      constructor(_id: string) {
        // ID wird nicht ausgewertet — Test rendert kein echtes <video>.
      }
      // Bewusst kein `async`: ohne `await` würde `require-await` anschlagen,
      // ein synchrones `throw` würde aber den Test crashen statt von der
      // `.catch()`-Kette des Aufrufers gefangen zu werden. Daher explizites
      // Promise — Reject-Pfad verhält sich identisch zur echten Implementierung.
      start(
        _camera: unknown,
        _config: unknown,
        onSuccess: (decodedText: string) => void,
        _onError?: unknown,
      ): Promise<void> {
        if (_startBehavior === 'denied') {
          return Promise.reject(new Error('NotAllowedError: Permission denied by user'));
        }
        _capturedSuccess = onSuccess;
        return Promise.resolve();
      }
      stop(): Promise<void> {
        return Promise.resolve();
      }
      clear(): void {
        /* noop */
      }
    },
  };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

// Lazy-Import: erst NACH den vi.mock-Calls, sonst greift der Mock nicht.
async function loadSheet() {
  const mod = await import('./QrScanSheet');
  return mod.QrScanSheet;
}

describe('QrScanSheet', () => {
  beforeEach(() => {
    _capturedSuccess = null;
    _startBehavior = 'success';
    navigateMock.mockReset();
  });

  it('navigiert nach erfolgreichem Decode auf /erfassen?mp=…', async () => {
    const QrScanSheet = await loadSheet();
    const onClose = vi.fn();
    renderWithRouter(<QrScanSheet open onClose={onClose} />);

    // Library bekommt den Success-Callback. Warten, bis er gesetzt ist.
    await waitFor(() => expect(_capturedSuccess).not.toBeNull());

    _capturedSuccess?.('https://zaehler.example/erfassen?mp=42');

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/erfassen?mp=42'));
    expect(onClose).toHaveBeenCalled();
  });

  it('zeigt Permission-Denied-Hinweis, wenn Kamera abgelehnt wurde', async () => {
    _startBehavior = 'denied';

    const QrScanSheet = await loadSheet();
    renderWithRouter(<QrScanSheet open onClose={() => {}} />);

    expect(await screen.findByText(/Kamerazugriff verweigert/)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('rendert nichts, wenn open=false ist', async () => {
    const QrScanSheet = await loadSheet();
    const { container } = renderWithRouter(<QrScanSheet open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('schließt sich beim Klick auf den X-Button', async () => {
    const QrScanSheet = await loadSheet();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithRouter(<QrScanSheet open onClose={onClose} />);

    await waitFor(() => expect(_capturedSuccess).not.toBeNull());
    await user.click(screen.getByLabelText('Scanner schließen'));
    expect(onClose).toHaveBeenCalled();
  });

  it('ignoriert QR-Codes ohne mp-Param', async () => {
    const QrScanSheet = await loadSheet();
    const onClose = vi.fn();
    renderWithRouter(<QrScanSheet open onClose={onClose} />);

    await waitFor(() => expect(_capturedSuccess).not.toBeNull());
    _capturedSuccess?.('https://example.com/whatever');

    // Kein Navigate, kein Close — Scanner läuft weiter.
    expect(navigateMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
