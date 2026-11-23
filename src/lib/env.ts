/**
 * Runtime environment configuration.
 *
 * When `NEXT_PUBLIC_API_URL` is empty the client runs in mock mode and every
 * screen renders realistic data without a backend. Set the variable to point the
 * typed API client at a live Astroid API.
 */

/** Parses a comma-separated env var into trimmed, non-empty values. */
function readList(value: string | undefined): readonly string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
  apiVersion: process.env.NEXT_PUBLIC_API_VERSION ?? '/api/v1',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Stellar Horizon node used for live account balance polling. */
  horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon.stellar.org',
  /**
   * Same-network Horizon fallbacks tried when the primary is unreachable.
   * Comma-separated in `NEXT_PUBLIC_HORIZON_FALLBACK_URLS`.
   */
  horizonFallbackUrls: readList(process.env.NEXT_PUBLIC_HORIZON_FALLBACK_URLS),
  mockLatencyMs: readNumber(process.env.NEXT_PUBLIC_MOCK_LATENCY_MS, 320),
  mockLatencyJitterMs: readNumber(process.env.NEXT_PUBLIC_MOCK_LATENCY_JITTER_MS, 80),
  mockFailureRate: Math.min(1, readNumber(process.env.NEXT_PUBLIC_MOCK_FAILURE_RATE, 0)),
} as const;

/** True when no API base is configured — the app serves mock data. */
export const isMockMode = env.apiUrl.trim().length === 0;

/** True when Supabase credentials are configured — enables real-time subscriptions. */
export const isSupabaseConfigured =
  env.supabaseUrl.trim().length > 0 && env.supabaseAnonKey.trim().length > 0;
