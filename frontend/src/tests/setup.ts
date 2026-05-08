import '@testing-library/jest-dom/vitest';

import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { server } from './server';

// jsdom hat kein window.matchMedia. useChartTheme.ts nutzt es zum
// Erkennen des System-Themes — wir mocken es als no-op, damit
// MutationObserver/Eventlistener-Setup nicht crasht.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// msw als API-Mock-Server (nur in Tests aktiv). Tests, die keine HTTP-Requests
// machen, sind davon nicht betroffen — onUnhandledRequest='error' fängt
// versehentlich nicht gemockte Requests in neuen Tests früh ab.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
