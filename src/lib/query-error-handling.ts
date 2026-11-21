import { AstroidApiError } from '@/services/client';
import { isMockMode } from '@/lib/env';

/**
 * Error contracts for the TanStack Query layer (issue #244).
 *
 * The provider wires these into global `QueryCache` / `MutationCache` handlers
 * so every async data fetch across the agent-management and wallet views gets
 * the same user-visible failure behaviour, instead of each screen inventing its
 * own. Keeping the classification logic here makes it reusable (and testable)
 * without importing the client component tree.
 *
 * Opt-out convention for call sites that own their error UI: pass
 * `meta: { skipGlobalErrorToast: true }` to `useQuery` / `useMutation` and the
 * global wrapper stands down. (`QueryMeta` is `Record<string, unknown>` in
 * this TanStack build, so no declaration merging is needed.)
 */

/**
 * Machine-readable `error.code` values from the API envelope
 * (`src/types/api.ts`) that describe a transient failure worth retrying.
 * Anything else (validation, auth, not-found) fails immediately.
 */
const RETRYABLE_API_ERROR_CODES = new Set([
  'NETWORK',
  'NETWORK_ERROR',
  'TIMEOUT',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'RATE_LIMIT',
  'RATE_LIMITED',
  'TOO_MANY_REQUESTS',
  'SERVER_ERROR',
  'INTERNAL_ERROR',
  'BAD_GATEWAY',
  'SERVICE_UNAVAILABLE',
]);

const NON_RETRYABLE_CLIENT_ERROR_CODES = new Set([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'UNPROCESSABLE_ENTITY',
  'VALIDATION_ERROR',
  'INVALID_REQUEST',
]);

/**
 * Turns an unknown thrown value from a queryFn/mutationFn into a message that
 * is safe to show a user. `AstroidApiError` messages are already server-authored
 * copy; a `TypeError` is what `fetch` throws when the network itself is
 * unreachable; everything else falls back to a generic sentence rather than
 * leaking `undefined` or an object into the UI.
 */
export function getQueryErrorMessage(error: unknown): string {
  if (error instanceof AstroidApiError) {
    return error.message || 'The Astroid API returned an unexpected error.';
  }
  if (error instanceof TypeError) {
    return 'Cannot reach the Astroid API. Check your connection and try again.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong while loading this data.';
}

/**
 * Retry policy input: only transient failures (network drops, 5xx server errors,
 * rate limits) are retried, while client-side 4xx errors (e.g. 400, 401, 403, 404)
 * fail immediately without pointless retries.
 * Never retries in mock mode (`NEXT_PUBLIC_API_URL` unset), where the resource layer
 * already serves fixture data and a rejection is deterministic app logic, not a blip.
 */
export function isRetryableQueryError(
  error: unknown,
  mockMode: boolean = isMockMode,
): boolean {
  if (mockMode) {
    return false;
  }

  // Check HTTP status code if present on the error object
  if (typeof error === 'object' && error !== null) {
    const status = (error as { status?: unknown; statusCode?: unknown }).status ??
      (error as { status?: unknown; statusCode?: unknown }).statusCode;
    if (typeof status === 'number') {
      if (status >= 400 && status < 500 && status !== 429) {
        return false;
      }
      if (status >= 500 || status === 429) {
        return true;
      }
    }
  }

  if (error instanceof AstroidApiError) {
    const code = error.code.toUpperCase();
    if (NON_RETRYABLE_CLIENT_ERROR_CODES.has(code)) {
      return false;
    }
    return RETRYABLE_API_ERROR_CODES.has(code);
  }

  // fetch() rejects with TypeError on DNS/connection drops — retry those.
  if (error instanceof TypeError) {
    return true;
  }

  // Common network or timeout error signatures
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('failed to fetch') ||
      msg.includes('network error') ||
      msg.includes('network request failed') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout')
    ) {
      return true;
    }
  }

  return false;
}

/** Stable, human-readable string for a query/mutation key, used for toast ids. */
export function formatQueryKey(key: readonly unknown[]): string {
  return key.map((part) => String(part)).join('/');
}
