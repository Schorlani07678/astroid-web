'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartTooltipShell, type TooltipPayloadItem } from '@/components/charts';
import {
  chartLegendMetrics,
  chartMarginsFor,
  chartTickFontSize,
  chartYAxisWidth,
  isCompactChartWidth,
  responsiveContainerProps,
} from '@/components/charts/responsive';
import { useChartWidth } from '@/components/charts/use-chart-width';
import { utilizationPercent } from '@/components/charts/theme';
import { formatCurrency, formatPercent } from '@/lib/format';
import { buildConsumptionHistory } from './components/BudgetAllocationDashboard';
import { MOCK_DEPARTMENT_BUDGETS } from './mock-data';
import type { DepartmentBudget } from './types';

export interface DepartmentBudgetConsumptionChartProps {
  /** Department pools to chart; defaults to the built-in mock dataset. */
  departments?: DepartmentBudget[];
  /** Department selected on first render. */
  defaultDepartmentId?: string;
  /** Renders chart skeletons while data is in flight. */
  isLoading?: boolean;
  title?: string;
  description?: string;
  className?: string;
}

/** A single point in the department consumption series. */
export interface BudgetConsumptionPoint {
  label: string;
  index: number;
  /** Cumulative department spend up to and including this day. */
  spent: number;
  /** Daily burn that produced it. */
  daily: number;
  /** Flat allocation threshold the spend is measured against. */
  limit: number;
  utilization: number;
}

/** Adds the allocation threshold and running utilization to a history point. */
export function toBudgetConsumptionPoint(
  point: { label: string; index: number; spent: number; daily: number },
  limit: number,
): BudgetConsumptionPoint {
  return {
    ...point,
    limit,
    utilization: utilizationPercent(point.spent, limit),
  };
}

