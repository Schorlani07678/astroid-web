import type { Policy } from '@/types/domain';

/**
 * Pure data shaping for the department budget consumption trend chart.
 *
 * Observations are the spend recorded in each bucket (velocity, not a running
 * total). The policy limit is read from the real `Policy` entity using the
 * same configuration keys as `features/policies/policyEvaluation.ts`, so the
 * chart and the evaluator agree on what counts as the spending guardrail.
 */

export interface BudgetSpendObservation {
  /** ISO-8601 timestamp at the start of the bucket. */
  timestamp: string;
  /** Amount spent inside the bucket. */
  amount: number;
}

export interface BudgetConsumptionTrendPoint {
  timestamp: string;
  label: string;
  velocity: number;
  /** Zero when no representable policy limit exists (never divide by zero). */
  limit: number;
  /** Velocity as a share of the limit; zero when the limit is zero. */
  percentOfLimit: number;
  exceedsLimit: boolean;
}

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** Extract the numeric spending limit from an enabled or disabled policy. */
export function spendingPolicyLimit(
  policy: Pick<Policy, 'enabled' | 'type' | 'configuration'>,
): number | null {
  // Mirrors configFromPolicies: a disabled policy is not an active guardrail.
  if (!policy.enabled) return null;

  const key =
    policy.type === 'max_spend'
      ? 'maxAmount'
      : policy.type === 'daily_budget' || policy.type === 'weekly_budget' || policy.type === 'monthly_budget'
        ? 'limit'
        : null;
  if (!key) return null;

  const raw = policy.configuration[key];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** Short UTC axis label; malformed timestamps fall back to the raw value. */
export function budgetTrendLabel(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : dayFormatter.format(date);
}

/**
 * Map raw observations to chart-ready rows, dropping malformed timestamps and
 * non-finite amounts. A missing/zero policy limit yields `limit: 0`,
 * `percentOfLimit: 0` and no "over limit" flags rather than an Infinity.
 */
export function buildBudgetConsumptionTrend(
  observations: readonly BudgetSpendObservation[],
  policy: Pick<Policy, 'enabled' | 'type' | 'configuration'>,
): BudgetConsumptionTrendPoint[] {
  const limit = spendingPolicyLimit(policy) ?? 0;

  return observations.flatMap((observation) => {
    const parsed = Date.parse(observation.timestamp);
    if (Number.isNaN(parsed) || !Number.isFinite(observation.amount)) return [];

    const velocity = Math.max(0, observation.amount);
    return [
      {
        timestamp: observation.timestamp,
        label: budgetTrendLabel(observation.timestamp),
        velocity,
        limit,
        percentOfLimit: limit > 0 ? (velocity / limit) * 100 : 0,
        exceedsLimit: limit > 0 && velocity > limit,
      },
    ];
  });
}

/** Plain-language summary reused by the chart's `aria-label` and caption. */
export function summarizeBudgetConsumptionTrend(points: readonly BudgetConsumptionTrendPoint[]): string {
  if (points.length === 0) return 'No budget consumption data for this period.';

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const breaches = points.filter((point) => point.exceedsLimit).length;
  const limitText =
    last.limit > 0
      ? ` against a policy limit of ${Math.round(last.limit)}`
      : ' with no policy limit configured';

  return `Spending velocity from ${first.label} to ${last.label}: latest bucket ${Math.round(
    last.velocity,
  )}${limitText}. ${breaches} of ${points.length} buckets exceeded the limit.`;
}
