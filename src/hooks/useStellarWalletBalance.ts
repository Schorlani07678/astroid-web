'use client';

import { useEffect, useRef } from 'react';
import { useQuery, type QueryObserverResult, type RefetchOptions } from '@tanstack/react-query';
import { toast } from 'sonner';

import { queryKeys } from '@/services/query-keys';
import { isMockMode } from '@/lib/env';
import {
  fetchStellarWithFailover,
  resolveStellarEndpoints,
  StellarAccountNotFoundError,
  StellarEndpointFailoverError,
  StellarRequestAbortedError,
} from '@/stores/stellar-endpoint-store';
import {
  normalizeFreighterError,
  useStellarWallet,
  type FreighterWalletError,
  type StellarWalletStatus,
} from './useStellarWallet';

/**
 * Stellar wallet balance hook.
 *
 * Replaces the previous hand-rolled "fetch on mount, store in useState"
 * pattern for live Freighter balances with a TanStack Query pipeline:
 * exponential-backoff retries, explicit staleTime/gcTime caching, typed
 * error classification (shared with the connection layer), and `sonner`
 * toast notifications when a balance interaction fails or times out.
 */

/** Mainnet Horizon; pass `networkUrl` for testnet or an RPC proxy. */
export const STELLAR_MAINNET_HORIZON_URL = 'https://horizon.stellar.org';

/** Demo account used when the app runs in mock-data mode (no wallet needed). */
export const MOCK_STELLAR_PUBLIC_KEY = 'GAMockWalletAccountXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXA';

const BALANCE_STALE_TIME_MS = 30_000;
const BALANCE_GC_TIME_MS = 5 * 60_000;
const BALANCE_MAX_RETRIES = 3;
const BALANCE_FETCH_TIMEOUT_MS = 8_000;
const BALANCE_TOAST_ID = 'stellar-wallet-balance';

/** Bounded exponential backoff with full jitter, capped at 8s per attempt. */
export function stellarBalanceRetryDelay(attempt: number): number {
  const backoff = Math.min(1_000 * 2 ** attempt, BALANCE_FETCH_TIMEOUT_MS);
  return Math.round(backoff / 2 + Math.random() * (backoff / 2));
}

export interface StellarAssetBalance {
  /** Horizon asset type, e.g. `native`, `credit_alphanum4`, `liquidity_pool_shares`. */
  assetType: string;
  /** Human asset code (`XLM` for the native asset, else the issued code). */
  assetCode: string;
  /** Raw string balance as returned by Horizon (7-decimal precision). */
  balance: string;
  /** Parsed numeric balance. */
  amount: number;
  issuer?: string;
}

export interface StellarWalletBalanceSnapshot {
  publicKey: string;
  networkUrl: string;
  /** False when Horizon answers 404 — the account exists on no ledger yet. */
  funded: boolean;
  /** Total native XLM held by the account (0 when unfunded). */
  totalXlm: number;
  /** Non-native trustline balances. */
  assets: StellarAssetBalance[];
  /** True when served from the mock fixture rather than a live Horizon call. */
  isMock: boolean;
  /** Epoch millis of the successful fetch backing this snapshot. */
  fetchedAt: number;
}

export interface UseStellarWalletBalanceOptions {
  /** Horizon base URL. Defaults to mainnet. */
  networkUrl?: string;
  /** Master switch; the query also stays disabled without a connected wallet. */
  enabled?: boolean;
  /** Override the cache freshness window (defaults to 30s). */
  staleTime?: number;
  /** Override the exponential-backoff retry ceiling (defaults to 3). */
  retryCount?: number;
}

interface HorizonAccountResponse {
  id: string;
  balance: string;
  subentry_count?: number;
  balances?: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
  }>;
}