function ConsumptionTooltip({
  active,
  payload,
  asset,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  asset: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as BudgetConsumptionPoint | undefined;
  if (!row) return null;

  const utilization = Number.isFinite(row.utilization)
    ? formatPercent(row.utilization, 0)
    : '∞';

  return (
    <ChartTooltipShell label={row.label}>
      <span className="flex items-center justify-between gap-4">
        <span className="text-foreground-secondary">Cumulative spend</span>
        <span className="tabular font-medium text-foreground">
          {formatCurrency(row.spent, asset, { compact: true })}
        </span>
      </span>
      <span className="flex items-center justify-between gap-4">
        <span className="text-foreground-secondary">Daily burn</span>
        <span className="tabular font-medium text-foreground">
          {formatCurrency(row.daily, asset, { compact: true })}
        </span>
      </span>
      <span className="flex items-center justify-between gap-4 border-t border-border/40 pt-1">
        <span className="text-foreground-secondary">Allocated limit</span>
        <span className="tabular font-medium text-foreground">
          {formatCurrency(row.limit, asset, { compact: true })}
        </span>
      </span>
      <span className="flex items-center justify-between gap-4">
        <span className="text-foreground-secondary">Utilization</span>
        <span className="tabular font-medium text-foreground">{utilization}</span>
      </span>
    </ChartTooltipShell>
  );
}

/**
 * Department-level spend over time versus its allocated threshold.
 *
 * Uses a Recharts `LineChart` in a `ResponsiveContainer` so it scales from
 * mobile to desktop, colors exclusively through the design tokens in
 * `src/styles/tokens.css`, and degrades to skeleton/empty states instead of
 * rendering a blank axis frame.
 */
export function DepartmentBudgetConsumptionChart({
  departments = MOCK_DEPARTMENT_BUDGETS,
  defaultDepartmentId,
  isLoading = false,
  title = 'Department spend over time',
  description = 'Cumulative consumption against the allocated threshold for the selected department.',
  className = '',
}: DepartmentBudgetConsumptionChartProps) {
  const [selectedId, setSelectedId] = useState(
    () => defaultDepartmentId ?? departments[0]?.id ?? '',
  );
  // The series is date-derived, so paint it after hydration to avoid a
  // server/client timestamp mismatch inside the chart labels.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Axis, legend and margin metrics follow the measured plot width so labels
  // never overlap or clip on mobile.
  const { ref: chartRef, width: chartWidth } = useChartWidth<HTMLDivElement>();
  const compact = isCompactChartWidth(chartWidth);
  const legend = chartLegendMetrics(chartWidth);

  const department = useMemo(
    () => departments.find((item) => item.id === selectedId) ?? departments[0],
    [departments, selectedId],
  );

  const series = useMemo<BudgetConsumptionPoint[]>(() => {
    if (!department) return [];
    return buildConsumptionHistory(department).map((point) =>
      toBudgetConsumptionPoint(point, department.totalLimit),
    );
  }, [department]);

  const asset = department?.asset ?? 'USDC';
  const lastPoint = series[series.length - 1];
  const isBusy = isLoading || !mounted;
  const isEmpty = !isBusy && departments.length === 0;
  const hasNoActivity =
    !isBusy &&
    Boolean(department) &&
    department!.totalLimit <= 0 &&
    department!.totalSpent <= 0;

  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="border-b border-border bg-surface-primary/60 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5 text-gold" aria-hidden />
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </div>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>

          {!isBusy && departments.length > 1 && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <label
                htmlFor="budget-consumption-department"
                className="shrink-0 text-2xs font-medium text-foreground-secondary"
              >
                Department
              </label>
              <select
                id="budget-consumption-department"
                value={department?.id ?? ''}
                onChange={(event) => setSelectedId(event.target.value)}
                className="w-full min-w-0 rounded-button border border-border bg-surface py-1.5 px-3 text-xs font-medium text-foreground focus:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
              >
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.departmentName} ({item.departmentCode})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-6" aria-busy={isBusy || undefined}>
        {isBusy ? (
          <div
            className="space-y-3 py-4"
            role="status"
            aria-label="Loading department consumption chart"
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-64 w-full" rounded="md" />
          </div>
        ) : isEmpty ? (
          <EmptyState
            compact
            title="No department budgets"
            description="Once departments have allocations, their spend trend against the threshold will appear here."
          />
        ) : hasNoActivity ? (
          <EmptyState
            compact
            title="No spend recorded"
            description={`${department!.departmentName} has no consumption in the current period. The threshold line will appear once transactions settle.`}
          />
        ) : (
          <div className="space-y-4">
            {lastPoint && (
              <p className="sr-only">
                {department!.departmentName} has spent{' '}
                {formatCurrency(lastPoint.spent, asset)} of its{' '}
                {formatCurrency(department!.totalLimit, asset)} allocation
                {Number.isFinite(lastPoint.utilization)
                  ? `, ${formatPercent(lastPoint.utilization, 0)} utilized`
                  : ''}
                .
              </p>
            )}

            <div
              ref={chartRef}
              className="h-64 w-full min-w-0 sm:h-72"
              role="img"
              aria-label={`${department!.departmentName} cumulative spend versus allocated threshold`}
            >
              <ResponsiveContainer {...responsiveContainerProps()}>
                <LineChart data={series} margin={chartMarginsFor(chartWidth)}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgb(var(--chart-grid))"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'rgb(var(--text-muted))', fontSize: chartTickFontSize(chartWidth) }}
                    axisLine={{ stroke: 'rgb(var(--chart-axis))' }}
                    tickLine={false}
                    minTickGap={compact ? 12 : 24}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: 'rgb(var(--text-muted))', fontSize: chartTickFontSize(chartWidth) }}
                    axisLine={false}
                    tickLine={false}
                    width={chartYAxisWidth(chartWidth, 56)}
                    tickFormatter={(value: number) =>
                      formatCurrency(value, asset, { compact: true })
                    }
                  />
                  <RechartsTooltip
                    cursor={{ stroke: 'rgb(var(--chart-grid))', strokeWidth: 1 }}
                    content={<ConsumptionTooltip asset={asset} />}
                  />
                  <Legend
                    iconSize={legend.iconSize}
                    wrapperStyle={{
                      fontSize: `${legend.fontSize}px`,
                      paddingTop: `${legend.paddingTop}px`,
                    }}
                    formatter={(value) => (
                      <span className="font-medium text-foreground-secondary">
                        {value}
                      </span>
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="spent"
                    name="Cumulative spend"
                    stroke="rgb(var(--gold))"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="limit"
                    name="Allocated limit"
                    stroke="rgb(var(--danger))"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <p className="text-2xs text-foreground-muted">
              The dashed line is the department allocation threshold; the solid line
              tracks cumulative settled spend over the period.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DepartmentBudgetConsumptionChart;
