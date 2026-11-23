import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transaction } from '@/types/domain';
import type { TransactionFilterValues } from './filterTransactions';
import {
  buildTransactionExport,
  downloadTransactionExport,
  serializeTransactionsCsv,
  serializeTransactionsJson,
  streamTransactionsCsv,
  toTransactionExportRecord,
} from './exportUtils';

const records: Transaction[] = [
  {
    id: 'txn-alpha',
    organizationId: 'org-test',
    walletId: 'wallet-test',
    agentId: 'agent-atlas',
    agentName: 'Atlas, Inc.',
    direction: 'outbound',
    counterparty: 'Stellar Store',
    counterpartyAddress: 'GDESTINATIONALPHA',
    asset: 'USDC',
    amount: 25,
    usdValue: 25,
    memo: 'Monthly "services", rent\nand fees',
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
    memo: '=IMPORTXML("https://example.com","//td")',
    purpose: 'Treasury deposit',
    status: 'pending',
    riskScore: 10,
    createdAt: '2026-07-12T08:30:00.000Z',
  },
];

const defaults: TransactionFilterValues = {
  query: '',
  status: 'all',
  asset: 'all',
  agentId: 'all',
  dateFrom: '',
  dateTo: '',
};

test('CSV includes a header and one row per transaction', () => {
  const csv = serializeTransactionsCsv(records);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /^"Timestamp","Transaction ID","Hash"/);
  assert.match(lines[1]!, /"txn-alpha"/);
  assert.match(lines[2]!, /"txn-beta"/);
  assert.match(csv, /"2026-07-10T12:00:00\.000Z"/);
});

test('CSV escapes commas, quotes, newlines and formula prefixes in memos', () => {
  const csv = serializeTransactionsCsv(records);
  assert.match(csv, /"Monthly ""services"", rent\nand fees"/);
  assert.match(csv, /"'=IMPORTXML\(""https:\/\/example\.com"",""\/\/td""\)"/);
  assert.match(csv, /"Atlas, Inc\."/);
});

test('CSV keeps negative amounts numeric while sanitising text cells', () => {
  const csv = serializeTransactionsCsv(records);
  assert.equal(csv.includes('"-25"'), true);
  assert.equal(csv.includes(`"'-25"`), false);
  assert.match(csv, /"'=IMPORTXML/);
});

test('CSV of an empty history still carries the header row', () => {
  const csv = serializeTransactionsCsv([]);
  assert.equal(csv.trim().includes('txn-alpha'), false);
  assert.match(csv, /^"Timestamp","Transaction ID"/);
  assert.equal(csv.endsWith('\r\n'), true);
});

test('CSV streaming yields the header plus one chunk per row', () => {
  const chunks = Array.from(streamTransactionsCsv(records));
  assert.equal(chunks.length, records.length + 1);
  assert.equal(chunks[0]!.includes('"Timestamp"'), true);
  assert.equal(chunks.at(-1)!.includes('txn-beta'), true);
});

test('records sign amounts by direction and keep numbers numeric', () => {
  const outbound = toTransactionExportRecord(records[0]!);
  const inbound = toTransactionExportRecord(records[1]!);
  assert.equal(outbound.amount, -25);
  assert.equal(inbound.amount, 50);
  assert.equal(outbound.recipient, 'GDESTINATIONALPHA');
  assert.equal(outbound.sender, '');
  assert.equal(inbound.sender, 'GDESTINATIONBETA');
  assert.equal(inbound.recipient, '');
  assert.equal(inbound.hash, '');
  assert.equal(inbound.memo.startsWith('='), true);
});

test('JSON is a self-describing envelope with deterministic metadata', () => {
  const json = serializeTransactionsJson(records, {
    filters: defaults,
    exportedAt: '2026-11-21T10:00:00.000Z',
  });
  const parsed = JSON.parse(json) as {
    exportedAt: string;
    filters: TransactionFilterValues;
    count: number;
    transactions: Array<{ id: string; amount: number; memo: string }>;
  };

  assert.equal(parsed.exportedAt, '2026-11-21T10:00:00.000Z');
  assert.deepEqual(parsed.filters, defaults);
  assert.equal(parsed.count, 2);
  assert.equal(parsed.transactions.length, 2);
  assert.deepEqual(
    parsed.transactions.map((row) => row.id),
    ['txn-alpha', 'txn-beta'],
  );
  assert.equal(parsed.transactions[0]!.amount, -25);
  assert.equal(parsed.transactions[0]!.memo, 'Monthly "services", rent\nand fees');
});

test('JSON of an empty history has count zero and an empty array', () => {
  const parsed = JSON.parse(
    serializeTransactionsJson([], { exportedAt: '2026-11-21T10:00:00.000Z' }),
  ) as { count: number; filters: null; transactions: unknown[] };
  assert.equal(parsed.count, 0);
  assert.equal(parsed.filters, null);
  assert.deepEqual(parsed.transactions, []);
});

test('exports respect status, asset, agent and search filters', () => {
  const cases: Array<[Partial<TransactionFilterValues>, string[]]> = [
    [{ status: 'completed' }, ['txn-alpha']],
    [{ asset: 'XLM' }, ['txn-beta']],
    [{ agentId: 'agent-orion' }, ['txn-beta']],
    [{ query: 'stellar store' }, ['txn-alpha']],
    [{ query: 'IMPORTXML' }, ['txn-beta']],
  ];

  for (const [patch, expected] of cases) {
    const result = buildTransactionExport(records, {
      format: 'json',
      filters: { ...defaults, ...patch },
      exportedAt: '2026-11-21T10:00:00.000Z',
    });
    const parsed = JSON.parse(result.chunks.join('')) as {
      transactions: Array<{ id: string }>;
    };
    assert.deepEqual(
      parsed.transactions.map((row) => row.id),
      expected,
      `unexpected result for ${JSON.stringify(patch)}`,
    );
  }
});

test('exports respect inclusive date-range boundaries', () => {
  const filters: TransactionFilterValues = {
    ...defaults,
    dateFrom: '2026-07-10',
    dateTo: '2026-07-10',
  };
  const result = buildTransactionExport(records, {
    format: 'csv',
    filters,
    exportedAt: '2026-11-21T10:00:00.000Z',
  });
  const csv = result.chunks.join('');
  assert.equal(csv.includes('txn-alpha'), true);
  assert.equal(csv.includes('txn-beta'), false);
});

test('buildTransactionExport returns format-specific MIME types and filenames', () => {
  const csv = buildTransactionExport(records, {
    format: 'csv',
    filters: defaults,
    exportedAt: '2026-11-21T10:00:00.000Z',
  });
  assert.equal(csv.mimeType, 'text/csv;charset=utf-8');
  assert.equal(csv.filename, 'transactions-2026-11-21.csv');
  assert.equal(csv.chunks.length, records.length + 1);

  const json = buildTransactionExport(records, {
    format: 'json',
    exportedAt: '2026-11-21T10:00:00.000Z',
    filename: 'audit.json',
  });
  assert.equal(json.mimeType, 'application/json;charset=utf-8');
  assert.equal(json.filename, 'audit.json');
});

test('download is a no-op without a browser', () => {
  assert.equal(typeof window, 'undefined');
  assert.doesNotThrow(() => downloadTransactionExport(records, { format: 'csv' }));
  assert.doesNotThrow(() => downloadTransactionExport(records, { format: 'json' }));
});
