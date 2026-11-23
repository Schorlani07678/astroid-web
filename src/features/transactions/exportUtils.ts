/**
 * Export utilities for the transaction history (issue #576).
 *
 * All serialization is pure and lives outside React so it can be unit tested
 * directly. Both formats are produced through generators and handed to `Blob`
 * as an array of chunks, which keeps large histories from needing one giant
 * intermediate string. The active filter snapshot is applied here as well, so
 * a downloaded file always matches the rows the operator is looking at.
 */

import type { Transaction } from '@/types/domain';
import { filterTransactions, type TransactionFilterValues } from './filterTransactions';

export type TransactionExportFormat = 'csv' | 'json';

/** Flat, accounting-friendly shape shared by both export formats. */
export interface TransactionExportRecord {
  timestamp: string;
  id: string;
  hash: string;
  direction: Transaction['direction'];
  sender: string;
  recipient: string;
  counterparty: string;
  agentId: string;
  agentName: string;
  asset: Transaction['asset'];
  amount: number;
  usdValue: number;
  status: Transaction['status'];
  memo: string;
  purpose: string;
  riskScore: number;
}

export interface TransactionExportOptions {
  format: TransactionExportFormat;
  /** Active table filters; when supplied, only matching rows are exported. */
  filters?: TransactionFilterValues;
  /** Injectable for deterministic tests and reproducible exports. */
  exportedAt?: string;
  filename?: string;
}

export interface TransactionExportResult {
  filename: string;
  mimeType: string;
  /** Ordered chunks ready to be passed to `new Blob(chunks, { type })`. */
  chunks: string[];
}

export interface TransactionExportEnvelope {
  exportedAt: string;
  filters: TransactionFilterValues | null;
  count: number;
  transactions: TransactionExportRecord[];
}

const CSV_COLUMNS: ReadonlyArray<{
  header: string;
  key: keyof TransactionExportRecord;
}> = [
  { header: 'Timestamp', key: 'timestamp' },
  { header: 'Transaction ID', key: 'id' },
  { header: 'Hash', key: 'hash' },
  { header: 'Direction', key: 'direction' },
  { header: 'Sender', key: 'sender' },
  { header: 'Recipient', key: 'recipient' },
  { header: 'Counterparty', key: 'counterparty' },
  { header: 'Agent ID', key: 'agentId' },
  { header: 'Agent', key: 'agentName' },
  { header: 'Asset', key: 'asset' },
  { header: 'Amount', key: 'amount' },
  { header: 'USD Value', key: 'usdValue' },
  { header: 'Status', key: 'status' },
  { header: 'Memo', key: 'memo' },
  { header: 'Purpose', key: 'purpose' },
  { header: 'Risk Score', key: 'riskScore' },
];

/** Neutralise spreadsheet formula injection without changing numeric cells. */
function escapeCsvCell(value: string | number): string {
  if (typeof value === 'number') return `"${value}"`;
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Map a domain transaction onto the stable export record shape. */
export function toTransactionExportRecord(
  transaction: Transaction,
): TransactionExportRecord {
  const outbound = transaction.direction === 'outbound';
  return {
    timestamp: transaction.createdAt,
    id: transaction.id,
    hash: transaction.stellarHash ?? '',
    direction: transaction.direction,
    sender: outbound ? '' : transaction.counterpartyAddress,
    recipient: outbound ? transaction.counterpartyAddress : '',
    counterparty: transaction.counterparty,
    agentId: transaction.agentId ?? '',
    agentName: transaction.agentName ?? '',
    asset: transaction.asset,
    amount: outbound ? -transaction.amount : transaction.amount,
    usdValue: transaction.usdValue,
    status: transaction.status,
    memo: transaction.memo ?? '',
    purpose: transaction.purpose,
    riskScore: transaction.riskScore,
  };
}

/**
 * Yield the CSV header followed by one chunk per transaction. Consumers can
 * feed the chunks straight into a Blob to avoid building a single large string.
 */
export function* streamTransactionsCsv(
  transactions: readonly Transaction[],
): Generator<string, void, undefined> {
  yield `${CSV_COLUMNS.map((column) => escapeCsvCell(column.header)).join(',')}\r\n`;
  for (const transaction of transactions) {
    const record = toTransactionExportRecord(transaction);
    yield `${CSV_COLUMNS.map((column) => escapeCsvCell(record[column.key])).join(',')}\r\n`;
  }
}

export function serializeTransactionsCsv(transactions: readonly Transaction[]): string {
  return Array.from(streamTransactionsCsv(transactions)).join('');
}

/**
 * Yield a JSON envelope one field/record at a time. `count` and `filters` make
 * the file self-describing for compliance reviews.
 */
export function* streamTransactionsJson(
  transactions: readonly Transaction[],
  options: Pick<TransactionExportOptions, 'filters' | 'exportedAt'> = {},
): Generator<string, void, undefined> {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  yield '{\n';
  yield `  "exportedAt": ${JSON.stringify(exportedAt)},\n`;
  yield `  "filters": ${JSON.stringify(options.filters ?? null)},\n`;
  yield `  "count": ${transactions.length},\n`;
  yield '  "transactions": [\n';
  for (let index = 0; index < transactions.length; index += 1) {
    const transaction = transactions[index];
    if (!transaction) continue;
    const separator = index === transactions.length - 1 ? '' : ',';
    yield `    ${JSON.stringify(toTransactionExportRecord(transaction))}${separator}\n`;
  }
  yield '  ]\n}\n';
}

export function serializeTransactionsJson(
  transactions: readonly Transaction[],
  options: Pick<TransactionExportOptions, 'filters' | 'exportedAt'> = {},
): string {
  return Array.from(streamTransactionsJson(transactions, options)).join('');
}

/** Apply the active filters once, then build the requested export payload. */
export function buildTransactionExport(
  transactions: readonly Transaction[],
  options: TransactionExportOptions,
): TransactionExportResult {
  const rows = options.filters
    ? filterTransactions([...transactions], options.filters)
    : [...transactions];
  const date = (options.exportedAt ?? new Date().toISOString()).slice(0, 10);
  const filename = options.filename ?? `transactions-${date}.${options.format}`;

  if (options.format === 'csv') {
    return {
      filename,
      mimeType: 'text/csv;charset=utf-8',
      chunks: Array.from(streamTransactionsCsv(rows)),
    };
  }

  return {
    filename,
    mimeType: 'application/json;charset=utf-8',
    chunks: Array.from(
      streamTransactionsJson(rows, {
        filters: options.filters,
        exportedAt: options.exportedAt,
      }),
    ),
  };
}

/** Trigger a browser download. Safe to call during SSR (it is a no-op). */
export function downloadTransactionExport(
  transactions: readonly Transaction[],
  options: TransactionExportOptions,
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const { filename, mimeType, chunks } = buildTransactionExport(transactions, options);
  const blob = new Blob(chunks, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
