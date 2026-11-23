import { create } from 'zustand';

import { env } from '@/lib/env';

/**
 * Stellar Horizon endpoint failover (issue #522).
 *
 * The wallet layer used to assume the single configured Horizon node always
 * answers. A degraded node (timeout, connection refused, 5xx) then surfaced as a
 * raw rejection or left the balance widget spinning. This module owns:
 *
 * - a resolved endpoint pool (primary + optional same-network fallbacks),
 * - a failover fetch that retries the next endpoint when one is unreachable,
 * - a small store recording endpoint health and whether the wallet layer has
 *   degraded to read-only (all endpoints offline), so the UI can explain why
 *   cached balances are being shown.
 *
 * Failover deliberately never crosses networks: fallbacks are only taken from
 * `NEXT_PUBLIC_HORIZON_FALLBACK_URLS`, and callers decide which network's pool
 * to request.
 */

/* -------------------------------------------------------------------------- */
/* Endpoint pool                                                              */
/* -------------------------------------------------------------------------- */

export interface StellarEndpoint {
  /** Stable id used for health bookkeeping (`primary`, `fallback-1`, …). */
  id: string;
  /** Human label for logs and diagnostics. */
  label: string;
  /** Base URL without a trailing slash. */
  url: string;
}

/** Hard ceiling for a single endpoint attempt. */
export const DEFAULT_ENDPOINT_TIMEOUT_MS = 8_000;

/** True when a string is an absolute http(s) URL; trims a trailing slash. */
export function normalizeEndpointUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/**
 * Builds the ordered pool for a network: the configured primary first, then the
 * deduplicated fallbacks from `NEXT_PUBLIC_HORIZON_FALLBACK_URLS`.
 */
