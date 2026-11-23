'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ReceiptText } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { CATEGORICAL, ChartTooltipShell } from '@/components/charts';
import {
  chartLegendMetrics,
  chartMarginsFor,
  chartTickFontSize,
  chartYAxisWidth,
  isCompactChartWidth,
  responsiveContainerProps,
} from '@/components/charts/responsive';
import { useChartWidth } from '@/components/charts/use-chart-width';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ExpenseSeriesPoint } from './utils/expenseBreakdown';

/**
 * Historical expense breakdown time series (#247).
 *
 * A Recharts bar-per-bucket + cumulative-line composition rendered through
 * `ResponsiveContainer` so it respects its grid column on small viewports,
 * client-gated behind a mount flag to avoid Next.js SSR hydration
 * mismatches, and colored strictly from the `src/styles/tokens.css` chart
 * palette via `CATEGORICAL`.
 */

const AXIS = 'rgb(var(--chart-axis))';
const GRID = 'rgb(var(--chart-grid))';
const TEXT = 'rgb(var(--text-muted))';

interface SeriesTooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string | number; value?: number | string; payload?: ExpenseSeriesPoint }>;
  asset: string;
}

function SeriesTooltip({ active, payload, asset }: SeriesTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <ChartTooltipShell label={point.bucketLabel}>
      <div className="flex items-center justify-between gap-4">
        <span className="text-foreground-secondary">Spend</span>
        <span className="tabular font-medium text-foreground">
          {formatCurrency(point.spent, asset)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-foreground-secondary">Cumulative</span>
        <span className="tabular font-medium text-foreground">
          {formatCurrency(point.cumulative, asset)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-foreground-secondary">Expenses</span>
        <span className="tabular font-medium text-foreground">{point.entries}</span>
      </div>
    </ChartTooltipShell>
  );
}

export interface ExpenseBreakdownChartProps {
  /** Ordered buckets from `buildExpenseSeries`. Empty array renders the zero state. */
  series: ExpenseSeriesPoint[];
  asset: string;
  /** Department / budget the series belongs to (used for the accessible label). */
  subjectName: string;
  title?: string;
  description?: string;
  className?: string;
  /** Compact mode drops the card chrome and renders only the plot + legend. */
  bare?: boolean;
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

export function ExpenseBreakdownChart({
  series,
  asset,
  subjectName,
  title = 'Expense breakdown over time',
  description = 'Bucketed agent spend against this envelope, newest on the right.',
  className,
  bare = false,
}: ExpenseBreakdownChartProps) {
  const mounted = useMounted();
  const { ref: chartRef, width: chartWidth } = useChartWidth<HTMLDivElement>();
  const compact = isCompactChartWidth(chartWidth);
  const legend = chartLegendMetrics(chartWidth);

  const hasData = useMemo(() => series.some((point) => point.spent > 0), [series]);

  const chart = (
    <div
      ref={chartRef}
      className="h-72 w-full min-w-0"
      role="img"
      aria-label={`Expense breakdown for ${subjectName}`}
    >
      {!mounted ? (
        <div className="skeleton h-full w-full rounded-md" />
      ) : (
        <ResponsiveContainer {...responsiveContainerProps()}>
          <ComposedChart data={series} margin={chartMarginsFor(chartWidth)}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="bucketLabel"
              tickLine={false}
              axisLine={{ stroke: AXIS }}
              tick={{ fill: TEXT, fontSize: chartTickFontSize(chartWidth) }}
              // Thin ticks on narrow datasets so long labels never clip.
              interval="preserveStartEnd"
              minTickGap={compact ? 12 : 24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={chartYAxisWidth(chartWidth, 64)}
              tick={{ fill: TEXT, fontSize: chartTickFontSize(chartWidth) }}
              tickFormatter={(value: number) => formatCurrency(value, asset, { compact: true })}
            />
            <RechartsTooltip content={<SeriesTooltip asset={asset} />} />
            <Legend
              iconSize={legend.iconSize}
              wrapperStyle={{
                fontSize: legend.fontSize,
                paddingTop: legend.paddingTop,
              }}
            />
            <Bar
              dataKey="spent"
              name="Spend"
              fill={CATEGORICAL[0] ?? 'rgb(var(--chart-1))'}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
            <Line
              dataKey="cumulative"
              name="Cumulative"
              type="monotone"
              stroke={CATEGORICAL[2] ?? 'rgb(var(--chart-3))'}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  if (bare) {
    return <div className={cn('w-full', className)}>{hasData ? chart : <ZeroState subjectName={subjectName} />}</div>;
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="border-b border-border bg-surface-secondary/40 pb-4">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-gold" aria-hidden />
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
        <CardDescription className="truncate">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {hasData ? chart : <ZeroState subjectName={subjectName} />}
      </CardContent>
    </Card>
  );
}

function ZeroState({ subjectName }: { subjectName: string }) {
  return (
    <EmptyState
      compact
      title="No recorded spend"
      description={`No expense events have been recorded for ${subjectName || 'this department'} in the current window.`}
    />
  );
}

export default ExpenseBreakdownChart;
