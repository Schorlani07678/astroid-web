'use client';

import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  POLL_INTERVALS,
  QUERY_CACHE,
  createBackoffRefetchInterval,
} from '@/lib/query-config';
import { queryKeys } from '@/services/query-keys';
import { resources } from '@/services/resources';
import type { HorizonBalance } from '@/features/wallet/types';
import type {
  ActivityPoint,
  Agent,
  AiBriefing,
  AnalyticsOverview,
  ApiKey,
  AppNotification,
  AssetBalance,
  AssetRate,
  Budget,
  ChatMessage,
  MemoryRecord,
  Organization,
  Policy,
  PolicySimulationResult,
  Proposal,
  Transaction,
  User,
  Wallet,
  Webhook,
} from '@/types/domain';
import type { AuditEvent } from '@/types/audit';

/**
 * Typed TanStack Query hooks over the resource layer.
 *
 * Every screen reads data through these hooks so the query keys stay
 * centralized and the mock/live swap in `resources` is transparent to the UI.
 */

// -- session / org ----------------------------------------------------------
export const useCurrentUser = (): UseQueryResult<User> =>
  useQuery({ queryKey: queryKeys.session, queryFn: resources.getCurrentUser, ...QUERY_CACHE.static });

export const useOrganizations = (): UseQueryResult<Organization[]> =>
  useQuery({
    queryKey: queryKeys.organizations,
    queryFn: () => resources.getOrganizations(),
    ...QUERY_CACHE.static,
  });

export const useTeam = (): UseQueryResult<User[]> =>
  useQuery({ queryKey: queryKeys.team, queryFn: () => resources.getTeam() });

// -- analytics --------------------------------------------------------------
export const useOverview = (): UseQueryResult<AnalyticsOverview> =>
  useQuery({ queryKey: queryKeys.overview, queryFn: resources.getOverview });

export const useActivity = (): UseQueryResult<ActivityPoint[]> =>
  useQuery({ queryKey: queryKeys.activity, queryFn: () => resources.getActivity() });

// -- ai assistant -----------------------------------------------------------
export const useBriefing = (): UseQueryResult<AiBriefing> =>
  useQuery({ queryKey: queryKeys.briefing, queryFn: resources.getBriefing });

export const useAssistantSeed = (): UseQueryResult<ChatMessage[]> =>
  useQuery({ queryKey: queryKeys.assistantSeed, queryFn: resources.getAssistantSeed });

// -- wallets ----------------------------------------------------------------
export const useWallets = (): UseQueryResult<Wallet[]> =>
  useQuery({
    queryKey: queryKeys.wallets,
    queryFn: () => resources.getWallets(),
    ...QUERY_CACHE.entity,
  });

export const useWallet = (id: string): UseQueryResult<Wallet> =>
  useQuery({
    queryKey: queryKeys.wallet(id),
    queryFn: () => resources.getWallet(id),
    enabled: Boolean(id),
    ...QUERY_CACHE.entity,
  });

export interface WalletBalancesQueryOptions {
  /** Base poll cadence in ms (backs off while fetches fail); `0` polls only on demand. Defaults to 30s. */
  pollIntervalMs?: number;
  /** How long a balances payload stays fresh. Defaults to 15s. */
  staleTimeMs?: number;
  /** Master switch for the query. Defaults to true. */
  enabled?: boolean;
}

/**
 * Asset-level balances, fetched separately so the cards own their loading/error
 * state. Polls every 30s by default and keeps the previous payload while a
 * refresh is in flight, so periodic updates never flash a skeleton.
 */
export const useWalletBalances = (
  id: string,
  options: WalletBalancesQueryOptions = {},
): UseQueryResult<AssetBalance[]> => {
  const {
    pollIntervalMs = POLL_INTERVALS.balances,
    staleTimeMs = QUERY_CACHE.live.staleTime,
    enabled = true,
  } = options;

  return useQuery({
    queryKey: queryKeys.walletBalances(id),
    queryFn: () => resources.getWalletBalances(id),
    enabled: Boolean(id) && enabled,
    staleTime: staleTimeMs,
    gcTime: QUERY_CACHE.live.gcTime,
    // Backs off exponentially while the backend is failing, resets on success.
    refetchInterval:
      pollIntervalMs > 0 ? createBackoffRefetchInterval({ baseMs: pollIntervalMs }) : false,
    // Hidden tabs never poll; focus only refetches when the data is stale.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
};

/** Horizon-shaped trustlines powering the multi-currency asset breakdown. */
export const useWalletTrustlines = (id: string): UseQueryResult<HorizonBalance[]> =>
  useQuery({
    queryKey: queryKeys.walletTrustlines(id),
    queryFn: () => resources.getWalletTrustlines(id),
    enabled: Boolean(id),
    ...QUERY_CACHE.entity,
  });

// -- agents -----------------------------------------------------------------
export const useAgents = (): UseQueryResult<Agent[]> =>
  useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => resources.getAgents(),
    ...QUERY_CACHE.entity,
  });

