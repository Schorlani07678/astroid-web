/**
 * Shared serialization helpers for exporting log-style datasets as CSV or JSON.
 *
 * The audit/history views (agent activity and financial audit logs) build on
 * this module so escaping rules, filenames, MIME types, and the browser
 * download plumbing live in exactly one place. Serialization is pure and
 * chunked: every format is produced by a generator that yields one row or
 * record at a time, so a large log export never needs a single giant
 * intermediate string, and the async downloader hands control back to the
 * event loop between batches instead of blocking the main UI thread.
 */

export type ExportFormat = 'csv' | 'json';

/** UTF-8 explicitly declared so spreadsheets and parsers decode files correctly. */
export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

/** One CSV column: a header label plus an extractor for each row value. */
export interface ExportColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/** A fully serialized file, ready to be handed to `new Blob(chunks, …)`. */
export interface LogExportPayload {
  filename: string;
  mimeType: string;
  /** Ordered chunks ready for `new Blob(chunks, { type })`. */
  chunks: string[];
}

/** A lazily streamed export: the body is generated only when consumed. */
export interface LogExportPlan {
  filename: string;
  mimeType: string;
  /** Yields the file body one row/record at a time. */
  stream: () => Generator<string, void, undefined>;
}

interface LogExportBaseOptions<T> {
  /** Scope used to build the filename, e.g. `audit-log`. */
  scope: string;
  rows: readonly T[];
  /** Injectable for deterministic tests and reproducible exports. */
  exportedAt?: Date;
}

export type LogExportOptions<T> =
  | (LogExportBaseOptions<T> & {
      format: 'csv';
      columns: readonly ExportColumn<T>[];
    })
  | (LogExportBaseOptions<T> & {
      format: 'json';
      /** Envelope key for the collection, e.g. `events` or `records`. */
      recordsKey?: string;
      /** Extra self-describing envelope fields, e.g. `{ source: … }`. */
      metadata?: Record<string, unknown>;
    });

export interface LogJsonEnvelopeOptions {
  exportedAt?: string | Date;
  recordsKey?: string;
  metadata?: Record<string, unknown>;
}

export interface AsyncDownloadOptions {
  /** Chunks to serialize before handing control back to the event loop. */
  yieldEvery?: number;
}

const DEFAULT_YIELD_EVERY = 250;

/** C0/C1 control characters (except tab, LF, CR) corrupt CSV rows/cells. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Leading characters a spreadsheet may interpret as a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Numeric literals (including negatives) are safe values, not formulas. */
const NUMERIC_LITERAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Strip control characters that would break CSV row boundaries or corrupt
 * spreadsheet cells, while keeping tabs and newlines intact.
 */
export function sanitizeExportText(value: string): string {
  return value.replace(CONTROL_CHARS, '');
}

function toExportText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return sanitizeExportText(value);
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : sanitizeExportText(json);
  } catch {
    return sanitizeExportText(String(value));
  }
}

/**
 * Escape a single CSV field per RFC 4180 (quote when the value contains a
 * comma, quote, or line break; double embedded quotes) and neutralise
 * spreadsheet formula injection by prefixing a leading `'` to values that
 * start with `=`, `+`, `-`, or `@` — except plain numeric literals, which
 * stay numeric.
 */
