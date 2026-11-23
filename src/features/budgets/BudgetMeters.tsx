'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, CircleDollarSign, Wallet } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RESPONSIVE_CHART_DEBOUNCE_MS } from '@/components/charts/responsive';
import { cn } from '@/lib/cn';
import { ChartTooltipShell, type TooltipPayloadItem } from '@/components/charts';
import { formatCurrency, formatDateTime } from '@/lib/format';

export interface BudgetHistoryPoint {
  /** ISO timestamp of the observation. */
  timestamp: string;
  /** Cumulative spend up to and including this point. */
  amount: number;
  /** Spend recorded in the window that produced this point. */
  daily: number;
}

export interface BudgetMeterProps {
  label: string;
  allocated: number;
  spent: number;
  currency?: string;
  percent?: number;
  /** Historical burn series. Generated deterministically when omitted. */
  history?: BudgetHistoryPoint[];
}

export type BudgetMeterState = 'normal' | 'warning' | 'critical';

export function getBudgetMeterState(percent: number): BudgetMeterState {
  if (percent >= 100) return 'critical';
  if (percent >= 70) return 'warning';
  return 'normal';
}

/** Threshold palette — green / amber / red mapped to the design tokens. */
const STATE_COLORS: Record<BudgetMeterState, string> = {
  normal: 'rgb(var(--success))',
  warning: 'rgb(var(--warning))',
  critical: 'rgb(var(--danger))',
};

/** Gauge stroke utilities for the same tokens, so the SVG follows the theme. */
const STATE_STROKE: Record<BudgetMeterState, string> = {
  normal: 'stroke-success',
  warning: 'stroke-warning',
  critical: 'stroke-danger',
};

const STATE_RING: Record<BudgetMeterState, string> = {
  normal: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  critical: 'bg-danger-soft text-danger',
};

/** Small stable string hash so the mock history never changes between renders. */
function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 1000) / 1000;
}

/**
 * Reconstructs a deterministic cumulative burn series for a meter so the
 * sparkline always resolves to the recorded `spent` figure. The series is
 * stable across re-renders, which keeps server/client markup identical.
 */
