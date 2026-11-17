import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetRate, Transaction } from '@/types/domain';
import {
  aggregatePortfolioBalances,
  filterTransactionsByAsset,
  truncateIssuerKey,
} from './multiCurrencyBalance';

const MOCK_RATES: AssetRate[] = [
  {
    asset: 'XLM',
    priceUsd: 0.25,
    change24h: 2.4,
    updatedAt: '2026-11-15T00:00:00Z',
    source: 'stellar-dex',
  },
  {
    asset: 'USDC',
    priceUsd: 1.0,
    change24h: 0.0,
    updatedAt: '2026-11-15T00:00:00Z',
    source: 'circle',
  },
];

test('aggregatePortfolioBalances computes total USD and hides zero balances when toggled', () => {
  const balances = [
    { asset: 'XLM', balance: 1000, usdValue: 0 },
    { asset: 'USDC', balance: 500, usdValue: 500 },
    {
      asset: 'AQUA',
      balance: 0,
      usdValue: 0,
      issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
    },
  ];

  const allSummary = aggregatePortfolioBalances(balances, MOCK_RATES, false);
  assert.equal(allSummary.totalFiatUsd, 750);
  assert.equal(allSummary.holdings.length, 3);
  assert.equal(allSummary.holdings[2]?.truncatedIssuer, 'GBNZ...AQUA');

  const nonZeroSummary = aggregatePortfolioBalances(balances, MOCK_RATES, true);
  assert.equal(nonZeroSummary.holdings.length, 2);
});

test('filterTransactionsByAsset filters transactions by selected token type', () => {
  const txs = [
    { id: 'tx-1', asset: 'USDC' },
    { id: 'tx-2', asset: 'XLM' },
  ] as unknown as Transaction[];

  assert.equal(filterTransactionsByAsset(txs, 'all').length, 2);
  assert.equal(filterTransactionsByAsset(txs, 'XLM').length, 1);
  assert.equal(filterTransactionsByAsset(txs, 'XLM')[0]?.id, 'tx-2');
});

test('truncateIssuerKey shortens long Stellar addresses cleanly', () => {
  assert.equal(
    truncateIssuerKey('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'),
    'GA5Z...KZVN',
  );
  assert.equal(truncateIssuerKey('SHORT'), 'SHORT');
});
