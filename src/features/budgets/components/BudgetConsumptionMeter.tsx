'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertOctagon, AlertTriangle, CheckCircle2, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import {
  CONSUMPTION_LEVEL_LABELS,
  computeBudgetConsumption,
  type ConsumptionLevel,
  type ConsumptionThresholds,
} from '../utils/budgetConsumption';

export interface BudgetConsumptionMeterProps {
  /** Department or envelope name shown above the bar. */
  label: string;
  /** Total budget allocated for the period. */
  total: number;
  /** Amount spent so far in the period. */
  spent: number;
  /** Asset code passed to `formatCurrency` (defaults to USDC). */
  currency?: string;
  /** Override the default 80% warning / 95% critical thresholds. */
  thresholds?: Partial<ConsumptionThresholds>;
  /** Optional secondary line, e.g. the department manager or period. */
  caption?: string;
  /** Draw tick marks at the warning and critical thresholds. Defaults to true. */
  showThresholdMarkers?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** Token-backed styles per level: bar fill, badge variant and icon. */
const LEVEL_STYLES: Record<
  ConsumptionLevel,
  { bar: string; text: string; badge: 'success' | 'warning' | 'danger'; icon: LucideIcon }
> = {
  healthy: { bar: 'bg-success', text: 'text-success', badge: 'success', icon: CheckCircle2 },
  warning: { bar: 'bg-warning', text: 'text-warning', badge: 'warning', icon: AlertTriangle },
  critical: { bar: 'bg-danger', text: 'text-danger', badge: 'danger', icon: AlertOctagon },
  exceeded: { bar: 'bg-danger', text: 'text-danger', badge: 'danger', icon: AlertOctagon },
};

const formatPercent = (value: number) =>
  Number.isFinite(value) ? `${Math.round(value)}%` : '>100%';

/**
 * Accessible department budget consumption meter.
 *
 * The bar switches from success → warning → danger tokens as spend crosses the
 * warning (80%) and critical (95%) thresholds, with optional tick marks at each
 * threshold. It is exposed as a `progressbar` with `aria-valuenow/min/max` and
 * a spoken `aria-valuetext` that includes the alert level, and the fill
 * animates with framer-motion (disabled under `prefers-reduced-motion`).
 */
export function BudgetConsumptionMeter({
  label,
  total,
  spent,
  currency = 'USDC',
  thresholds,
  caption,
  showThresholdMarkers = true,
  size = 'md',
  className,
}: BudgetConsumptionMeterProps) {
  const labelId = useId();
  const statusId = useId();
  const reduceMotion = useReducedMotion();
  const consumption = computeBudgetConsumption(total, spent, thresholds);
  const { level, displayPercent, percent, remaining, overspend } = consumption;
  const styles = LEVEL_STYLES[level];
  const Icon = styles.icon;
  const isAlert = level !== 'healthy';

  const valueText = `${formatCurrency(spent, currency)} of ${formatCurrency(total, currency)} spent, ${formatPercent(percent)}. ${CONSUMPTION_LEVEL_LABELS[level]}.`;

  return (
    <div
      className={cn('space-y-2', className)}
      data-level={level}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={labelId} className="truncate text-sm font-medium text-foreground">
            {label}
          </p>
          {caption && <p className="truncate text-2xs text-foreground-muted">{caption}</p>}
        </div>
        <Badge variant={styles.badge} size="sm" className="shrink-0 gap-1">
          <Icon className="h-3 w-3" aria-hidden />
          {CONSUMPTION_LEVEL_LABELS[level]}
        </Badge>
      </div>

      <div className="relative">
        <div
          role="progressbar"
          aria-labelledby={labelId}
          aria-describedby={statusId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(displayPercent)}
          aria-valuetext={valueText}
          className={cn(
            'relative w-full overflow-hidden rounded-full bg-surface-secondary',
            size === 'sm' ? 'h-1.5' : 'h-2.5',
          )}
        >
          <motion.div
            className={cn('h-full rounded-full transition-colors duration-slow', styles.bar)}
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${displayPercent}%` }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        {showThresholdMarkers &&
          (['warning', 'critical'] as const).map((key) => (
            <span
              key={key}
              aria-hidden
              title={`${key === 'warning' ? 'Warning' : 'Critical'} at ${consumption.thresholds[key]}%`}
              className={cn(
                'absolute -top-0.5 w-px rounded-full',
                size === 'sm' ? 'h-2.5' : 'h-3.5',
                key === 'warning' ? 'bg-warning' : 'bg-danger',
              )}
              style={{ left: `${consumption.thresholds[key]}%` }}
            />
          ))}
      </div>

      <div
        id={statusId}
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-2xs"
      >
        <span className="tabular text-foreground-secondary">
          {formatCurrency(spent, currency, { compact: true })} /{' '}
          {formatCurrency(total, currency, { compact: true })}
          <span className={cn('ml-1.5 font-medium', isAlert ? styles.text : 'text-foreground')}>
            {formatPercent(percent)}
          </span>
        </span>
        <span className={cn('tabular', level === 'exceeded' ? 'text-danger' : 'text-foreground-muted')}>
          {level === 'exceeded'
            ? `${formatCurrency(overspend, currency, { compact: true })} over budget`
            : `${formatCurrency(remaining, currency, { compact: true })} remaining`}
        </span>
      </div>
    </div>
  );
}

export default BudgetConsumptionMeter;
