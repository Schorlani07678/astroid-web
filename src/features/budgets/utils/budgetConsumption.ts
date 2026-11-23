/**
 * Pure budget-consumption math for {@link BudgetConsumptionMeter}. Kept free of
 * React so the threshold rules can be unit-tested on their own.
 */

export interface ConsumptionThresholds {
  /** Percent of the budget at which the meter turns to the warning state. */
  warning: number;
  /** Percent of the budget at which the meter turns to the critical state. */
  critical: number;
}

export const DEFAULT_CONSUMPTION_THRESHOLDS: ConsumptionThresholds = {
  warning: 80,
  critical: 95,
};

/**
 * - `healthy`  — below the warning threshold.
 * - `warning`  — at or above the warning threshold (default 80%).
 * - `critical` — at or above the critical threshold (default 95%).
 * - `exceeded` — spend is over the total budget.
 */
export type ConsumptionLevel = 'healthy' | 'warning' | 'critical' | 'exceeded';

export interface BudgetConsumption {
  /** Unclamped consumption percentage (can exceed 100). */
  percent: number;
  /** Percentage clamped to 0–100 for the bar width and `aria-valuenow`. */
  displayPercent: number;
  level: ConsumptionLevel;
  /** Budget left, never negative. */
  remaining: number;
  /** Amount spent beyond the budget, 0 when within budget. */
  overspend: number;
  thresholds: ConsumptionThresholds;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

/**
 * Coerces caller-supplied thresholds into a usable pair: each is clamped to
 * 0–100, and critical can never sit below warning (the pair is swapped).
 */
export function normalizeThresholds(
  thresholds: Partial<ConsumptionThresholds> = {},
): ConsumptionThresholds {
  const warning = clampPercent(finiteOr(thresholds.warning ?? NaN, DEFAULT_CONSUMPTION_THRESHOLDS.warning));
  const critical = clampPercent(finiteOr(thresholds.critical ?? NaN, DEFAULT_CONSUMPTION_THRESHOLDS.critical));
  return warning <= critical ? { warning, critical } : { warning: critical, critical: warning };
}

export function getConsumptionLevel(
  percent: number,
  thresholds: ConsumptionThresholds = DEFAULT_CONSUMPTION_THRESHOLDS,
): ConsumptionLevel {
  if (percent > 100) return 'exceeded';
  if (percent >= thresholds.critical) return 'critical';
  if (percent >= thresholds.warning) return 'warning';
  return 'healthy';
}

export function computeBudgetConsumption(
  total: number,
  spent: number,
  thresholds?: Partial<ConsumptionThresholds>,
): BudgetConsumption {
  const safeTotal = Math.max(0, finiteOr(total, 0));
  const safeSpent = Math.max(0, finiteOr(spent, 0));
  const normalized = normalizeThresholds(thresholds);

  // A zero budget with any spend is fully exceeded; with no spend it is empty.
  const percent =
    safeTotal > 0 ? (safeSpent / safeTotal) * 100 : safeSpent > 0 ? Number.POSITIVE_INFINITY : 0;

  return {
    percent,
    displayPercent: clampPercent(percent),
    level: getConsumptionLevel(percent, normalized),
    remaining: Math.max(0, safeTotal - safeSpent),
    overspend: Math.max(0, safeSpent - safeTotal),
    thresholds: normalized,
  };
}

export const CONSUMPTION_LEVEL_LABELS: Record<ConsumptionLevel, string> = {
  healthy: 'On track',
  warning: 'Warning',
  critical: 'Critical',
  exceeded: 'Over budget',
};
