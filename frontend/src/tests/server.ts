/**
 * msw-Setup für Vitest. Tests können Handler dynamisch via
 * ``server.use(...)`` ergänzen; nach jedem Test werden sie
 * zurückgesetzt.
 */

import { setupServer } from 'msw/node';

export const server = setupServer();
