/**
 * Schmaler fetch-Wrapper für die JSON-API.
 *
 * Setzt automatisch Cookies (`credentials: same-origin`), parst JSON und
 * wandelt Fehler-Responses in eine typisierte `ApiError` um (basierend auf
 * dem RFC-7807-Format des Backends). 204-Antworten werden zu `undefined`.
 */

import type { ProblemDetails } from './types';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  status: number;
  problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.problem = problem;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (signal) init.signal = signal;
  if (body !== undefined) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(`${API_BASE}${path}`, init);
  if (resp.status === 204) {
    return undefined as T;
  }
  const text = await resp.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    const problem: ProblemDetails =
      data && typeof data === 'object'
        ? (data as ProblemDetails)
        : { title: resp.statusText, status: resp.status };
    throw new ApiError(problem);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * Erkennt einen Plausibilitäts-Warning-Fehler des Backends:
 * Status 400 mit ``acknowledge_field === 'acknowledge_warnings'``. CLAUDE.md
 * verlangt eine Warnung statt eines harten Blocks — der Aufrufer zeigt einen
 * Confirm-Dialog und sendet die zweite Anfrage mit ``acknowledge_warnings: true``.
 */
export function isPlausibilityWarning(err: ApiError): boolean {
  if (err.status !== 400) return false;
  const problem = err.problem as unknown as Record<string, unknown>;
  return problem['acknowledge_field'] === 'acknowledge_warnings';
}
