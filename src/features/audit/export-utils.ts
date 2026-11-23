import {
  buildExportFilename,
  downloadLogExport,
  escapeCsvCell,
  planLogExport,
  serializeLogCsv,
  serializeLogJson,
  type ExportColumn,
  type ExportFormat,
  type LogExportPayload,
  type LogExportPlan,
} from '@/lib/exportSerialization';
import type { AuditEvent } from './types';

/**
 * Agent-activity audit-log export (closes part of #562).
 *
 * Everything here runs in the browser against the currently visible table
 * data (respecting active filters), so compliance officers can export exactly
 * what they are looking at. Serialization is delegated to the shared
 * `@/lib/exportSerialization` helpers: RFC 4180 escaping with spreadsheet
 * formula-injection neutralisation, UTF-8 MIME types, timestamped filenames,
 * and chunked generation so large audit trails never block the UI thread.
 */

export type AuditExportFormat = ExportFormat;

/** Payload shape shared with the financial audit export. */
export type AuditExportPayload = LogExportPayload;

/** Column order for the CSV export; mirrors the audit table at full fidelity. */
export const AUDIT_CSV_COLUMNS: readonly ExportColumn<AuditEvent>[] = [
  { header: 'Event ID', value: (event) => event.id },
  { header: 'Timestamp', value: (event) => event.timestamp },
  { header: 'Level', value: (event) => event.level },
  { header: 'Event Type', value: (event) => event.eventType },
  { header: 'Actor ID', value: (event) => event.actorId },
  { header: 'Actor Name', value: (event) => event.actorName },
  { header: 'Actor Type', value: (event) => event.actorType },
  { header: 'Project', value: (event) => event.project ?? '' },
  { header: 'Amount', value: (event) => event.amount ?? '' },
  { header: 'Asset', value: (event) => event.asset ?? '' },
  { header: 'Summary', value: (event) => event.summary },
  { header: 'Details', value: (event) => event.details },
  { header: 'XDR Hash', value: (event) => event.xdrHash ?? '' },
  { header: 'Raw Payload', value: (event) => event.rawPayload },
];

const SCOPE = 'audit-log';
const SOURCE = 'agent-activity-audit-log';

/** Escape a single CSV field (RFC 4180 + formula-injection guard). */
export function escapeCsvField(value: unknown): string {
  return escapeCsvCell(value);
}

/** Build the full CSV document (header row + one line per event). */
export function buildAuditCsv(events: readonly AuditEvent[]): string {
  return serializeLogCsv(events, AUDIT_CSV_COLUMNS);
}

/** Build the self-describing JSON document with export metadata. */
export function buildAuditJson(
  events: readonly AuditEvent[],
  exportedAt: Date = new Date(),
): string {
  return serializeLogJson(events, {
    exportedAt,
    recordsKey: 'events',
    metadata: { source: SOURCE },
  });
}

/**
 * Descriptive, filesystem-safe filename stamped with the export time, e.g.
 * `astroid-audit-log-2026-11-22T13-30-45-123Z.csv`.
 */
export function buildAuditExportFilename(
  format: AuditExportFormat,
  date: Date = new Date(),
): string {
  return buildExportFilename(SCOPE, format, date);
}

/**
 * Build a lazily streamed plan for the audit log; consumed by the async
 * downloader so large exports yield to the event loop between batches.
 */
export function planAuditExport(
  events: readonly AuditEvent[],
  format: AuditExportFormat,
  date: Date = new Date(),
): LogExportPlan {
  return format === 'csv'
    ? planLogExport({
        scope: SCOPE,
        format: 'csv',
        rows: events,
        columns: AUDIT_CSV_COLUMNS,
        exportedAt: date,
      })
    : planLogExport({
        scope: SCOPE,
        format: 'json',
        rows: events,
        recordsKey: 'events',
        metadata: { source: SOURCE },
        exportedAt: date,
      });
}

/** Assemble a complete export payload (filename, MIME type, chunked body). */
export function buildAuditExport(
  events: readonly AuditEvent[],
  format: AuditExportFormat,
  date: Date = new Date(),
): AuditExportPayload {
  const plan = planAuditExport(events, format, date);
  return {
    filename: plan.filename,
    mimeType: plan.mimeType,
    chunks: Array.from(plan.stream()),
  };
}

/** Trigger a browser file download for an export payload (client-side only). */
export function downloadAuditExport(payload: AuditExportPayload): void {
  downloadLogExport(payload);
}

/** Convenience: build and download the audit log in one call. */
export function exportAuditEvents(
  events: readonly AuditEvent[],
  format: AuditExportFormat,
  date: Date = new Date(),
): void {
  downloadAuditExport(buildAuditExport(events, format, date));
}
