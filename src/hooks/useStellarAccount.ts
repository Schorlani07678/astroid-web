'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAssetRates } from '@/hooks/use-queries';
import { QUERY_CACHE, createBackoffRefetchInterval } from '@/lib/query-config';
import { queryKeys } from '@/services/query-keys';
import {
  StellarAccountError,
  describeStellarAccountError,
  fetchStellarAccountSnapshot,
} from '@/services/stellar-account';
import { useFreighterStore } from '@/stores/freighter-store';
import type { StellarAccountSnapshot, StellarHolding } from '@/types/stellar';

/**
 * Account balance polling for the wallet dashboard.
 *
 * Wraps TanStack Query around the Stellar account snapshot service:
 *
 * - Caches the snapshot under `['wallet', publicKey]` so every surface showing
 *   the same account shares one request.
 * - Polls every 30s by default (configurable, or disable with `false`) and
 *   exposes `refresh()` for explicit user-triggered refetches.
 * - Keeps the previous snapshot while a poll is in flight, so refreshing never
 *   swaps the UI back to a skeleton or shifts the layout.
 * - Reports failures through non-blocking sonner toasts — a warning when cached
 *   data is still on screen, an actionable error when there is nothing to show —
 *   and confirms the recovery once data flows again.
 * - Follows the connected Freighter wallet when no explicit public key is given;
 *   an explicit address (e.g. an org treasury) is queried regardless of the
 *   local connection.
 */

/** Default poll cadence for account balances. */
export const DEFAULT_WALLET_POLL_INTERVAL_MS = 30_000;

/** How long a snapshot stays fresh between polls. */
export const DEFAULT_WALLET_STALE_TIME_MS = 15_000;

/** Stablecoins are pegged 1:1, so they are priceable even without a rates feed. */
const STABLECOIN_CODES = new Set(['USDC', 'EURC', 'yUSDF']);
const STABLECOIN_USD_PRICE = 1;

/** Maximum automatic retries for transient (timeout / 5xx / network) failures. */
const MAX_RETRIES = 2;

export interface UseStellarAccountOptions {
  /**
   * Account to poll. When omitted the hook follows the Freighter store's
   * connected public key.
   */
  publicKey?: string | null;
  /** Master switch for the query. Defaults to true. */
  enabled?: boolean;
  /** Poll cadence in ms; pass `false` to poll only on demand. Defaults to 30s. */
  pollIntervalMs?: number | false;
  /** Freshness window for the cached snapshot. Defaults to 15s. */
  staleTimeMs?: number;
  /** Per-request timeout passed to the service. Defaults to the service value. */
  timeoutMs?: number;
  /** Emit sonner toasts on refresh failures and recoveries. Defaults to true. */
  notifyOnError?: boolean;
  /** Emit a success toast after a manual refresh resolves. Defaults to true. */
  notifyOnSuccess?: boolean;
}

export interface UseStellarAccountResult {
  /** Account currently being tracked (empty when no wallet is available). */
  publicKey: string;
  snapshot: StellarAccountSnapshot | undefined;
  /** Ledger balances paired with their USD valuation from the rates feed. */
  holdings: StellarHolding[];
  totalUsdValue: number;
  transactionCount: number | null;
  transactionCountIsLowerBound: boolean;
  /** True when there is an address to query (explicit or connected wallet). */
  hasAccount: boolean;
  /** True while the very first snapshot is loading. */
  isPending: boolean;
  /** True for any in-flight request: initial load, poll, or manual refresh. */
  isFetching: boolean;
  /** True only while a user-triggered refresh is in flight. */
  isRefreshing: boolean;
  isError: boolean;
  error: Error | null;
  /** Human-readable error copy, safe to render or toast. */
  errorMessage: string | null;
  /** Timestamp (ms) of the last successful snapshot. */
  dataUpdatedAt: number;
  /** Manual refetch entry point for refresh buttons and polling fallbacks. */
  refresh: () => Promise<void>;
}

/**
 * Poll a Stellar account's balances, holdings and transaction activity.
 *
 * @example
 * const account = useStellarAccount({ publicKey: wallet.stellarAddress });
 * <span>{account.totalUsdValue}</span>
 * <button onClick={account.refresh} disabled={account.isRefreshing}>Refresh</button>
 */
