import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeTransactionTimeline,
  isAwaitingNetworkPropagation,
  resolveTransactionTimeline,
  TRANSACTION_TIMELINE_STAGES,
  transactionStage,
  type TransactionTimelineInput,
} from './transactionTimeline';

const statuses = (input: TransactionTimelineInput) =>
  resolveTransactionTimeline(input).map((step) => step.status);

test('queued transactions start at the submission stage', () => {
  const steps = resolveTransactionTimeline({ state: 'queued' });

  assert.deepEqual(
    steps.map((step) => step.id),
    ['submission', 'network', 'approval', 'settlement'],
  );
  assert.deepEqual(statuses({ state: 'queued' }), ['active', 'pending', 'pending', 'pending']);
  assert.equal(steps.filter((step) => step.isCurrent).length, 1);
  assert.equal(steps[0]!.isCurrent, true);
});

test('submitted transactions complete submission and activate network validation', () => {
  const steps = resolveTransactionTimeline({ state: 'submitted' });

  assert.deepEqual(statuses({ state: 'submitted' }), [
    'completed',
    'active',
    'pending',
    'pending',
  ]);
  assert.equal(steps.find((step) => step.isCurrent)?.id, 'network');
});

test('propagating transactions keep the network stage active', () => {
  assert.deepEqual(statuses({ state: 'propagating' }), [
    'completed',
    'active',
    'pending',
    'pending',
  ]);
  assert.equal(isAwaitingNetworkPropagation({ state: 'propagating' }), true);
  assert.equal(isAwaitingNetworkPropagation({ state: 'submitted' }), true);
  assert.equal(isAwaitingNetworkPropagation({ state: 'awaiting_approval' }), false);
});

test('awaiting approval completes network validation first', () => {
  const steps = resolveTransactionTimeline({
    state: 'awaiting_approval',
    approvalProgress: { collected: 1, required: 2 },
  });

  assert.deepEqual(
    steps.map((step) => step.status),
    ['completed', 'completed', 'active', 'pending'],
  );
  assert.equal(steps.find((step) => step.isCurrent)?.id, 'approval');
});

test('settling transactions leave only settlement active', () => {
  assert.deepEqual(statuses({ state: 'settling' }), [
    'completed',
    'completed',
    'completed',
    'active',
  ]);
});

test('settled transactions complete every stage and mark none current', () => {
  const steps = resolveTransactionTimeline({ state: 'settled' });

  assert.deepEqual(
    steps.map((step) => step.status),
    ['completed', 'completed', 'completed', 'completed'],
  );
  assert.equal(steps.some((step) => step.isCurrent), false);
});

test('a failure at network validation leaves submission completed and later stages pending', () => {
  const steps = resolveTransactionTimeline({
    state: 'failed',
    failedAt: 'network',
    failureMessage: 'tx_bad_seq',
  });

  assert.deepEqual(
    steps.map((step) => step.status),
    ['completed', 'error', 'pending', 'pending'],
  );
  assert.equal(steps.find((step) => step.isCurrent)?.id, 'network');
});

test('a failure at submission marks only the first stage as error', () => {
  const steps = resolveTransactionTimeline({ state: 'failed', failedAt: 'submission' });

  assert.deepEqual(
    steps.map((step) => step.status),
    ['error', 'pending', 'pending', 'pending'],
  );
  assert.equal(steps[0]!.isCurrent, true);
});

test('a settlement failure keeps every earlier stage completed', () => {
  const steps = resolveTransactionTimeline({
    state: 'failed',
    failedAt: 'settlement',
    failureMessage: 'network_timeout',
  });

  assert.deepEqual(
    steps.map((step) => step.status),
    ['completed', 'completed', 'completed', 'error'],
  );
  assert.equal(steps.find((step) => step.isCurrent)?.id, 'settlement');
});

test('failure without a stage defaults to network validation', () => {
  const steps = resolveTransactionTimeline({ state: 'failed' });

  assert.equal(steps.find((step) => step.status === 'error')?.id, 'network');
});

test('stage definitions preserve the full long label for every stage', () => {
  assert.equal(TRANSACTION_TIMELINE_STAGES.length, 4);
  assert.equal(transactionStage('network').label, 'Network validation & propagation');
  for (const stage of TRANSACTION_TIMELINE_STAGES) {
    assert.ok(stage.label.length > 0);
    assert.ok(stage.shortLabel.length > 0);
  }
});

test('announcements describe approval progress and failure context', () => {
  const awaiting = describeTransactionTimeline({
    state: 'awaiting_approval',
    approvalProgress: { collected: 2, required: 3 },
  });
  assert.match(awaiting, /awaiting multi-party approval/);
  assert.match(awaiting, /2 of 3 signatures collected/);

  const failed = describeTransactionTimeline({
    state: 'failed',
    failedAt: 'settlement',
    failureMessage: 'Ledger closed before inclusion',
  });
  assert.match(failed, /failed during final settlement/);
  assert.match(failed, /Ledger closed before inclusion/);

  const propagating = describeTransactionTimeline({ state: 'propagating' });
  assert.match(propagating, /propagating across the Stellar network/);

  assert.match(describeTransactionTimeline({ state: 'settled' }), /all stages completed/);
});