export function escapeCsvCell(value: unknown): string {
  const text = toExportText(value);
  if (text.length === 0) return '';
  const guarded =
    !NUMERIC_LITERAL.test(text) && FORMULA_PREFIX.test(text) ? `'${text}` : text;
  const needsQuotes = guarded !== text || /[",\r\n]/.test(guarded);
  return needsQuotes ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * Descriptive, filesystem-safe filename stamped with the export time, e.g.
 * `astroid-audit-log-2026-11-22T13-30-45-123Z.csv`.
 */
export function buildExportFilename(
  scope: string,
  format: ExportFormat,
  date: Date = new Date(),
): string {
  const slug =
    scope
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'export';
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `astroid-${slug}-${stamp}.${format}`;
}

/** Yield the CSV header followed by one chunk per row (CRLF line endings). */
export function* streamLogCsv<T>(
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
): Generator<string, void, undefined> {
  yield `${columns.map((column) => escapeCsvCell(column.header)).join(',')}\r\n`;
  for (const row of rows) {
    yield `${columns.map((column) => escapeCsvCell(column.value(row))).join(',')}\r\n`;
  }
}

export function serializeLogCsv<T>(
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
): string {
  return Array.from(streamLogCsv(rows, columns)).join('');
}

/**
 * Yield a self-describing JSON envelope one record at a time so large log
 * sets stream into the download without one giant intermediate string.
 */
export function* streamLogJson<T>(
  rows: readonly T[],
  options: LogJsonEnvelopeOptions = {},
): Generator<string, void, undefined> {
  const exportedAt =
    options.exportedAt instanceof Date
      ? options.exportedAt.toISOString()
      : (options.exportedAt ?? new Date().toISOString());
  const recordsKey = options.recordsKey ?? 'records';

  yield '{\n';
  yield `  "exportedAt": ${JSON.stringify(exportedAt)},\n`;
  for (const [key, value] of Object.entries(options.metadata ?? {})) {
    yield `  ${JSON.stringify(key)}: ${JSON.stringify(value) ?? 'null'},\n`;
  }
  yield `  "count": ${rows.length},\n`;
  yield `  ${JSON.stringify(recordsKey)}: [`;
  let first = true;
  for (const row of rows) {
    yield `${first ? '\n    ' : ',\n    '}${JSON.stringify(row ?? null) ?? 'null'}`;
    first = false;
  }
  yield `${first ? '' : '\n'}  ]\n}\n`;
}

export function serializeLogJson<T>(
  rows: readonly T[],
  options: LogJsonEnvelopeOptions = {},
): string {
  return Array.from(streamLogJson(rows, options)).join('');
}

/**
 * Assemble a lazily streamed export plan (filename + MIME type + generator).
 * CSV plans require columns; JSON plans build a self-describing envelope.
 */
export function planLogExport<T>(options: LogExportOptions<T>): LogExportPlan {
  const date = options.exportedAt ?? new Date();
  const filename = buildExportFilename(options.scope, options.format, date);

  if (options.format === 'csv') {
    const columns = options.columns ?? [];
    const { rows } = options;
    if (columns.length === 0) {
      throw new Error('CSV export requires at least one column.');
    }
    return {
      filename,
      mimeType: EXPORT_MIME_TYPES.csv,
      stream: () => streamLogCsv(rows, columns),
    };
  }

  const { rows } = options;
  const recordsKey = options.recordsKey ?? 'records';
  const metadata = options.metadata;
  const exportedAt = date.toISOString();
  return {
    filename,
    mimeType: EXPORT_MIME_TYPES.json,
    stream: () => streamLogJson(rows, { exportedAt, recordsKey, metadata }),
  };
}

/** Materialize a plan into a payload of ordered chunks. */
export function buildLogExport<T>(options: LogExportOptions<T>): LogExportPayload {
  const plan = planLogExport(options);
  return {
    filename: plan.filename,
    mimeType: plan.mimeType,
    chunks: Array.from(plan.stream()),
  };
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function triggerBrowserDownload(
  filename: string,
  mimeType: string,
  chunks: readonly string[],
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // A UTF-8 BOM helps Excel and friends detect the encoding for CSV files.
  const parts: BlobPart[] = mimeType.startsWith('text/csv')
    ? ['\uFEFF', ...chunks]
    : Array.from(chunks);
  const blob = new Blob(parts, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Trigger a browser download for a materialized payload (SSR-safe no-op). */
export function downloadLogExport(payload: LogExportPayload): void {
  triggerBrowserDownload(payload.filename, payload.mimeType, payload.chunks);
}

/**
 * Stream a plan into a download, yielding to the event loop between batches
 * so generating a large log export never blocks the main UI thread.
 */
export async function downloadLogExportAsync(
  plan: LogExportPlan,
  options: AsyncDownloadOptions = {},
): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const yieldEvery = Math.max(1, options.yieldEvery ?? DEFAULT_YIELD_EVERY);
  const chunks: string[] = [];
  let sinceYield = 0;
  for (const chunk of plan.stream()) {
    chunks.push(chunk);
    sinceYield += 1;
    if (sinceYield >= yieldEvery) {
      sinceYield = 0;
      await yieldToMainThread();
    }
  }
  triggerBrowserDownload(plan.filename, plan.mimeType, chunks);
}
