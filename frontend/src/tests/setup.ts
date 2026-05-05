import '@testing-library/jest-dom/vitest';

import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './server';

// msw als API-Mock-Server (nur in Tests aktiv). Tests, die keine HTTP-Requests
// machen, sind davon nicht betroffen — onUnhandledRequest='error' fängt
// versehentlich nicht gemockte Requests in neuen Tests früh ab.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
