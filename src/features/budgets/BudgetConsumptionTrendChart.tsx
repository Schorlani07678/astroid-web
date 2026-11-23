'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartEmptyState,
  ChartSkeleton,
  ChartTooltipShell,
  useMounted,
} from '@/components/charts';
import {
  AXIS_TICK,
  CHART_COLORS,
  chartToken,
} from '@/components/charts/theme';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import type { Policy } from '@/types/domain';

import {
  buildBudgetConsumptionTrend,
  summarizeBudgetConsumptionTrend,
  type BudgetSpendObservation,
} from './budgetConsumptionTrend';

const VELOCITY_COLOR = chartToken('chart-1');

/** Truncate long period labels so narrow viewports keep legible ticks. */
function tickLabel(value: string): string {
  return value.length > 9 ? `${value.slice(0, 8)}…` : value;
}

function TrendTooltip({
  active,
  payload,
  asset,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  asset: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as
    | ReturnType<typeof buildBudgetConsumptionTrend>[number]
    | undefined;
  if (!row) return null;

  return (
    <ChartTooltipShell label={row.label}>
      <span className="flex items-center justify-between gap-4">
        <span className="text-foreground-secondary">Spending velocity</span>
        <span className="tabular font-medium text-foreground">
          {formatCurrency(row.velocity, asset, { compact: true })}
        </span>
      </span>
      <span className="flex items-center justify-between gap-4 border-t border-border/40 pt-1">
        <span className="text-foreground-secondary">Policy limit</span>
        <span className="tabular font-medium text-foreground">
          {row.limit > 0 ? formatCurrency(row.limit, asset, { compact: true }) : 'Not configured'}
        </span>
      </span>
      <span className="flex items-center justify-between gap-4">
        <span className="text-foreground-secondary">Status</span>
        <span className="font-medium text-foreground">
          {row.limit <= 0
            ? 'No limit'
            : row.exceedsLimit
              ? `Over limit (${Math.round(row.percentOfLimit)}%)`
              : `Within limit (${Math.round(row.percentOfLimit)}%)`}
        </span>
      </span>
    </ChartTooltipShell>
  );
}

export interface BudgetConsumptionTrendChartProps {
  /** Per-bucket spend observations. No live API is called by this component. */
  data: BudgetSpendObservation[];
  /** Real spending policy entity whose limit is drawn as the reference line. */
  policy: Policy;
  asset?: string;
  title?: string;
  description?: string;
  height?: number;
  className?: string;
}

/**
 * Department-level spending velocity against the configured policy limit.
 *
 * The solid line is the observed spend per bucket; the dashed reference line
 * is the policy limit. Line style, legend text and the screen-reader table
 * distinguish the two series without relying on color alone. The chart is a
 * controlled component: callers pass observations and a `Policy`, and no page
 * integration or data fetching is performed here.
 */
export function BudgetConsumptionTrendChart({
  data,
  policy,
  asset = 'USDC',
  title = 'Budget consumption trend',
  description = 'Spending velocity against the active spending policy limit.',
  height = 280,
  className,
}: BudgetConsumptionTrendChartProps) {
  const mounted = useMounted();
  const points = useMemo(() => buildBudgetConsumptionTrend(data, policy), [data, policy]);
  const summary = useMemo(() => summarizeBudgetConsumptionTrend(points), [points]);
  const limit = points[0]?.limit ?? 0;

  if (!mounted) {
    return <ChartSkeleton height={height + 116} />;

  }

  if (points.length === 0) {
    return (
      <ChartEmptyState
        height={height}
        title="No budget consumption data"
        description="Spending observations will appear here once the department records transactions."
      />
    );
  }

  return (
    <Card className={cn('w-full overflow-hidden', className)}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <p className="text-2xs text-foreground-secondary">{summary}</p>
      </CardHeader>
      <CardContent>
        <figure className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-foreground-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="w-4 border-t-2"
                style={{ borderColor: VELOCITY_COLOR }}
              />
              Solid — spending velocity
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="w-4 border-t-2 border-dashed"
                style={{ borderColor: CHART_COLORS.danger }}
              />
              Dashed — policy limit
              {limit > 0 ? ` (${formatCurrency(limit, asset, { compact: true })})` : ' (none)'}
            </span>
          </div>

          <div className="h-auto w-full min-w-0" role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid
                  stroke={CHART_COLORS.grid}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tickFormatter={tickLabel}
                  tick={AXIS_TICK}
                  axisLine={{ stroke: CHART_COLORS.axis }}
                  tickLine={false}
                  minTickGap={24}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(value: number) =>
                    formatCurrency(value, asset, { compact: true })
                  }
                />
                <RechartsTooltip
                  cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }}
                  content={(props) => (
                    <TrendTooltip
                      active={props.active}
                      payload={props.payload}
                      asset={asset}
                    />
                  )}
                />
                {limit > 0 && (
                  <ReferenceLine
                    y={limit}
                    stroke={CHART_COLORS.danger}
                    strokeDasharray="6 4"
                    label={{
                      value: 'Policy limit',
                      position: 'insideTopRight',
                      fill: CHART_COLORS.textSecondary,
                      fontSize: 11,
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="velocity"
                  name="Spending velocity"
                  stroke={VELOCITY_COLOR}
                  strokeWidth={2}
                  dot={points.length === 1 ? { r: 4 } : false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <figcaption className="text-2xs text-foreground-muted">
            The dashed line is the spending policy limit; the solid line is the amount
            spent in each period.
          </figcaption>

          <table className="sr-only">
            <caption>{`Spending velocity for ${policy.name} (${asset})`}</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Spending velocity</th>
                <th scope="col">Policy limit</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={`${point.timestamp}-${point.label}`}>
                  <th scope="row">{point.label}</th>
                  <td>{formatCurrency(point.velocity, asset)}</td>
                  <td>
                    {point.limit > 0 ? formatCurrency(point.limit, asset) : 'Not configured'}
                  </td>
                  <td>
                    {point.limit <= 0
                      ? 'No limit configured'
                      : point.exceedsLimit
                        ? `Over limit (${Math.round(point.percentOfLimit)}%)`
                        : `Within limit (${Math.round(point.percentOfLimit)}%)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      </CardContent>
    </Card>
  );
}

export default BudgetConsumptionTrendChart;
