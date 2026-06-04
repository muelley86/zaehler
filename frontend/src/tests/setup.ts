import '@testing-library/jest-dom/vitest';

import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { server } from './server';

// jsdom hat kein URL.createObjectURL / revokeObjectURL — beide werden vom
// Foto-Picker für die lokale Vorschau benutzt.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
  URL.revokeObjectURL = vi.fn();
}

// jsdom hat kein window.matchMedia. useChartTheme.ts nutzt es zum
// Erkennen des System-Themes — wir mocken es als no-op, damit
// MutationObserver/Eventlistener-Setup nicht crasht. BEWUSST eine reine
// Funktion (kein vi.fn): Tests, die in ihrem afterEach `vi.restoreAllMocks()`
// rufen, würden einen vi.fn-Mock aushebeln (Implementierung → undefined),
// sodass spätere Chart-Mounts in derselben Datei `mq.addEventListener` auf
// undefined aufriefen.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom hat kein ResizeObserver — Recharts' ResponsiveContainer braucht es beim
// Mount. Charts werden in jsdom mangels Layout-Maßen ohnehin nicht gemessen;
// der Stub verhindert nur den ReferenceError.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// msw als API-Mock-Server (nur in Tests aktiv). Tests, die keine HTTP-Requests
// machen, sind davon nicht betroffen — onUnhandledRequest='error' fängt
// versehentlich nicht gemockte Requests in neuen Tests früh ab.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