export function resolveStellarEndpoints(
  primaryUrl: string,
  fallbackUrls: readonly string[] = env.horizonFallbackUrls,
): StellarEndpoint[] {
  const primary = normalizeEndpointUrl(primaryUrl);
  const candidates = primary ? [primary, ...fallbackUrls] : [...fallbackUrls];

  const seen = new Set<string>();
  const endpoints: StellarEndpoint[] = [];

  for (const candidate of candidates) {
    const url = normalizeEndpointUrl(candidate);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const isPrimary = endpoints.length === 0 && url === primary;
    endpoints.push({
      id: isPrimary ? 'primary' : `fallback-${endpoints.length}`,
      label: isPrimary ? 'Primary Horizon' : `Fallback ${endpoints.length}`,
      url,
    });
  }

  return endpoints;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export type StellarEndpointFailureKind = 'timeout' | 'network' | 'http';

export interface StellarEndpointFailure {
  endpoint: StellarEndpoint;
  kind: StellarEndpointFailureKind;
  /** HTTP status for `http` failures. */
  status?: number;
  message: string;
}

/** Raised when every endpoint in the pool failed. */
export class StellarEndpointFailoverError extends Error {
  readonly failures: readonly StellarEndpointFailure[];
  /** True for a deterministic 4xx that failover cannot fix (bad request, auth). */
  readonly fatal: boolean;

  constructor(
    message: string,
    failures: readonly StellarEndpointFailure[],
    fatal = false,
  ) {
    super(message);
    this.name = 'StellarEndpointFailoverError';
    this.failures = failures;
    this.fatal = fatal;
  }
}

/** A valid account id that simply does not exist on the ledger yet. */
export class StellarAccountNotFoundError extends Error {
  constructor(message = 'This Stellar account is not funded on the selected network.') {
    super(message);
    this.name = 'StellarAccountNotFoundError';
  }
}

/** Caller-initiated cancellation; never a network failure. */
export class StellarRequestAbortedError extends Error {
  constructor(message = 'Stellar request aborted.') {
    super(message);
    this.name = 'AbortError';
  }
}

/* -------------------------------------------------------------------------- */
/* Health store                                                               */
/* -------------------------------------------------------------------------- */

export type StellarEndpointHealth = 'unknown' | 'healthy' | 'degraded';

/** `read-only` means every endpoint failed; only cached data can be shown. */
export type StellarWalletTransport = 'live' | 'read-only';

export interface StellarEndpointStoreState {
  pool: StellarEndpoint[];
  health: Record<string, StellarEndpointHealth>;
  consecutiveFailures: Record<string, number>;
  lastError: Record<string, string | null>;
  /** Endpoint that served the most recent successful request. */
  activeEndpointId: string | null;
  /** Endpoint that failed immediately before the last successful failover. */
  lastFailoverFrom: string | null;
  lastFailoverAt: string | null;
  transport: StellarWalletTransport;
  registerPool: (endpoints: readonly StellarEndpoint[]) => void;
  recordSuccess: (endpoint: StellarEndpoint) => void;
  recordFailure: (endpoint: StellarEndpoint, message: string) => void;
  recordFailover: (fromEndpointId: string | null, to: StellarEndpoint) => void;
  degradeToReadOnly: () => void;
  reset: () => void;
}

export const useStellarEndpointStore = create<StellarEndpointStoreState>((set) => ({
  pool: [],
  health: {},
  consecutiveFailures: {},
  lastError: {},
  activeEndpointId: null,
  lastFailoverFrom: null,
  lastFailoverAt: null,
  transport: 'live',

  registerPool: (endpoints) =>
    set((state) => {
      const pool = [...endpoints];
      const health = { ...state.health };
      for (const endpoint of pool) {
        health[endpoint.id] = health[endpoint.id] ?? 'unknown';
      }
      return { pool, health };
    }),

  recordSuccess: (endpoint) =>
    set((state) => ({
      health: { ...state.health, [endpoint.id]: 'healthy' },
      consecutiveFailures: { ...state.consecutiveFailures, [endpoint.id]: 0 },
      lastError: { ...state.lastError, [endpoint.id]: null },
      activeEndpointId: endpoint.id,
      transport: 'live',
    })),

  recordFailure: (endpoint, message) =>
    set((state) => ({
      health: { ...state.health, [endpoint.id]: 'degraded' },
      consecutiveFailures: {
        ...state.consecutiveFailures,
        [endpoint.id]: (state.consecutiveFailures[endpoint.id] ?? 0) + 1,
      },
      lastError: { ...state.lastError, [endpoint.id]: message },
    })),

  recordFailover: (fromEndpointId, to) =>
    set({
      activeEndpointId: to.id,
      lastFailoverFrom: fromEndpointId,
      lastFailoverAt: new Date().toISOString(),
      transport: 'live',
    }),

  degradeToReadOnly: () => set({ transport: 'read-only' }),

  reset: () =>
    set({
      pool: [],
      health: {},
      consecutiveFailures: {},
      lastError: {},
      activeEndpointId: null,
      lastFailoverFrom: null,
      lastFailoverAt: null,
      transport: 'live',
    }),
}));

/** True when no endpoint is answering; the UI should label balances as cached. */
export function isStellarTransportDegraded(): boolean {
  return getStellarEndpointState().transport === 'read-only';
}

/** Snapshot helper for non-React consumers (fetch layer, tests). */
export function getStellarEndpointState(): StellarEndpointStoreState {
  return useStellarEndpointStore.getState();
}

/* -------------------------------------------------------------------------- */
/* Failover fetch                                                             */
/* -------------------------------------------------------------------------- */

export type StellarFetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchStellarWithFailoverOptions {
  /** Ordered pool; first entry is the primary. */
  endpoints: readonly StellarEndpoint[];
  /** Path appended to the endpoint base URL, e.g. `/accounts/G…`. */
  path: string;
  /** Caller cancellation (React Query's signal). */
  signal?: AbortSignal;
  /** Per-endpoint timeout. Defaults to 8s. */
  timeoutMs?: number;
  /** Injectable fetch for tests and non-browser runtimes. */
  fetchImpl?: StellarFetchImpl;
  /** Extra headers merged over `Accept: application/json`. */
  headers?: Record<string, string>;
  /** Exponential backoff between endpoints. Defaults to 0 (fail fast). */
  retryDelayMs?: number;
  /** Record probes into {@link useStellarEndpointStore}. Defaults to true. */
  trackStatus?: boolean;
}

export interface StellarEndpointResult<T> {
  data: T;
  endpoint: StellarEndpoint;
  /** 1-based index of the endpoint that answered. */
  attempts: number;
  /** Failures collected before the successful attempt. */
  failures: readonly StellarEndpointFailure[];
}

type EndpointAttempt<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not-found' }
  | { kind: 'http'; status: number };

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function requestEndpoint<T>(
  endpoint: StellarEndpoint,
  path: string,
  context: {
    timeoutMs: number;
    signal?: AbortSignal;
    fetchImpl: StellarFetchImpl;
    headers?: Record<string, string>;
  },
): Promise<EndpointAttempt<T>> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, context.timeoutMs);

  const onExternalAbort = () => controller.abort();
  context.signal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await context.fetchImpl(`${endpoint.url}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...context.headers },
    });

    if (response.status === 404) return { kind: 'not-found' };
    if (!response.ok) return { kind: 'http', status: response.status };

    const data = (await response.json()) as T;
    return { kind: 'ok', data };
  } catch (error) {
    if (context.signal?.aborted) {
      throw new StellarRequestAbortedError();
    }
    if (timedOut) {
      throw new Error(
        `${endpoint.label} timed out after ${context.timeoutMs}ms.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    context.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Requests `path` from the first endpoint that answers.
 *
 * - Network failures, timeouts, malformed payloads and 429/5xx responses move
 *   on to the next endpoint.
 * - 404 stops the chain: the account simply is not funded, and every endpoint
 *   would report the same thing.
 * - Other 4xx responses are deterministic, so they fail fast without fanning
 *   out to the rest of the pool.
 * - Caller cancellation is rethrown untouched so React Query can treat it as a
 *   cancellation rather than an error.
 *
 * Throws {@link StellarAccountNotFoundError} for 404,
 * {@link StellarRequestAbortedError} on cancellation, and
 * {@link StellarEndpointFailoverError} when the pool is exhausted or a
 * deterministic 4xx is hit.
 */
export async function fetchStellarWithFailover<T>({
  endpoints,
  path,
  signal,
  timeoutMs = DEFAULT_ENDPOINT_TIMEOUT_MS,
  fetchImpl,
  headers,
  retryDelayMs = 0,
  trackStatus = true,
}: FetchStellarWithFailoverOptions): Promise<StellarEndpointResult<T>> {
  if (endpoints.length === 0) {
    throw new StellarEndpointFailoverError(
      'No Stellar Horizon endpoint is configured.',
      [],
      true,
    );
  }

  const store = useStellarEndpointStore.getState();
  if (trackStatus) store.registerPool(endpoints);

  const resolvedFetch: StellarFetchImpl =
    fetchImpl ?? ((input, init) => globalThis.fetch(input, init));

  const failures: StellarEndpointFailure[] = [];

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    if (!endpoint) continue;

    if (signal?.aborted) throw new StellarRequestAbortedError();
    if (index > 0 && retryDelayMs > 0) await wait(retryDelayMs * index);

    let attempt: EndpointAttempt<T>;
    try {
      attempt = await requestEndpoint<T>(endpoint, path, {
        timeoutMs,
        signal,
        fetchImpl: resolvedFetch,
        headers,
      });
    } catch (error) {
      if (error instanceof StellarRequestAbortedError) throw error;

      const failure: StellarEndpointFailure = {
        endpoint,
        kind: /timed out/i.test(error instanceof Error ? error.message : '')
          ? 'timeout'
          : 'network',
        message: error instanceof Error ? error.message : 'Network request failed.',
      };
      failures.push(failure);
      if (trackStatus) store.recordFailure(endpoint, failure.message);
      console.warn(
        `[stellar-endpoint] ${endpoint.id} (${endpoint.url}) failed: ${failure.message}`,
      );
      continue;
    }

    if (attempt.kind === 'not-found') {
      if (trackStatus) store.recordSuccess(endpoint);
      throw new StellarAccountNotFoundError(
        `Account not found on ${endpoint.label}.`,
      );
    }

    if (attempt.kind === 'http') {
      const failure: StellarEndpointFailure = {
        endpoint,
        kind: 'http',
        status: attempt.status,
        message: `Horizon responded with HTTP ${attempt.status}.`,
      };
      failures.push(failure);
      if (trackStatus) store.recordFailure(endpoint, failure.message);

      const deterministic = attempt.status >= 400 && attempt.status < 500 && attempt.status !== 429;
      if (deterministic) {
        throw new StellarEndpointFailoverError(
          `Stellar request rejected (HTTP ${attempt.status}).`,
          failures,
          true,
        );
      }

      console.warn(
        `[stellar-endpoint] ${endpoint.id} (${endpoint.url}) returned HTTP ${attempt.status}; trying the next endpoint.`,
      );
      continue;
    }

    if (trackStatus) {
      store.recordSuccess(endpoint);
      if (index > 0) store.recordFailover(endpoints[index - 1]?.id ?? null, endpoint);
    }

    return { data: attempt.data, endpoint, attempts: index + 1, failures };
  }

  if (trackStatus) store.degradeToReadOnly();

  const lastFailure = failures[failures.length - 1];
  throw new StellarEndpointFailoverError(
    `Stellar network unreachable: ${failures.length} endpoint${
      failures.length === 1 ? '' : 's'
    } failed${lastFailure ? ` (last: ${lastFailure.message})` : ''}. Cached balances remain available.`,
    failures,
  );
}
