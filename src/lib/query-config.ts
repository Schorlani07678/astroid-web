/**
 * Shared TanStack Query cache + polling presets (issue #552).
 *
 * Keeping the numbers in one place means agent, wallet and telemetry hooks
 * agree on how long data stays fresh, how long an unused entry is kept before
 * garbage collection, and how polling slows down while the backend is failing.
 *
 * This module is deliberately dependency-free (no `@/` imports, no React) so
 * it can be unit tested with plain Node.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export interface QueryCachePreset {
  /** How long fetched data counts as fresh (no refetch on mount/focus). */
  staleTime: number;
  /** How long an entry with no observers survives before being collected. */
  gcTime: number;
}

/**
 * - `static`: effectively session-scoped reference data (the current user, orgs).
 * - `entity`: agent/wallet records that change on user action or realtime push;
 *   a long `gcTime` lets navigating away and back reuse the cache instead of
 *   re-fetching.
 * - `live`: balances and telemetry that are polled; short `staleTime`, but a
 *   `gcTime` well above the poll interval so a quick page switch is instant.
 */
export const QUERY_CACHE = {
  static: { staleTime: 10 * MINUTE, gcTime: 30 * MINUTE },
  entity: { staleTime: 30 * SECOND, gcTime: 10 * MINUTE },
  live: { staleTime: 15 * SECOND, gcTime: 5 * MINUTE },
  metrics: { staleTime: 60 * SECOND, gcTime: 10 * MINUTE },
  agentStatus: { staleTime: 30 * SECOND, gcTime: 5 * MINUTE },
} as const satisfies Record<string, QueryCachePreset>;

export const POLL_INTERVALS = {
  /** Wallet balances and rates. */
  balances: 30 * SECOND,
  /** Network/telemetry health, where freshness matters more. */
  telemetry: 15 * SECOND,
  /** Financial overview and budget metrics. */
  metrics: 60 * SECOND,
  /** Agent operational status updates. */
  agentStatus: 30 * SECOND,
} as const;

export const RETRY_CONFIG = {
  /** Explicit maximum number of retries for transient queries. */
  maxRetries: 3,
  /** Base delay before the first retry in milliseconds. */
  baseDelayMs: 1_000,
  /** Cap on the retry interval in milliseconds. */
  maxDelayMs: 30_000,
  /** Exponential backoff multiplier per attempt. */
  factor: 2,
} as const;

/**
 * Computes exponential backoff delay for query retries:
 * attempt 0 -> 1000ms, attempt 1 -> 2000ms, attempt 2 -> 4000ms, capped at maxDelayMs.
 */
export function queryRetryDelay(
  attemptIndex: number,
  options: { baseDelayMs?: number; maxDelayMs?: number; factor?: number } = {},
): number {
  const base = options.baseDelayMs ?? RETRY_CONFIG.baseDelayMs;
  const max = options.maxDelayMs ?? RETRY_CONFIG.maxDelayMs;
  const factor = options.factor ?? RETRY_CONFIG.factor;
  const attempt = Number.isFinite(attemptIndex) ? Math.max(0, Math.floor(attemptIndex)) : 0;
  const delay = base * Math.pow(factor, attempt);
  return Math.min(Number.isFinite(delay) ? delay : max, max);
}

export interface BackoffOptions {
  /** Interval used while the last fetch succeeded. */
  baseMs: number;
  /** Upper bound the interval never exceeds. Defaults to 8x `baseMs`. */
  maxMs?: number;
  /** Multiplier per consecutive failure. Defaults to 2. */
  factor?: number;
}

/** Interval after `failureCount` consecutive failures (0 → `baseMs`). */
export function backoffDelay(
  failureCount: number,
  { baseMs, maxMs = baseMs * 8, factor = 2 }: BackoffOptions,
): number {
  const failures = Number.isFinite(failureCount) ? Math.max(0, Math.floor(failureCount)) : 0;
  const delay = baseMs * Math.pow(factor, failures);
  return Math.min(Number.isFinite(delay) ? delay : maxMs, maxMs);
}

/** The slice of a TanStack `Query` that backoff polling reads. */
export interface BackoffQuerySnapshot {
  state: { fetchFailureCount: number };
}

/**
 * Builds a `refetchInterval` callback that polls at `baseMs` while healthy and
 * backs off exponentially (up to `maxMs`) while consecutive fetches fail, then
 * snaps back to `baseMs` on the first success. Pair it with
 * `refetchIntervalInBackground: false` so hidden tabs never poll.
 */
export function createBackoffRefetchInterval(
  options: BackoffOptions,
): (query: BackoffQuerySnapshot) => number {
  return (query) => backoffDelay(query.state.fetchFailureCount, options);
}