export function buildBudgetHistory(
  label: string,
  spent: number,
  days = 14,
): BudgetHistoryPoint[] {
  const weights = Array.from(
    { length: days },
    (_, dayIndex) => 0.55 + hashSeed(`${label}:${dayIndex}`) * 0.9,
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const endOfDay = new Date();
  endOfDay.setHours(0, 0, 0, 0);

  let cumulativeWeight = 0;
  let previous = 0;

  return Array.from({ length: days }, (_, dayIndex) => {
    const day = new Date(endOfDay);
    day.setDate(endOfDay.getDate() - (days - 1 - dayIndex));
    cumulativeWeight += weights[dayIndex] ?? 0;

    const ratio = dayIndex === days - 1 ? 1 : cumulativeWeight / weightTotal;
    const amount = Math.round(spent * ratio * 100) / 100;
    const daily = Math.max(0, Math.round((amount - previous) * 100) / 100);
    previous = amount;

    return { timestamp: day.toISOString(), amount, daily };
  });
}

function BudgetSparkline({
  label,
  currency,
  state,
  history,
}: {
  label: string;
  currency: string;
  state: BudgetMeterState;
  history: BudgetHistoryPoint[];
}) {
  const gradientId = useId().replace(/:/g, '');
  const reduceMotion = useReducedMotion();
  const color = STATE_COLORS[state];

  return (
    <div
      className="h-8 w-full min-w-0"
      role="img"
      aria-label={`${label} — 14-day spend velocity sparkline`}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        debounce={RESPONSIVE_CHART_DEBOUNCE_MS}
      >
        <AreaChart data={history} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <RechartsTooltip
            cursor={{ stroke: 'rgb(var(--border-strong))', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const series = (payload as TooltipPayloadItem[])[0]
                ?.payload as unknown as BudgetHistoryPoint | undefined;
              if (!series) return null;
              return (
                <ChartTooltipShell label={formatDateTime(series.timestamp)}>
                  <span className="flex items-center justify-between gap-4">
                    <span className="text-foreground-secondary">Cumulative</span>
                    <span className="tabular font-medium text-foreground">
                      {formatCurrency(series.amount, currency, { compact: true })}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-4">
                    <span className="text-foreground-secondary">Daily burn</span>
                    <span className="tabular font-medium text-foreground">
                      {formatCurrency(series.daily, currency, { compact: true })}
                    </span>
                  </span>
                </ChartTooltipShell>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            name="Spend velocity"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${gradientId})`}
            isAnimationActive={!reduceMotion}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Gauge({
  percent = 0,
  label,
  spent,
  allocated,
  currency,
  history,
  onDrillDown,
}: BudgetMeterProps & { onDrillDown?: (meter: BudgetMeterProps) => void }) {
  const safePercent = Math.min(100, Math.max(0, percent));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (safePercent / 100) * circumference;
  const state = getBudgetMeterState(safePercent);
  const resolvedCurrency = currency ?? 'USDC';
  const [mounted, setMounted] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => setMounted(true), []);

  const series = useMemo(
    () => history ?? buildBudgetHistory(label, spent),
    [history, label, spent],
  );

  const dailyAverage = useMemo(() => {
    if (series.length === 0) return 0;
    const total = series.reduce((sum, point) => sum + point.daily, 0);
    return total / series.length;
  }, [series]);

  // Side-by-side while the grid is a single column; stacked once three
  // meters share a row (lg) so the details keep their full width.
  return (
    <div
      className="rounded-card border border-border bg-surface-secondary/40 p-4"
      onClick={onDrillDown ? () => onDrillDown({ label, allocated, spent, currency, history }) : undefined}
      role={onDrillDown ? 'button' : undefined}
      tabIndex={onDrillDown ? 0 : undefined}
      onKeyDown={onDrillDown ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onDrillDown({ label, allocated, spent, currency, history });
        }
      } : undefined}
    >
      <div className="flex items-center gap-4 lg:flex-col lg:items-stretch">
        <div className="relative grid h-10 w-10 shrink-0 place-items-center">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden>
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              className="stroke-border"
              strokeWidth="10"
            />
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={cn(STATE_STROKE[state], state === 'critical' && 'animate-pulse')}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xs font-medium uppercase tabular text-foreground-secondary">
                {safePercent.toFixed(0)}%
              </p>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{label}</p>
              <p className="text-2xs text-foreground-muted">Allocated spend envelope</p>
            </div>
            <Badge
              variant={
                state === 'critical'
                  ? 'danger'
                  : state === 'warning'
                    ? 'warning'
                    : 'success'
              }
              size="sm"
              dot
            >
              {state === 'critical'
                ? 'Critical'
                : state === 'warning'
                  ? 'Watch'
                  : 'Healthy'}
            </Badge>
          </div>

          <div className="flex items-center justify-between text-xs text-foreground-secondary">
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-4 w-4" aria-hidden />
              {formatCurrency(spent, resolvedCurrency, { compact: true })}
            </span>
            <span className="inline-flex items-center gap-1">
              <CircleDollarSign className="h-4 w-4" aria-hidden />
              {formatCurrency(allocated, resolvedCurrency, { compact: true })}
            </span>
          </div>

          <div className="flex items-center gap-2 text-2xs text-foreground-muted">
            <span className={cn('inline-flex rounded-full px-2 py-1', STATE_RING[state])}>
              {state === 'critical'
                ? 'Over-allocated'
                : state === 'warning'
                  ? 'Elevated usage'
                  : 'Within limit'}
            </span>
            {state === 'critical' && (
              <span className="inline-flex items-center gap-1 text-danger">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                Action required
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Historical sparkline — fixed height keeps layout shift at zero. */}
      <div className="mt-3 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between text-2xs text-foreground-muted">
          <span>14-day velocity</span>
          <span className="tabular">
            {formatCurrency(dailyAverage, resolvedCurrency, { compact: true })}/day avg
          </span>
        </div>
        <motion.div
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mt-1 h-8 w-full"
        >
          {mounted ? (
            <BudgetSparkline
              label={label}
              currency={resolvedCurrency}
              state={state}
              history={series}
            />
          ) : (
            <div className="skeleton h-8 w-full rounded-sm" aria-hidden />
          )}
        </motion.div>
      </div>
    </div>
  );
}

export function BudgetMeters({
  budgets,
  onDrillDown,
}: {
  budgets?: BudgetMeterProps[];
  onDrillDown?: (meter: BudgetMeterProps) => void;
}) {
  const baseBudgets = useMemo<BudgetMeterProps[]>(
    () =>
      budgets ?? [
        {
          label: 'Treasury reserve',
          allocated: 120000,
          spent: 86000,
          currency: 'USDC',
        },
        { label: 'Operations', allocated: 78000, spent: 45200, currency: 'USDC' },
        { label: 'Growth programs', allocated: 95000, spent: 93000, currency: 'USDC' },
      ],
    [budgets],
  );

  const [values, setValues] = useState<number[]>(
    baseBudgets.map((budget) =>
      budget.allocated > 0 ? (budget.spent / budget.allocated) * 100 : 0,
    ),
  );

  useEffect(() => {
    const nextValues = baseBudgets.map((budget) =>
      budget.allocated > 0 ? (budget.spent / budget.allocated) * 100 : 0,
    );
    setValues(nextValues);
  }, [baseBudgets]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {baseBudgets.map((budget, index) => (
        <Gauge
          key={`${budget.label}-${index}`}
          label={budget.label}
          allocated={budget.allocated}
          spent={budget.spent}
          currency={budget.currency ?? 'USDC'}
          percent={values[index] ?? 0}
          history={budget.history}
          onDrillDown={onDrillDown}
        />
      ))}
    </div>
  );
}

export function BudgetMeterCard({ budgets }: { budgets?: BudgetMeterProps[] }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-foreground-muted">
              Budget consumption
            </p>
            <h3 className="mt-1 font-display text-xl font-semibold">
              Live envelope usage
            </h3>
          </div>
          <Badge variant="outline" size="sm">
            Real-time
          </Badge>
        </div>
        <BudgetMeters budgets={budgets} />
      </CardContent>
    </Card>
  );
}

export default BudgetMeterCard;
