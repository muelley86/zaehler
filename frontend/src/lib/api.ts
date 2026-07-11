/**
 * Schmaler fetch-Wrapper für die JSON-API.
 *
 * Setzt automatisch Cookies (`credentials: same-origin`), parst JSON und
 * wandelt Fehler-Responses in eine typisierte `ApiError` um (basierend auf
 * dem RFC-7807-Format des Backends). 204-Antworten werden zu `undefined`.
 */

import { reportOffline, reportOnline } from './offline/connectivity';
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

/**
 * Netzfehler (Server nicht erreichbar): fetch hat KEINE Response geliefert —
 * offline, DNS-Fehler, Connection refused. Vorher schlug hier ein roher
 * `TypeError` durch, der alle `instanceof ApiError`-Zweige umging und zu
 * stummen Fehlern führte. Aborts werden bewusst NICHT gewrappt.
 */
export class NetworkError extends Error {
  override cause: unknown;

  constructor(cause: unknown) {
    super('Server nicht erreichbar');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/**
 * fetch mit Offline-Erkennung: jede erhaltene Response (auch 4xx/5xx) meldet
 * "online", jede Netz-Rejection meldet "offline" und wird zum `NetworkError`.
 */
async function fetchWithConnectivity(input: string, init: RequestInit): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(input, init);
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }
    reportOffline();
    throw new NetworkError(err);
  }
  reportOnline();
  return resp;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Gemeinsames Response-Handling für ``request`` und ``upload``: 204 → undefined,
 * sonst JSON parsen; Fehler-Responses werden zur typisierten ``ApiError``
 * (RFC-7807, Fallback aus statusText/status).
 */
async function parseJsonResponse<T>(resp: Response): Promise<T> {
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

function buildRequestInit(options: RequestOptions): RequestInit {
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
  return init;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const resp = await fetchWithConnectivity(`${API_BASE}${path}`, buildRequestInit(options));
  return parseJsonResponse<T>(resp);
}

async function upload<T>(path: string, method: 'PUT' | 'POST', formData: FormData): Promise<T> {
  // Multipart-Upload: kein Content-Type setzen — der Browser muss den
  // ``multipart/form-data; boundary=…`` selbst generieren.
  const resp = await fetchWithConnectivity(`${API_BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    body: formData,
  });
  return parseJsonResponse<T>(resp);
}

/**
 * GET-Antwort inkl. Zeitstempel: `servedAt` stammt aus dem `Date`-Header.
 * Kommt die Antwort aus dem Service-Worker-Cache (Workbox speichert die
 * Response samt Headern), ist das der Zeitpunkt der URSPRÜNGLICHEN
 * Server-Antwort — genau das "Stand von …" für die Offline-Anzeige.
 */
export interface WithMeta<T> {
  data: T;
  servedAt: Date | null;
}

async function getWithMeta<T>(path: string, signal?: AbortSignal): Promise<WithMeta<T>> {
  const resp = await fetchWithConnectivity(
    `${API_BASE}${path}`,
    buildRequestInit(signal ? { signal } : {}),
  );
  const dateHeader = resp.headers.get('date');
  const parsed = dateHeader ? new Date(dateHeader) : null;
  const servedAt = parsed !== null && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const data = await parseJsonResponse<T>(resp);
  return { data, servedAt };
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}),
  getWithMeta,
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData, method: 'PUT' | 'POST' = 'PUT') =>
    upload<T>(path, method, formData),
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
