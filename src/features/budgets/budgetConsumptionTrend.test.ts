import assert from 'node:assert/strict';
import test from 'node:test';

import type { Policy } from '@/types/domain';

import {
  buildBudgetConsumptionTrend,
  budgetTrendLabel,
  spendingPolicyLimit,
  summarizeBudgetConsumptionTrend,
  type BudgetSpendObservation,
} from './budgetConsumptionTrend';

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'pol_eng_monthly',
    organizationId: 'org_nova',
    name: 'Engineering monthly ceiling',
    description: 'Caps engineering agent spend.',
    type: 'monthly_budget',
    configuration: { limit: 10_000, asset: 'USDC' },
    priority: 1,
    enabled: true,
    appliesTo: 4,
    violations30d: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const observations: BudgetSpendObservation[] = [
  { timestamp: '2026-08-01T00:00:00.000Z', amount: 1_200 },
  { timestamp: '2026-08-02T00:00:00.000Z', amount: 12_000 },
  { timestamp: '2026-08-03T00:00:00.000Z', amount: 0 },
];

test('spendingPolicyLimit reads the same configuration keys as the evaluator', () => {
  assert.equal(spendingPolicyLimit(policy()), 10_000);
  assert.equal(
    spendingPolicyLimit(policy({ type: 'daily_budget', configuration: { limit: 500 } })),
    500,
  );
  assert.equal(
    spendingPolicyLimit(policy({ type: 'max_spend', configuration: { maxAmount: 2_500 } })),
    2_500,
  );
});

test('spendingPolicyLimit ignores disabled, unsupported and non-finite limits', () => {
  assert.equal(spendingPolicyLimit(policy({ enabled: false })), null);
  assert.equal(spendingPolicyLimit(policy({ type: 'allowed_recipients' })), null);
  assert.equal(spendingPolicyLimit(policy({ configuration: { limit: 0 } })), null);
  assert.equal(spendingPolicyLimit(policy({ configuration: { limit: -10 } })), null);
  assert.equal(spendingPolicyLimit(policy({ configuration: { limit: '10000' } })), null);
  assert.equal(spendingPolicyLimit(policy({ configuration: {} })), null);
});

test('buildBudgetConsumptionTrend shapes velocity rows against the policy limit', () => {
  const points = buildBudgetConsumptionTrend(observations, policy());

  assert.equal(points.length, 3);
  assert.equal(points[0]?.label, 'Aug 1');
  assert.equal(points[0]?.velocity, 1_200);
  assert.equal(points[0]?.limit, 10_000);
  assert.equal(points[0]?.percentOfLimit, 12);
  assert.equal(points[0]?.exceedsLimit, false);

  assert.equal(points[1]?.percentOfLimit, 120);
  assert.equal(points[1]?.exceedsLimit, true);
  assert.equal(points[2]?.velocity, 0);
  assert.equal(points[2]?.exceedsLimit, false);
});

test('buildBudgetConsumptionTrend drops malformed rows and clamps negative spend', () => {
  const points = buildBudgetConsumptionTrend(
    [
      { timestamp: 'not-a-date', amount: 100 },
      { timestamp: '2026-08-01T00:00:00.000Z', amount: Number.NaN },
      { timestamp: '2026-08-02T00:00:00.000Z', amount: -50 },
      ...observations.slice(0, 1),
    ],
    policy(),
  );

  assert.equal(points.length, 2);
  assert.equal(points[0]?.velocity, 0);
  assert.equal(points[1]?.velocity, 1_200);
});

test('zero or missing budget never divides by zero', () => {
  for (const activePolicy of [
    policy({ configuration: { limit: 0 } }),
    policy({ type: 'time_window' }),
    policy({ enabled: false }),
  ]) {
    const points = buildBudgetConsumptionTrend(observations.slice(0, 1), activePolicy);
    assert.equal(points[0]?.limit, 0);
    assert.equal(points[0]?.percentOfLimit, 0);
    assert.equal(points[0]?.exceedsLimit, false);
  }
});

test('budgetTrendLabel falls back to the raw timestamp for invalid dates', () => {
  assert.equal(budgetTrendLabel('2026-08-01T00:00:00.000Z'), 'Aug 1');
  assert.equal(budgetTrendLabel('not-a-date'), 'not-a-date');
});

test('summarizeBudgetConsumptionTrend reports breaches and the empty state', () => {
  assert.equal(
    summarizeBudgetConsumptionTrend([]),
    'No budget consumption data for this period.',
  );

  const summary = summarizeBudgetConsumptionTrend(buildBudgetConsumptionTrend(observations, policy()));
  assert.match(summary, /Aug 1 to Aug 3/);
  assert.match(summary, /latest bucket 0/);
  assert.match(summary, /policy limit of 10000/);
  assert.match(summary, /1 of 3 buckets exceeded the limit/);
});
