'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  chartMarginsFor,
  chartTickFontSize,
  chartYAxisWidth,
  isCompactChartWidth,
  responsiveContainerProps,
  shortenAxisLabel,
} from '@/components/charts/responsive';
import { useChartWidth } from '@/components/charts/use-chart-width';
import { formatCurrency } from '@/lib/format';
import type { DepartmentBudget } from './types';

interface DepartmentBudgetChartProps {
  data: DepartmentBudget[];
}

interface DepartmentChartRow {
  id: string;
  department: string;
  limit: number;
  spent: number;
  asset: DepartmentBudget['asset'];
  utilization: number;
}

function utilizationColor(value: number): string {
  if (value >= 100) return 'rgb(var(--danger))';
  if (value >= 80) return 'rgb(var(--warning))';
  return 'rgb(var(--chart-1))';
}

export function DepartmentBudgetChart({ data }: DepartmentBudgetChartProps) {
  const { ref: chartRef, width: chartWidth } = useChartWidth<HTMLDivElement>();
  const compact = isCompactChartWidth(chartWidth);
  const rows: DepartmentChartRow[] = data
    .filter((department) => department.totalLimit > 0)
    .map((department) => ({
      id: department.id,
      department: department.departmentName,
      limit: department.totalLimit,
      spent: department.totalSpent,
      asset: department.asset,
      utilization: (department.totalSpent / department.totalLimit) * 100,
    }));
  const maxUtilization = rows.reduce(
    (maximum, row) => Math.max(maximum, row.utilization),
    100,
  );
  const axisMaximum = Math.ceil(maxUtilization / 20) * 20;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-surface-secondary/40">
        <CardTitle className="text-base font-semibold">Department budget consumption</CardTitle>
        <CardDescription>
          Current spend as a share of each department&apos;s allocated limit.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        {data.length === 0 || rows.length === 0 ? (
          <div
            className="grid min-h-64 place-items-center rounded-md border border-dashed border-border bg-surface-secondary/30 px-6 text-center text-sm text-foreground-secondary"
            role="status"
          >
            {data.length === 0
              ? 'No department budget data is available yet.'
              : 'No department allocations are configured yet.'}
          </div>
        ) : (
          <div
            ref={chartRef}
            className="h-64 w-full min-w-0 sm:h-72"
            role="img"
            aria-label="Department budget consumption chart showing percentage of each allocated limit spent"
          >
            <ResponsiveContainer {...responsiveContainerProps()}>
              <BarChart
                data={rows}
                layout="vertical"
                margin={chartMarginsFor(chartWidth, {
                  top: 8,
                  right: 24,
                  bottom: 8,
                  left: 8,
                })}
              >
                <CartesianGrid
                  stroke="rgb(var(--chart-grid))"
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  domain={[0, axisMaximum]}
                  tickFormatter={(value: number) => `${value}%`}
                  stroke="rgb(var(--chart-axis))"
                  tick={{ fill: 'rgb(var(--text-muted))', fontSize: chartTickFontSize(chartWidth) }}
                />
                <YAxis
                  type="category"
                  dataKey="department"
                  width={chartYAxisWidth(chartWidth, 150)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'rgb(var(--text-secondary))', fontSize: chartTickFontSize(chartWidth) }}
                  tickFormatter={(value: string) =>
                    shortenAxisLabel(value, compact ? 10 : 18)
                  }
                />
                <ReferenceLine
                  x={80}
                  stroke="rgb(var(--warning))"
                  strokeDasharray="4 4"
                />
                <Tooltip
                  cursor={{ fill: 'rgb(var(--surface-secondary))', opacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as DepartmentChartRow | undefined;
                    if (!row) return null;
                    return (
                      <div className="space-y-1 rounded-md border border-border bg-surface p-3 text-xs shadow-soft-2">
                        <p className="font-medium text-foreground">{row.department}</p>
                        <p className="text-foreground-secondary">
                          Spent: {formatCurrency(row.spent, row.asset)} of{' '}
                          {formatCurrency(row.limit, row.asset)}
                        </p>
                        <p className="font-medium" style={{ color: utilizationColor(row.utilization) }}>
                          {Math.round(row.utilization)}% utilized
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="utilization"
                  name="Utilization"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                >
                  {rows.map((row) => (
                    <Cell key={row.id} fill={utilizationColor(row.utilization)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {rows.length > 0 && (
          <p className="mt-3 border-t border-border pt-3 text-2xs text-foreground-muted">
            The dashed line marks the 80% review threshold.
          </p>
        )}
      </CardContent>
    </Card>
  );
}