export function useStellarAccount(
  options: UseStellarAccountOptions = {},
): UseStellarAccountResult {
  const {
    publicKey: explicitPublicKey,
    enabled = true,
    pollIntervalMs = DEFAULT_WALLET_POLL_INTERVAL_MS,
    staleTimeMs = DEFAULT_WALLET_STALE_TIME_MS,
    timeoutMs,
    notifyOnError = true,
    notifyOnSuccess = true,
  } = options;

  const connectedPublicKey = useFreighterStore((state) => state.publicKey);
  const walletStatus = useFreighterStore((state) => state.status);

  const hasExplicitKey =
    typeof explicitPublicKey === 'string' && explicitPublicKey.trim().length > 0;
  const publicKey = (hasExplicitKey ? explicitPublicKey : connectedPublicKey ?? '').trim();
  const hasAccount = publicKey.length > 0;

  // An explicit address is viewable on its own; the implicit address must
  // belong to a wallet that is actually connected.
  const canQuery =
    enabled && hasAccount && (hasExplicitKey || walletStatus === 'connected');

  const query = useQuery<StellarAccountSnapshot, Error>({
    queryKey: queryKeys.walletAccount(publicKey),
    queryFn: ({ signal }) => fetchStellarAccountSnapshot(publicKey, { signal, timeoutMs }),
    enabled: canQuery,
    staleTime: staleTimeMs,
    gcTime: QUERY_CACHE.live.gcTime,
    // Exponential backoff while Horizon is failing; resets after a success.
    refetchInterval:
      canQuery && pollIntervalMs !== false && pollIntervalMs > 0
        ? createBackoffRefetchInterval({ baseMs: pollIntervalMs })
        : false,
    // Background polling would burn Horizon rate limits on a hidden tab.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // Deliberately no `placeholderData`: a wallet switch must not show the
    // previous account's balances. Polling failures keep the last good
    // snapshot because React Query retains `data` across refetch errors.
    retry: (failureCount, error) =>
      error instanceof StellarAccountError
        ? error.retryable && failureCount < MAX_RETRIES
        : failureCount < 1,
  });

  const {
    data: snapshot,
    error,
    errorUpdatedAt,
    dataUpdatedAt,
    isPending,
    isFetching,
    isError,
    refetch,
  } = query;

  const rates = useAssetRates();

  const holdings = useMemo<StellarHolding[]>(() => {
    if (!snapshot) return [];

    const priceByAsset = new Map(
      (rates.data ?? []).map((rate) => [rate.asset.toUpperCase(), rate.priceUsd]),
    );

    return snapshot.balances.map((balance) => {
      const code = balance.asset.toUpperCase();
      const price =
        priceByAsset.get(code) ??
        (STABLECOIN_CODES.has(code) ? STABLECOIN_USD_PRICE : 0);

      return { ...balance, usdValue: balance.balance * price };
    });
  }, [snapshot, rates.data]);

  const totalUsdValue = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.usdValue, 0),
    [holdings],
  );

  const toastId = `stellar-account:${publicKey || 'disconnected'}`;
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Last failure surfaced to the user. Keyed by message so a persistently
   * failing poll is announced once instead of every 30 seconds, while a newly
   * different failure (timeout → offline) still reaches the user.
   */
  const announcedError = useRef<{ message: string; at: number } | null>(null);

  // Switching accounts must not carry failure state across keys.
  useEffect(() => {
    announcedError.current = null;
  }, [publicKey]);

  useEffect(() => {
    if (!notifyOnError || !error) return;

    const description = describeStellarAccountError(error);
    if (announcedError.current?.message === description) return;

    announcedError.current = { message: description, at: errorUpdatedAt };

    if (snapshot) {
      toast.warning('Showing cached wallet balances', {
        id: toastId,
        description,
        duration: 6_000,
      });
      return;
    }

    toast.error('Could not load wallet balances', {
      id: toastId,
      description,
      duration: 8_000,
      action: {
        label: 'Retry',
        onClick: () => {
          void refetch();
        },
      },
    });
  }, [notifyOnError, snapshot, error, errorUpdatedAt, refetch, toastId]);

  useEffect(() => {
    const failure = announcedError.current;
    if (!notifyOnError || !snapshot || !failure) return;
    if (dataUpdatedAt <= failure.at) return;

    announcedError.current = null;
    toast.success('Wallet balances back in sync', {
      id: toastId,
      description: 'Live Stellar data is flowing again.',
      duration: 3_000,
    });
  }, [notifyOnError, snapshot, dataUpdatedAt, toastId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!canQuery) {
      toast.info('Connect a Stellar wallet to refresh its balances.');
      return;
    }

    setIsRefreshing(true);

    try {
      const result = await refetch({ cancelRefetch: true });
      if (result.status === 'success' && notifyOnSuccess) {
        toast.success('Wallet balances refreshed', {
          id: toastId,
          duration: 2_500,
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [canQuery, notifyOnSuccess, refetch, toastId]);

  return {
    publicKey,
    snapshot,
    holdings,
    totalUsdValue,
    transactionCount: snapshot?.transactionCount ?? null,
    transactionCountIsLowerBound: snapshot?.transactionCountIsLowerBound ?? false,
    hasAccount,
    isPending: canQuery && isPending,
    isFetching,
    isRefreshing,
    isError,
    error,
    errorMessage: error ? describeStellarAccountError(error) : null,
    dataUpdatedAt,
    refresh,
  };
}

export default useStellarAccount;
