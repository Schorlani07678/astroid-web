'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  chartMarginsFor,
  chartTickFontSize,
  chartYAxisWidth,
  isCompactChartWidth,
  responsiveContainerProps,
} from '@/components/charts/responsive';
import { useChartWidth } from '@/components/charts/use-chart-width';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDateTime } from '@/lib/format';

import type {
  SpendTrendBucket,
  SpendTrendInterval,
  SpendTrendPoint,
} from './analyticsTypes';
import {
  aggregateSpendTrend,
  formatSpendTrendLabel,
  spendTrendDaySpan,
  spendTrendTotal,
} from './spendTrend';

// Colors resolve through tokens.css so light, dark and high-contrast themes
// swap the chart without hard-coded literals.
const SPEND_COLOR = 'rgb(var(--gold))';
const AXIS = 'rgb(var(--chart-axis))';
const GRID = 'rgb(var(--chart-grid))';
const TEXT = 'rgb(var(--text-muted))';

const axisTick = {
  fill: TEXT,
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
};

const INTERVALS: { value: SpendTrendInterval; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export interface SpendTrendChartProps {
  data: SpendTrendPoint[];
  defaultInterval?: SpendTrendInterval;
  asset?: string;
  title?: string;
  description?: string;
  height?: number;
  className?: string;
}

export interface SpendTrendTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  asset: string;
}

/** Custom tooltip showing the exact bucket amount and its timestamp. */
export function SpendTrendTooltip({ active, payload, asset }: SpendTrendTooltipProps) {
  if (!active || !payload?.length) return null;

  const bucket = payload[0]?.payload as SpendTrendBucket | undefined;
  if (!bucket) return null;

  return (
    <div className="glass min-w-[160px] max-w-[220px] rounded-md px-3 py-2 text-xs shadow-soft-2 sm:min-w-[180px]">
      <time
        dateTime={bucket.timestamp}
        className="block text-2xs font-medium text-foreground-secondary"
      >
        {formatDateTime(bucket.timestamp)}
      </time>
      <p className="tabular mt-1 font-display text-sm font-semibold text-foreground">
        {formatCurrency(bucket.amount, asset, { decimals: 2 })}
      </p>
    </div>
  );
}

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

/**
 * Responsive historical spend area chart with weekly/monthly aggregation.
 *
 * The raw observations are aggregated client-side so the same dataset powers
 * both intervals. Hovering a point shows the exact amount and full timestamp
 * through a custom tooltip styled with the dashboard surface tokens.
 */
export function SpendTrendChart({
  data,
  defaultInterval = 'weekly',
  asset = 'USDC',
  title = 'Historical spend trend',
  description = 'Agent spend aggregated by week or month.',
  height = 280,
  className,
}: SpendTrendChartProps) {
  const mounted = useMounted();
  const [interval, setInterval] = useState<SpendTrendInterval>(defaultInterval);
  const gradientId = `spend-trend-${useId().replace(/:/g, '')}`;
  const { ref: chartRef, width: chartWidth } = useChartWidth<HTMLDivElement>();
  const compact = isCompactChartWidth(chartWidth);

  const buckets = useMemo(() => aggregateSpendTrend(data, interval), [data, interval]);

  if (!mounted) {
    return (
      <div
        className={cn('skeleton w-full rounded-card', className)}
        style={{ height: height + 116 }}
      />
    );
  }

  const total = spendTrendTotal(data);
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const summary =
    first && last
      ? `${interval === 'weekly' ? 'Weekly' : 'Monthly'} spend trend from ${formatSpendTrendLabel(
          first.timestamp,
          interval,
        )} to ${formatSpendTrendLabel(last.timestamp, interval)}. Total ${formatCurrency(
          total,
          asset,
        )} across ${spendTrendDaySpan(data)} days.`
      : `No spend trend data available for ${asset}.`;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div className="gap-1.5 flex flex-col">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div
          role="group"
          aria-label="Spend trend interval"
          className="flex items-center gap-1 rounded-sm border border-border bg-surface-secondary p-1"
        >
          {INTERVALS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={interval === option.value}
              onClick={() => setInterval(option.value)}
              className={cn(
                'rounded-xs px-2 py-1 text-2xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                interval === option.value
                  ? 'bg-surface text-foreground shadow-soft-1'
                  : 'text-foreground-secondary hover:bg-surface-secondary hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {buckets.length === 0 ? (
          <p
            role="status"
            className="flex items-center justify-center rounded-md border border-dashed border-border py-8 text-xs text-foreground-secondary"
            style={{ minHeight: height }}
          >
            No spend data for this period.
          </p>
        ) : (
          <figure>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-2xs text-foreground-secondary">
              <span className="gap-1.5 inline-flex items-center">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: SPEND_COLOR }}
                  aria-hidden
                />
                Spend
              </span>
              <span className="tabular text-foreground">
                Total {formatCurrency(total, asset, { compact: true })}
              </span>
            </div>
            <div ref={chartRef} className="w-full min-w-0" style={{ height }}>
              <ResponsiveContainer {...responsiveContainerProps()}>
                <AreaChart data={buckets} margin={chartMarginsFor(chartWidth, { top: 8, right: 8, left: 0, bottom: 0 })}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SPEND_COLOR} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={SPEND_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(value: string) =>
                    formatSpendTrendLabel(value, interval)
                  }
                  tick={{ ...axisTick, fontSize: chartTickFontSize(chartWidth) }}
                  axisLine={{ stroke: AXIS }}
                  tickLine={false}
                  minTickGap={compact ? 16 : 28}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ ...axisTick, fontSize: chartTickFontSize(chartWidth) }}
                  axisLine={false}
                  tickLine={false}
                  width={chartYAxisWidth(chartWidth, 56)}
                  tickFormatter={(value: number) =>
                    formatCurrency(value, asset, { compact: true })
                  }
                />
                <RechartsTooltip
                  cursor={{ stroke: GRID, strokeWidth: 1 }}
                  content={(props) => (
                    <SpendTrendTooltip
                      active={props.active}
                      payload={props.payload}
                      asset={asset}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  name="Spend"
                  stroke={SPEND_COLOR}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">{summary}</figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  );
}

export default SpendTrendChart;
