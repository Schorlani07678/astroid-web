import type { AssetBalance, AssetRate, Transaction } from '@/types/domain';

export interface EnrichedAssetHolding {
  asset: string;
  issuer?: string;
  truncatedIssuer?: string;
  balance: number;
  fiatValueUsd: number | null;
  hasRateFeed: boolean;
}

export interface PortfolioAggregationSummary {
  totalFiatUsd: number;
  holdings: EnrichedAssetHolding[];
  unpricedAssets: string[];
}

/**
 * Truncates long Stellar issuer keys (e.g. GABC...WXYZ) for compact presentation.
 */
export function truncateIssuerKey(issuer: string | undefined): string | undefined {
  if (!issuer) return undefined;
  const trimmed = issuer.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

/**
 * Aggregates multi-currency Stellar holdings into a consolidated USD portfolio valuation,
 * handling zero balances, missing exchange rate feeds, and optional zero-balance hiding.
 */
export function aggregatePortfolioBalances(
  balances: readonly (AssetBalance & { issuer?: string })[],
  rates: readonly AssetRate[],
  hideZeroBalances = false,
): PortfolioAggregationSummary {
  const rateMap = new Map<string, number>();
  for (const rate of rates) {
    if (Number.isFinite(rate.priceUsd) && rate.priceUsd >= 0) {
      rateMap.set(rate.asset.toUpperCase(), rate.priceUsd);
    }
  }

  let totalFiatUsd = 0;
  const holdings: EnrichedAssetHolding[] = [];
  const unpricedAssets: string[] = [];

  for (const item of balances) {
    const safeBalance = Number.isFinite(item.balance) ? Math.max(0, item.balance) : 0;
    if (hideZeroBalances && safeBalance === 0) {
      continue;
    }

    const code = item.asset.toUpperCase();
    const rate = rateMap.get(code);
    let fiatValueUsd: number | null = null;
    let hasRateFeed = false;

    if (rate !== undefined) {
      fiatValueUsd = Number((safeBalance * rate).toFixed(2));
      totalFiatUsd += fiatValueUsd;
      hasRateFeed = true;
    } else if (Number.isFinite(item.usdValue) && item.usdValue > 0) {
      fiatValueUsd = Number(item.usdValue.toFixed(2));
      totalFiatUsd += fiatValueUsd;
      hasRateFeed = true;
    } else {
      unpricedAssets.push(item.asset);
    }

    holdings.push({
      asset: item.asset,
      issuer: item.issuer,
      truncatedIssuer: truncateIssuerKey(item.issuer),
      balance: safeBalance,
      fiatValueUsd,
      hasRateFeed,
    });
  }

  return {
    totalFiatUsd: Number(totalFiatUsd.toFixed(2)),
    holdings,
    unpricedAssets,
  };
}

/**
 * Filters a transaction list by selected Stellar token code ('all' returns all transactions).
 */
export function filterTransactionsByAsset(
  transactions: readonly Transaction[],
  selectedAsset: string,
): Transaction[] {
  const normalized = selectedAsset.trim().toUpperCase();
  if (normalized === '' || normalized === 'ALL') {
    return [...transactions];
  }
  return transactions.filter((tx) => tx.asset.toUpperCase() === normalized);
}
