import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transaction } from '@/types/domain';
import { filterTransactions, type TransactionFilterValues } from './filterTransactions';

const records: Transaction[] = [
  {
    id: 'txn-alpha',
    organizationId: 'org-test',
    walletId: 'wallet-test',
    agentId: 'agent-atlas',
    agentName: 'Atlas',
    direction: 'outbound',
    counterparty: 'Stellar Store',
    counterpartyAddress: 'GDESTINATIONALPHA',
    asset: 'USDC',
    amount: 25,
    usdValue: 25,
    memo: 'Monthly services',
    purpose: 'Service payment',
    status: 'completed',
    riskScore: 5,
    stellarHash: 'stellar-hash-alpha',
    createdAt: '2026-07-10T12:00:00.000Z',
  },
  {
    id: 'txn-beta',
    organizationId: 'org-test',
    walletId: 'wallet-test',
    agentId: 'agent-orion',
    agentName: 'Orion',
    direction: 'inbound',
    counterparty: 'Circle',
    counterpartyAddress: 'GDESTINATIONBETA',
    asset: 'XLM',
    amount: 50,
    usdValue: 6,
    purpose: 'Treasury deposit',
    status: 'pending',
    riskScore: 10,
    createdAt: '2026-07-11T12:00:00.000Z',
  },
];

/**
 * Edge-case fixture: one transaction sits exactly on the last millisecond of a
 * day, one carries punctuation and a negative amount, and one omits the optional
 * memo and hash fields entirely.
 */
const edgeRecords: Transaction[] = [
  {
    id: 'txn-gamma',
    organizationId: 'org-test',
    walletId: 'wallet-test',
    agentId: 'agent-atlas',
    agentName: 'Atlas',
    direction: 'outbound',
    counterparty: 'Lumen & Co.',
    counterpartyAddress: 'GDESTINATIONGAMMA',
    asset: 'USDC',
    amount: 0,
    usdValue: 0,
    memo: 'Invoice #42 - "final" (50%)',
    purpose: 'Vendor settlement',
    status: 'approved',
    riskScore: 3,
    stellarHash: 'STELLAR-HASH-GAMMA',
    createdAt: '2026-07-10T23:59:59.999Z',
  },
  {
    id: 'txn-delta',
    organizationId: 'org-test',
    walletId: 'wallet-test',
    agentId: 'agent-atlas',
    agentName: 'Atlas',
    direction: 'inbound',
    counterparty: 'Café refunds',
    counterpartyAddress: 'GDESTINATIONDELTA',
    asset: 'AQUA',
    amount: -12.5,
    usdValue: -12.5,
    purpose: 'Refund adjustment',
    status: 'failed',
    riskScore: 40,
    createdAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'txn-epsilon',
    organizationId: 'org-test',
    walletId: 'wallet-test',
    agentId: 'agent-orion',
    agentName: 'Orion',
    direction: 'outbound',
    counterparty: 'Δοκιμή Labs',
    counterpartyAddress: 'GDESTINATIONEPSILON',
    asset: 'XLM',
    amount: 1000,
    usdValue: 120,
    memo: 'Δοκιμή — café',
    purpose: 'Ops',
    status: 'completed',
    riskScore: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const edgeCatalog: Transaction[] = [...records, ...edgeRecords];

/** Text fields in this fixture are digit-free so amount searches are unambiguous. */
const amountRecords: Transaction[] = [
  {
    id: 'txn-zero',
    organizationId: 'org-test',
    walletId: 'wallet-test',
    agentId: 'agent-atlas',
    agentName: 'Atlas',
    direction: 'outbound',
    counterparty: 'Zero vendor',
    counterpartyAddress: 'GZERO',
    asset: 'USDC',
    amount: 0,
    usdValue: 0,
    purpose: 'Zero adjustment',
    status: 'completed',
    riskScore: 0,
    createdAt: '2026-07-10T08:00:00.000Z',
  },
  {
    id: 'txn-negative',
    organizationId: 'org-test',
    walletId: 'wallet-test',
    agentId: 'agent-atlas',
    agentName: 'Atlas',
    direction: 'inbound',
    counterparty: 'Reversal vendor',
    counterpartyAddress: 'GNEGATIVE',
    asset: 'USDC',
    amount: -12.5,
    usdValue: -12.5,
    purpose: 'Reversal',
    status: 'completed',
    riskScore: 0,
    createdAt: '2026-07-10T09:00:00.000Z',
  },
  {
    id: 'txn-ceiling',
    organizationId: 'org-test',
    walletId: 'wallet-test',
    agentId: 'agent-orion',
    agentName: 'Orion',
    direction: 'outbound',
    counterparty: 'Ceiling vendor',
    counterpartyAddress: 'GCEILING',
    asset: 'USDC',
    amount: 777777,
    usdValue: 777777,
    purpose: 'Ceiling payment',
    status: 'completed',
    riskScore: 0,
    createdAt: '2026-07-10T10:00:00.000Z',
  },
];

const noFilters: TransactionFilterValues = {
  query: '',
  status: 'all',
  asset: 'all',
  agentId: 'all',
  dateFrom: '',
  dateTo: '',
};

const ids = (transactions: Transaction[]) =>
  transactions.map((transaction) => transaction.id);

test('combines asset, status, and agent filters', () => {
  const filtered = filterTransactions(records, {
    ...noFilters,
    asset: 'USDC',
    status: 'completed',
    agentId: 'agent-atlas',
  });

  assert.deepEqual(ids(filtered), ['txn-alpha']);
});

test('combines status, asset, agent, search, and date filters at once', () => {
  const filtered = filterTransactions(edgeCatalog, {
    ...noFilters,
    status: 'completed',
    asset: 'XLM',
    agentId: 'agent-orion',
    query: 'ops',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-01',
  });

  assert.deepEqual(ids(filtered), ['txn-epsilon']);
});

test('a single mismatching filter removes an otherwise matching transaction', () => {
  const matching = {
    ...noFilters,
    status: 'completed' as const,
    asset: 'XLM',
    agentId: 'agent-orion',
    query: 'ops',
  };

  assert.deepEqual(ids(filterTransactions(edgeCatalog, matching)), ['txn-epsilon']);
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...matching, asset: 'USDC' })),
    [],
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...matching, status: 'approved' as const })),
    [],
  );
});