export const useAgent = (id: string): UseQueryResult<Agent> =>
  useQuery({
    queryKey: queryKeys.agent(id),
    queryFn: () => resources.getAgent(id),
    enabled: Boolean(id),
    ...QUERY_CACHE.entity,
  });

// -- policies ---------------------------------------------------------------
export const usePolicies = (): UseQueryResult<Policy[]> =>
  useQuery({ queryKey: queryKeys.policies, queryFn: () => resources.getPolicies() });

export const usePolicy = (id: string): UseQueryResult<Policy> =>
  useQuery({
    queryKey: queryKeys.policy(id),
    queryFn: () => resources.getPolicy(id),
    enabled: Boolean(id),
  });

/** Policy simulator — a mutation so it re-runs on demand with a fresh amount. */
export const usePolicySimulation = () =>
  useMutation<PolicySimulationResult, Error, number>({
    mutationFn: (amount: number) => resources.simulatePolicy(amount),
  });

// -- budgets ----------------------------------------------------------------
export const useBudgets = (): UseQueryResult<Budget[]> =>
  useQuery({ queryKey: queryKeys.budgets, queryFn: () => resources.getBudgets() });

export const useBudget = (id: string): UseQueryResult<Budget> =>
  useQuery({
    queryKey: queryKeys.budget(id),
    queryFn: () => resources.getBudget(id),
    enabled: Boolean(id),
  });

// -- transactions -----------------------------------------------------------
export const useTransactions = (): UseQueryResult<Transaction[]> =>
  useQuery({ queryKey: queryKeys.transactions, queryFn: () => resources.getTransactions() });

export const useTransaction = (id: string): UseQueryResult<Transaction> =>
  useQuery({
    queryKey: queryKeys.transaction(id),
    queryFn: () => resources.getTransaction(id),
    enabled: Boolean(id),
  });

// -- proposals / approvals --------------------------------------------------
export const useProposals = (): UseQueryResult<Proposal[]> =>
  useQuery({ queryKey: queryKeys.proposals, queryFn: () => resources.getProposals() });

export const useProposal = (id: string): UseQueryResult<Proposal> =>
  useQuery({
    queryKey: queryKeys.proposal(id),
    queryFn: () => resources.getProposal(id),
    enabled: Boolean(id),
  });

// -- financial memory -------------------------------------------------------
export const useMemoryRecords = (): UseQueryResult<MemoryRecord[]> =>
  useQuery({ queryKey: queryKeys.memory, queryFn: () => resources.getMemoryRecords() });

export const useMemoryRecord = (id: string): UseQueryResult<MemoryRecord> =>
  useQuery({
    queryKey: queryKeys.memoryRecord(id),
    queryFn: () => resources.getMemoryRecord(id),
    enabled: Boolean(id),
  });

// -- audit log ---------------------------------------------------------------
export const useAuditEvents = (): UseQueryResult<AuditEvent[]> =>
  useQuery({ queryKey: queryKeys.auditEvents, queryFn: () => resources.getAuditEvents() });

// -- asset rates -------------------------------------------------------------
export const useAssetRates = (): UseQueryResult<AssetRate[]> =>
  useQuery({
    queryKey: queryKeys.rates,
    queryFn: () => resources.getAssetRates(),
    ...QUERY_CACHE.live,
    refetchInterval: createBackoffRefetchInterval({ baseMs: POLL_INTERVALS.balances }),
    refetchIntervalInBackground: false,
  });

// -- notifications ----------------------------------------------------------
export const useNotifications = (): UseQueryResult<AppNotification[]> =>
  useQuery({ queryKey: queryKeys.notifications, queryFn: () => resources.getNotifications() });

// -- developer --------------------------------------------------------------
export const useApiKeys = (): UseQueryResult<ApiKey[]> =>
  useQuery({ queryKey: queryKeys.apiKeys, queryFn: () => resources.getApiKeys() });

export const useWebhooks = (): UseQueryResult<Webhook[]> =>
  useQuery({ queryKey: queryKeys.webhooks, queryFn: () => resources.getWebhooks() });
