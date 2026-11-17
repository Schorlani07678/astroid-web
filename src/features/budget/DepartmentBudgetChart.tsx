'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, CHART_TOKENS } from '@/components/charts/theme';
import type { Budget } from '@/types/domain';
import {
  type DepartmentBudgetBreakdownItem,
  buildDepartmentBudgetBreakdown,
} from './departmentBudgetUtils';

export interface DepartmentBudgetChartProps {
  budgets: readonly Budget[];
  height?: number;
}

interface CustomTooltipPayloadItem {
  payload?: DepartmentBudgetBreakdownItem;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
}

function DepartmentBudgetTooltip({ active, payload }: CustomTooltipProps) {
  const firstEntry = payload?.[0]?.payload;
  if (!active || !firstEntry) {
    return null;
  }

  return (
    <div className="rounded-button border border-border bg-surface p-3 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{firstEntry.department}</p>
      <div className="mt-1.5 space-y-1 tabular text-foreground-secondary">
        <p>
          Allocated:{' '}
          <span className="font-medium text-foreground">
            {firstEntry.allocated.toLocaleString('en-US')} {firstEntry.currency}
          </span>
        </p>
        <p>
          Spent:{' '}
          <span className="font-medium text-foreground">
            {firstEntry.spent.toLocaleString('en-US')} {firstEntry.currency}
          </span>
        </p>
        <p>
          Remaining:{' '}
          <span className="font-medium text-foreground">
            {firstEntry.remaining.toLocaleString('en-US')} {firstEntry.currency}
          </span>
        </p>
        <p>
          Utilization:{' '}
          <span className="font-medium text-gold">{firstEntry.utilizationPercent}%</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Responsive departmental budget allocation vs spend breakdown chart with interactive tooltips.
 */
export function DepartmentBudgetChart({
  budgets,
  height = 280,
}: DepartmentBudgetChartProps) {
  const data = useMemo(() => buildDepartmentBudgetBreakdown(budgets), [budgets]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-card border border-dashed border-border bg-surface/40 p-6 text-xs text-foreground-secondary">
        No department budget allocations available to display.
      </div>
    );
  }

  return (
    <div
      className="w-full min-w-0 rounded-card border border-border bg-surface p-4"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="department"
            stroke={CHART_COLORS.axis}
            fontSize={12}
            tickLine={false}
          />
          <YAxis stroke={CHART_COLORS.axis} fontSize={12} tickLine={false} />
          <Tooltip content={<DepartmentBudgetTooltip />} />
          <Legend />
          <Bar
            dataKey="allocated"
            name="Allocated"
            fill={CHART_TOKENS.info}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="spent"
            name="Spent"
            fill={CHART_TOKENS.gold}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