function toBalanceSnapshot(account: HorizonAccountResponse, publicKey: string, networkUrl: string): StellarWalletBalanceSnapshot {
  const assets: StellarAssetBalance[] = (account.balances ?? [])
    .filter((row) => row.asset_type !== 'native')
    .map((row) => ({
      assetType: row.asset_type,
      assetCode: row.asset_code ?? 'unknown',
      balance: row.balance,
      amount: Number(row.balance) || 0,
      issuer: row.asset_issuer,
    }));

  return {
    publicKey,
    networkUrl,
    funded: true,
    totalXlm: Number(account.balance) || 0,
    assets,
    isMock: false,
    fetchedAt: Date.now(),
  };
}

function mockBalanceSnapshot(publicKey: string, networkUrl: string): StellarWalletBalanceSnapshot {
  return {
    publicKey,
    networkUrl,
    funded: true,
    totalXlm: 4182.3550016,
    assets: [
      { assetType: 'credit_alphanum4', assetCode: 'USDC', balance: '12500.4200000', amount: 12500.42 },
      { assetType: 'credit_alphanum4', assetCode: 'ASTRO', balance: '98000.0000000', amount: 98000 },
    ],
    isMock: true,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch one account's balances from Horizon with a hard timeout.
 *
 * Requests go through the endpoint failover layer (issue #522): a timeout,
 * connection refusal or 429/5xx from the primary node automatically retries the
 * next configured endpoint before the user ever sees an error. Every remaining
 * failure mode (exhausted pool, abort, malformed payload) is mapped into the
 * shared typed `FreighterWalletError` classification. A 404 is a *successful*
 * result: a valid but unfunded account simply holds nothing.
 */
export async function fetchStellarWalletBalance(
  publicKey: string,
  networkUrl: string,
  timeoutMs = BALANCE_FETCH_TIMEOUT_MS,
): Promise<StellarWalletBalanceSnapshot> {
  let payload: unknown;

  try {
    const result = await fetchStellarWithFailover<unknown>({
      endpoints: resolveStellarEndpoints(networkUrl),
      path: `/accounts/${publicKey}`,
      timeoutMs,
    });
    payload = result.data;
  } catch (err) {
    if (err instanceof StellarAccountNotFoundError) {
      return {
        publicKey,
        networkUrl,
        funded: false,
        totalXlm: 0,
        assets: [],
        isMock: false,
        fetchedAt: Date.now(),
      };
    }

    if (err instanceof StellarRequestAbortedError) {
      throw normalizeFreighterError(
        new Error('The Stellar network request was cancelled.'),
        'Balance lookup cancelled.',
      );
    }

    if (err instanceof StellarEndpointFailoverError) {
      // The pool is exhausted (or the node rejected the request outright).
      // TanStack Query keeps the last successful snapshot on screen and the
      // endpoint store flips to `read-only` so the UI can label it as cached.
      throw normalizeFreighterError(
        new Error(err.message),
        'Stellar network lookup failed.',
      );
    }

    throw normalizeFreighterError(err, 'Balance lookup failed.');
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as HorizonAccountResponse).balance !== 'string'
  ) {
    throw normalizeFreighterError(
      new Error('Malformed account payload from Horizon.'),
      'Balance lookup failed.',
    );
  }

  return toBalanceSnapshot(payload as HorizonAccountResponse, publicKey, networkUrl);
}

export interface UseStellarWalletBalanceResult {
  /** Latest balance snapshot (undefined while loading or without a wallet). */
  data: StellarWalletBalanceSnapshot | undefined;
  /** Typed failure of the most recent balance interaction, if any. */
  error: FreighterWalletError | null;
  isLoading: boolean;
  isPending: boolean;
  isError: boolean;
  /** Live Freighter connection status driving the enabled/disabled state. */
  walletStatus: StellarWalletStatus;
  isConnected: boolean;
  /** True when no wallet is connected but balances cannot be requested. */
  isAwaitingWallet: boolean;
  refetch: (options?: RefetchOptions) => Promise<QueryObserverResult<StellarWalletBalanceSnapshot, FreighterWalletError>>;
}

/**
 * Cached, retrying balance feed for the connected Freighter wallet.
 *
 * - Disabled (no network traffic) until a wallet is connected — except in mock
 *   data mode, where a deterministic fixture keeps the dashboard rendering
 *   without Freighter installed.
 * - `staleTime`/`gcTime` caching plus bounded exponential-backoff retries.
 * - Fires one deduplicated `sonner` toast whenever an interaction fails or
 *   times out, or the wallet flips to locked/missing while active.
 */
export function useStellarWalletBalance(
  options: UseStellarWalletBalanceOptions = {},
): UseStellarWalletBalanceResult {
  const {
    networkUrl = STELLAR_MAINNET_HORIZON_URL,
    enabled = true,
    staleTime = BALANCE_STALE_TIME_MS,
    retryCount = BALANCE_MAX_RETRIES,
  } = options;

  const wallet = useStellarWallet();
  const publicKey = isMockMode ? MOCK_STELLAR_PUBLIC_KEY : wallet.publicKey;
  const balanceEnabled = enabled && Boolean(publicKey);

  const query = useQuery<StellarWalletBalanceSnapshot, FreighterWalletError>({
    queryKey: queryKeys.stellarBalance(publicKey ?? 'anonymous', networkUrl),
    queryFn: () => {
      if (isMockMode) {
        return Promise.resolve(mockBalanceSnapshot(MOCK_STELLAR_PUBLIC_KEY, networkUrl));
      }
      if (!publicKey) {
        return Promise.reject(
          normalizeFreighterError(
            new Error('No Freighter wallet is connected.'),
            'Connect a wallet to load balances.',
          ),
        );
      }
      return fetchStellarWalletBalance(publicKey, networkUrl);
    },
    enabled: balanceEnabled,
    staleTime,
    gcTime: BALANCE_GC_TIME_MS,
    retry: balanceEnabled ? retryCount : 0,
    retryDelay: stellarBalanceRetryDelay,
    refetchOnWindowFocus: false,
  });

  // Toast exactly once per distinct failure, keyed by classification so the
  // retries inside a single failing query produce a single notification.
  const lastToastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (query.error) {
      const key = `${query.error.kind}:${query.error.message}`;
      if (key !== lastToastKeyRef.current) {
        lastToastKeyRef.current = key;
        toast.error(query.error.message, {
          description: query.error.hint,
          duration: 6_000,
          id: BALANCE_TOAST_ID,
        });
      }
      return;
    }
    if (query.data) {
      lastToastKeyRef.current = null;
    }
  }, [query.error, query.data]);

  // Surface wallet-level failures (locked / missing extension) while the
  // balance feed is supposed to be live — the same user-facing notification
  // requirement applies to interactions that never reach the network.
  useEffect(() => {
    if (!enabled || isMockMode || balanceEnabled) return;
    if (wallet.status !== 'missing' && wallet.status !== 'error') return;
    const key = `wallet:${wallet.status}`;
    if (lastToastKeyRef.current === key) return;
    lastToastKeyRef.current = key;
    const message = wallet.status === 'missing' ? 'Freighter is not installed.' : 'Freighter could not connect.';
    const hint = wallet.status === 'missing'
      ? 'Install the Freighter extension to load wallet balances.'
      : 'Reconnect Freighter to refresh balances.';
    toast.error(message, { description: hint, duration: 6_000, id: BALANCE_TOAST_ID });
  }, [enabled, balanceEnabled, wallet.status]);

  return {
    data: query.data,
    error: query.error ?? null,
    isLoading: query.isLoading,
    isPending: query.isPending && balanceEnabled,
    isError: query.isError,
    walletStatus: wallet.status,
    isConnected: wallet.isConnected,
    isAwaitingWallet: !balanceEnabled,
    refetch: query.refetch,
  };
}

export default useStellarWalletBalance;
