'use client';

import { useMemo } from 'react';
import { Select } from '@/components/ui/input';
import type { AssetBalance, AssetRate } from '@/types/domain';
import { aggregatePortfolioBalances } from '../utils/multiCurrencyBalance';

export interface MultiCurrencyPortfolioHeaderProps {
  balances: readonly (AssetBalance & { issuer?: string })[];
  rates: readonly AssetRate[];
  selectedAsset: string;
  hideZeroBalances: boolean;
  onSelectedAssetChange: (asset: string) => void;
  onHideZeroBalancesChange: (hide: boolean) => void;
}

/**
 * Consolidated multi-currency portfolio valuation header with token filter dropdown
 * and zero-balance trustline toggle.
 */
export function MultiCurrencyPortfolioHeader({
  balances,
  rates,
  selectedAsset,
  hideZeroBalances,
  onSelectedAssetChange,
  onHideZeroBalancesChange,
}: MultiCurrencyPortfolioHeaderProps) {
  const summary = useMemo(
    () => aggregatePortfolioBalances(balances, rates, hideZeroBalances),
    [balances, rates, hideZeroBalances],
  );

  const assetOptions = useMemo(
    () => Array.from(new Set(balances.map((b) => b.asset))).sort(),
    [balances],
  );

  return (
    <section
      aria-label="Consolidated Portfolio Valuation"
      className="space-y-4 rounded-card border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-secondary">
            Consolidated Portfolio Value
          </p>
          <p className="mt-1 text-2xl font-bold tabular text-foreground">
            ${summary.totalFiatUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-foreground-secondary">
            <input
              type="checkbox"
              checked={hideZeroBalances}
              onChange={(event) => onHideZeroBalancesChange(event.target.checked)}
              className="h-4 w-4 rounded border-border bg-surface text-gold focus:ring-ring"
            />
            <span>Hide zero-balance trustlines</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <span>Filter Asset</span>
            <Select
              aria-label="Filter transactions by asset"
              value={selectedAsset}
              onChange={(event) => onSelectedAssetChange(event.target.value)}
            >
              <option value="all">All assets</option>
              {assetOptions.map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summary.holdings.map((holding) => (
          <div
            key={`${holding.asset}-${holding.issuer ?? 'native'}`}
            className="flex items-center justify-between rounded-button border border-border bg-surface-secondary/50 px-3.5 py-2.5"
          >
            <div>
              <p className="text-xs font-semibold text-foreground">{holding.asset}</p>
              {holding.truncatedIssuer && (
                <p className="font-mono text-2xs text-foreground-muted">
                  {holding.truncatedIssuer}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-medium tabular text-foreground">
                {holding.balance.toLocaleString('en-US')} {holding.asset}
              </p>
              <p className="text-2xs tabular text-foreground-secondary">
                {holding.fiatValueUsd !== null
                  ? `$${holding.fiatValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'Rate unavailable'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
