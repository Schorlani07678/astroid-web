import type { MemoryRecord } from '@/types/domain';
import {
  buildExportFilename,
  planLogExport,
  serializeLogCsv,
  serializeLogJson,
  type ExportColumn,
  type ExportFormat,
  type LogExportPayload,
  type LogExportPlan,
} from '@/lib/exportSerialization';

/**
 * Financial audit-log export (governed decisions / `MemoryRecord` trail).
 *
 * Compliance officers need the same CSV/JSON guarantees as the agent-activity
 * log: RFC 4180 escaping with formula-injection neutralisation, UTF-8 MIME
 * types, timestamped filenames, and chunked streaming so exporting a long
 * decision history never blocks the UI thread. CSV flattens each record into
 * accounting-friendly columns; JSON keeps the full record (including the
 * decision steps) for lossless record-keeping.
 */

export type FinancialAuditExportFormat = ExportFormat;

export type FinancialAuditExportPayload = LogExportPayload;

const SCOPE = 'financial-audit-log';
const SOURCE = 'financial-audit-log';

/** Column order for the CSV export of governed decisions. */
export const FINANCIAL_AUDIT_CSV_COLUMNS: readonly ExportColumn<MemoryRecord>[] = [
  { header: 'Record ID', value: (record) => record.id },
  { header: 'Created At', value: (record) => record.createdAt },
  { header: 'Agent ID', value: (record) => record.agentId },
  { header: 'Agent Name', value: (record) => record.agentName },
  { header: 'Transaction ID', value: (record) => record.transactionId },
  { header: 'Project', value: (record) => record.project },
  { header: 'Task', value: (record) => record.task },
  { header: 'Amount', value: (record) => record.amount },
  { header: 'Asset', value: (record) => record.asset },
  { header: 'Risk Score', value: (record) => record.riskScore },
  { header: 'Policy Used', value: (record) => record.policyUsed },
  { header: 'Approved By', value: (record) => record.approvedBy.join(', ') },
  { header: 'Reason', value: (record) => record.reason },
  { header: 'Summary', value: (record) => record.summary },
  { header: 'Stellar Hash', value: (record) => record.stellarHash ?? '' },
  { header: 'Conversation ID', value: (record) => record.conversationId },
  { header: 'Decision Steps', value: (record) => record.steps },
];

/** Build the full CSV document (header row + one line per record). */
export function buildFinancialAuditCsv(records: readonly MemoryRecord[]): string {
  return serializeLogCsv(records, FINANCIAL_AUDIT_CSV_COLUMNS);
}

/** Build the self-describing JSON document with the full records intact. */
export function buildFinancialAuditJson(
  records: readonly MemoryRecord[],
  exportedAt: Date = new Date(),
): string {
  return serializeLogJson(records, {
    exportedAt,
    recordsKey: 'records',
    metadata: { source: SOURCE },
  });
}

/**
 * Descriptive, filesystem-safe filename stamped with the export time, e.g.
 * `astroid-financial-audit-log-2026-11-22T13-30-45-123Z.json`.
 */
export function buildFinancialAuditExportFilename(
  format: FinancialAuditExportFormat,
  date: Date = new Date(),
): string {
  return buildExportFilename(SCOPE, format, date);
}

/**
 * Build a lazily streamed plan for the financial audit log; consumed by the
 * async downloader so large exports yield to the event loop between batches.
 */
export function planFinancialAuditExport(
  records: readonly MemoryRecord[],
  format: FinancialAuditExportFormat,
  date: Date = new Date(),
): LogExportPlan {
  return format === 'csv'
    ? planLogExport({
        scope: SCOPE,
        format: 'csv',
        rows: records,
        columns: FINANCIAL_AUDIT_CSV_COLUMNS,
        exportedAt: date,
      })
    : planLogExport({
        scope: SCOPE,
        format: 'json',
        rows: records,
        recordsKey: 'records',
        metadata: { source: SOURCE },
        exportedAt: date,
      });
}

/** Assemble a complete export payload (filename, MIME type, chunked body). */
export function buildFinancialAuditExport(
  records: readonly MemoryRecord[],
  format: FinancialAuditExportFormat,
  date: Date = new Date(),
): FinancialAuditExportPayload {
  const plan = planFinancialAuditExport(records, format, date);
  return {
    filename: plan.filename,
    mimeType: plan.mimeType,
    chunks: Array.from(plan.stream()),
  };
}
