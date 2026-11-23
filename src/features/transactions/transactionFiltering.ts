import type { Transaction } from '@/types/domain';

/**
 * Filtering primitives for the transaction history table (issue #181).
 *
 * The table itself owns presentation; these helpers keep the filter vocabulary —
 * status, asset type, agent, date range and the free-text search — in one place so
 * the toolbar, the search box and any future URL/query state agree on the same shape.
 */

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

/** Windows offered by the "Date" filter; the value is the width in milliseconds. */
export const TRANSACTION_DATE_RANGES = {
  all: 0,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
} as const;

export type TransactionDateRange = keyof typeof TRANSACTION_DATE_RANGES;

export const TRANSACTION_DATE_RANGE_LABELS: Record<TransactionDateRange, string> = {
  all: 'Any date',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

export const TRANSACTION_DATE_RANGE_IDS = Object.keys(
  TRANSACTION_DATE_RANGES,
) as TransactionDateRange[];

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

/** `'all'` means "no constraint" for every dropdown filter. */
export interface TransactionFilters {
  status: 'all' | Transaction['status'];
  asset: 'all' | string;
  agent: 'all' | string;
  dateRange: TransactionDateRange;
}

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  status: 'all',
  asset: 'all',
  agent: 'all',
  dateRange: 'all',
};

export function countActiveTransactionFilters(filters: TransactionFilters): number {
  return (
    (filters.status !== 'all' ? 1 : 0) +
    (filters.asset !== 'all' ? 1 : 0) +
    (filters.agent !== 'all' ? 1 : 0) +
    (filters.dateRange !== 'all' ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/** True when `createdAt` falls inside the requested window (future dates stay visible). */
export function isWithinDateRange(
  createdAt: string,
  range: TransactionDateRange,
  now: number = Date.now(),
): boolean {
  if (range === 'all') return true;
  const timestamp = Date.parse(createdAt);
  if (Number.isNaN(timestamp)) return false;
  return timestamp >= now - TRANSACTION_DATE_RANGES[range];
}

export function matchesTransactionFilters(
  transaction: Transaction,
  filters: TransactionFilters,
  now: number = Date.now(),
): boolean {
  if (filters.status !== 'all' && transaction.status !== filters.status) return false;
  if (filters.asset !== 'all' && transaction.asset !== filters.asset) return false;
  if (filters.agent !== 'all' && transaction.agentId !== filters.agent) return false;
  if (!isWithinDateRange(transaction.createdAt, filters.dateRange, now)) return false;
  return true;
}

export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilters,
  now: number = Date.now(),
): Transaction[] {
  return transactions.filter((transaction) => matchesTransactionFilters(transaction, filters, now));
}

/**
 * Every field the search box should reach. The table's visible cells expose the
 * counterparty *name* but not its address, and the memo is not a column at all,
 * so searching by recipient address or memo needs an explicit projection.
 */
export function buildTransactionSearchText(transaction: Transaction): string {
  return [
    transaction.counterparty,
    transaction.counterpartyAddress,
    transaction.memo,
    transaction.purpose,
    transaction.agentName,
    transaction.asset,
    transaction.status,
    transaction.stellarHash,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Option lists
// ---------------------------------------------------------------------------

/** Distinct statuses present in the data, in first-seen order. */
export function collectStatusOptions(transactions: Transaction[]): Transaction['status'][] {
  return Array.from(new Set(transactions.map((transaction) => transaction.status)));
}

/** Distinct asset codes present in the data, in first-seen order. */
export function collectAssetOptions(transactions: Transaction[]): string[] {
  return Array.from(new Set(transactions.map((transaction) => transaction.asset)));
}

/** Distinct `[agentId, label]` pairs, labelled by name and falling back to the id. */
export function collectAgentOptions(transactions: Transaction[]): [string, string][] {
  return Array.from(
    new Map(
      transactions
        .filter((transaction) => transaction.agentId)
        .map(
          (transaction) =>
            [transaction.agentId as string, transaction.agentName ?? (transaction.agentId as string)] as const,
        ),
    ).entries(),
  );
}