test('searches transaction identifiers and hashes case-insensitively', () => {
  const filtered = filterTransactions(records, { ...noFilters, query: 'STELLAR-HASH' });

  assert.deepEqual(ids(filtered), ['txn-alpha']);
});

test('matches memo text and hashes regardless of query casing', () => {
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: 'MONTHLY SERVICES' })),
    ['txn-alpha'],
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: 'invoice' })),
    ['txn-gamma'],
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: 'stellar-hash-gamma' })),
    ['txn-gamma'],
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: 'STELLAR-HASH-GAMMA' })),
    ['txn-gamma'],
  );
});

test('empty filters and an empty or whitespace-only query return every transaction', () => {
  assert.deepEqual(ids(filterTransactions(edgeCatalog, noFilters)), ids(edgeCatalog));
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: '' })),
    ids(edgeCatalog),
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: '   ' })),
    ids(edgeCatalog),
  );
});

test('an empty transaction list is always empty', () => {
  assert.deepEqual(filterTransactions([], noFilters), []);
  assert.deepEqual(filterTransactions([], { ...noFilters, query: 'anything' }), []);
  assert.deepEqual(
    filterTransactions([], {
      ...noFilters,
      dateFrom: '2026-07-10',
      dateTo: '2026-07-10',
    }),
    [],
  );
});

test('supports punctuation, partial matches, and unicode search terms', () => {
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: '#42' })),
    ['txn-gamma'],
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: '"final"' })),
    ['txn-gamma'],
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: 'inv' })),
    ['txn-gamma'],
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: 'δοκιμή' })),
    ['txn-epsilon'],
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, query: 'café' })),
    ['txn-delta', 'txn-epsilon'],
  );
});

test('returns an empty list when filters have no matches', () => {
  const filtered = filterTransactions(records, {
    ...noFilters,
    query: 'does-not-exist',
  });

  assert.deepEqual(filtered, []);
});

test('no-match searches stay empty when combined with other filters', () => {
  assert.deepEqual(
    filterTransactions(edgeCatalog, {
      ...noFilters,
      status: 'completed',
      query: 'no-such-term',
    }),
    [],
  );
  assert.deepEqual(
    filterTransactions(edgeCatalog, {
      ...noFilters,
      query: 'a'.repeat(200),
    }),
    [],
  );
});

test('includes transactions on both selected date boundaries', () => {
  const filtered = filterTransactions(records, {
    ...noFilters,
    dateFrom: '2026-07-10',
    dateTo: '2026-07-10',
  });

  assert.deepEqual(ids(filtered), ['txn-alpha']);
});

test('date boundaries include the first and last millisecond of the range', () => {
  const filtered = filterTransactions(edgeCatalog, {
    ...noFilters,
    dateFrom: '2026-07-10',
    dateTo: '2026-07-10',
  });

  // `txn-gamma` is timestamped at 23:59:59.999Z and must stay inside the day.
  assert.deepEqual(ids(filtered), ['txn-alpha', 'txn-gamma']);
});

test('malformed dates are ignored instead of hiding every transaction', () => {
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, dateFrom: 'not-a-date' })),
    ids(edgeCatalog),
  );
  assert.deepEqual(
    ids(filterTransactions(edgeCatalog, { ...noFilters, dateTo: '2026-13-45' })),
    ids(edgeCatalog),
  );
  assert.deepEqual(
    ids(
      filterTransactions(edgeCatalog, {
        ...noFilters,
        dateFrom: 'not-a-date',
        dateTo: 'also-not-a-date',
      }),
    ),
    ids(edgeCatalog),
  );
});

test('a reversed date range matches nothing', () => {
  assert.deepEqual(
    filterTransactions(edgeCatalog, {
      ...noFilters,
      dateFrom: '2026-08-01',
      dateTo: '2026-07-01',
    }),
    [],
  );
});

test('amount searches cover zero, exact values, and negatives', () => {
  // The filter has no numeric min/max inputs, so amount bounds are exercised
  // through the free-text projection of the amount field.
  assert.deepEqual(
    ids(filterTransactions(amountRecords, { ...noFilters, query: '0' })),
    ['txn-zero'],
  );
  assert.deepEqual(
    ids(filterTransactions(amountRecords, { ...noFilters, query: '777777' })),
    ['txn-ceiling'],
  );
  assert.deepEqual(
    ids(filterTransactions(amountRecords, { ...noFilters, query: '-12.5' })),
    ['txn-negative'],
  );
  assert.deepEqual(
    ids(filterTransactions(amountRecords, { ...noFilters, query: '12.5' })),
    ['txn-negative'],
  );
  assert.deepEqual(
    filterTransactions(amountRecords, { ...noFilters, query: '777778' }),
    [],
  );
});

test('filtering does not mutate the input collection or its records', () => {
  const snapshot = structuredClone(edgeCatalog);
  filterTransactions(edgeCatalog, {
    ...noFilters,
    status: 'completed',
    query: 'ops',
    dateFrom: '2026-07-01',
    dateTo: '2026-08-31',
  });

  assert.deepEqual(edgeCatalog, snapshot);
});
