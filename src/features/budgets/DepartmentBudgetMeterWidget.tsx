'use client';

import React, { useId, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { ChartTooltipShell } from '@/components/charts';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPercent } from '@/lib/format';
import {
  aggregateDepartmentBudgets,
  type BudgetThresholdStatus,
} from './departmentBudgetMeter';
import { MOCK_DEPARTMENT_BUDGETS } from './mock-data';
import type { DepartmentBudget } from './types';

export interface DepartmentBudgetMeterWidgetProps {
  /** Department budgets to aggregate and visualize. Defaults to built-in mock dataset. */
  departments?: DepartmentBudget[];
  title?: string;
  description?: string;
  className?: string;
}

type FilterThreshold = 'all' | 'normal' | 'warning' | 'critical';
type SortField = 'utilization' | 'spent' | 'allocated';

interface ChartDataItem {
  name: string;
  code: string;
  spent: number;
  allocated: number;
  remaining: number;
  utilization: number;
  status: BudgetThresholdStatus;
  currency: string;
}

const THRESHOLD_COLORS: Record<BudgetThresholdStatus, string> = {
  normal: 'rgb(var(--success))',
  warning: 'rgb(var(--warning))',
  critical: 'rgb(var(--danger))',
};

const THRESHOLD_BG: Record<BudgetThresholdStatus, string> = {
  normal: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  critical: 'bg-danger-soft text-danger border-danger/30',
};

export function DepartmentBudgetMeterWidget({
  departments = MOCK_DEPARTMENT_BUDGETS,
  title = 'Department Budget Meters',
  description = 'Real-time department spending progress against allocated budgets and threshold warnings.',
  className,
}: DepartmentBudgetMeterWidgetProps) {
  const widgetId = useId();
  const [filter, setFilter] = useState<FilterThreshold>('all');
  const [sortBy, setSortBy] = useState<SortField>('utilization');
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);

  const aggregation = useMemo(
    () => aggregateDepartmentBudgets(departments),
    [departments],
  );

  const filteredDepartments = useMemo(() => {
    let list = aggregation.departments;
    if (filter !== 'all') {
      list = list.filter((dept) => dept.status === filter);
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'utilization') return b.utilization - a.utilization;
      if (sortBy === 'spent') return b.spent - a.spent;
      return b.allocated - a.allocated;
    });
  }, [aggregation.departments, filter, sortBy]);

  const chartData = useMemo<ChartDataItem[]>(() => {
    return filteredDepartments.map((dept) => ({
      name: dept.name,
      code: dept.code,
      spent: dept.spent,
      allocated: dept.allocated,
      remaining: dept.remaining,
      utilization: dept.utilization,
      status: dept.status,
      currency: dept.currency,
    }));
  }, [filteredDepartments]);

  const toggleExpand = (id: string) => {
    setExpandedDeptId((current) => (current === id ? null : id));
  };

  return (
    <Card
      className={cn('overflow-hidden', className)}
      role="region"
      aria-labelledby={`${widgetId}-title`}
    >
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-surface-secondary text-gold">
                <Building2 className="h-4 w-4" aria-hidden />
              </span>
              <CardTitle id={`${widgetId}-title`} className="text-lg font-semibold">
                {title}
              </CardTitle>
            </div>
            <CardDescription className="mt-1 text-xs">{description}</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                aggregation.status === 'critical'
                  ? 'danger'
                  : aggregation.status === 'warning'
                    ? 'warning'
                    : 'success'
              }
              size="sm"
              dot
            >
              Org: {formatPercent(aggregation.orgUtilization, 0)} Utilized
            </Badge>
            <Badge variant="outline" size="sm">
              {aggregation.departments.length} Departments
            </Badge>
          </div>
        </div>

        {/* Aggregate KPI Strip */}
        <div className="grid grid-cols-2 gap-3 border-y border-border py-3 sm:grid-cols-4">
          <div>
            <p className="text-2xs font-medium uppercase text-foreground-muted">
              Total Budget
            </p>
            <p className="mt-0.5 tabular text-sm font-semibold text-foreground">
              {formatCurrency(aggregation.totalAllocated, aggregation.currency, {
                compact: true,
              })}
            </p>
          </div>
          <div>
            <p className="text-2xs font-medium uppercase text-foreground-muted">
              Total Spent
            </p>
            <p className="mt-0.5 tabular text-sm font-semibold text-foreground">
              {formatCurrency(aggregation.totalSpent, aggregation.currency, {
                compact: true,
              })}
            </p>
          </div>
          <div>
            <p className="text-2xs font-medium uppercase text-foreground-muted">
              Remaining
            </p>
            <p className="mt-0.5 tabular text-sm font-semibold text-success">
              {formatCurrency(aggregation.totalRemaining, aggregation.currency, {
                compact: true,
              })}
            </p>
          </div>
          <div>
            <p className="text-2xs font-medium uppercase text-foreground-muted">
              Threshold Warnings
            </p>
            <p className="mt-0.5 tabular text-sm font-semibold text-foreground">
              {aggregation.counts.critical + aggregation.counts.warning} active
            </p>
          </div>
        </div>

        {/* Controls: Filter & Sort */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div
            role="tablist"
            aria-label="Filter departments by threshold status"
            className="gap-1.5 flex flex-wrap items-center"
          >
            {(
              [
                { id: 'all', label: `All (${aggregation.counts.total})` },
                {
                  id: 'normal',
                  label: `Healthy (${aggregation.counts.normal})`,
                },
                {
                  id: 'warning',
                  label: `Watch (${aggregation.counts.warning})`,
                },
                {
                  id: 'critical',
                  label: `Critical (${aggregation.counts.critical})`,
                },
              ] as const
            ).map((tab) => (
              <Button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                variant={filter === tab.id ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-2xs"
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span
              id={`${widgetId}-sort-label`}
              className="text-2xs text-foreground-muted"
            >
              Sort by:
            </span>
            {(
              [
                { id: 'utilization', label: 'Utilization' },
                { id: 'spent', label: 'Spent' },
                { id: 'allocated', label: 'Allocation' },
              ] as const
            ).map((btn) => (
              <Button
                key={btn.id}
                type="button"
                variant={sortBy === btn.id ? 'outline' : 'ghost'}
                size="sm"
                className="h-7 text-2xs"
                aria-pressed={sortBy === btn.id}
                aria-labelledby={`${widgetId}-sort-label`}
                onClick={() => setSortBy(btn.id)}
              >
                {btn.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Recharts Visualization */}
        <div
          className="h-64 w-full"
          role="img"
          aria-label="Department spending vs maximum allocated budget bar chart"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 12, right: 16, bottom: 20, left: 16 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgb(var(--border) / 0.5)"
              />
              <XAxis
                dataKey="code"
                tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }}
                axisLine={{ stroke: 'rgb(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(val: number) =>
                  formatCurrency(val, aggregation.currency, { compact: true })
                }
                tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }}
                axisLine={{ stroke: 'rgb(var(--border))' }}
                tickLine={false}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0]?.payload as ChartDataItem | undefined;
                  if (!item) return null;
                  return (
                    <ChartTooltipShell label={`${item.name} (${item.code})`}>
                      <span className="flex items-center justify-between gap-4">
                        <span className="text-foreground-secondary">Spent:</span>
                        <span className="tabular font-semibold text-foreground">
                          {formatCurrency(item.spent, item.currency)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-4">
                        <span className="text-foreground-secondary">Allocated:</span>
                        <span className="tabular text-foreground">
                          {formatCurrency(item.allocated, item.currency)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-4">
                        <span className="text-foreground-secondary">Remaining:</span>
                        <span className="tabular text-success">
                          {formatCurrency(item.remaining, item.currency)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-4 border-t border-border/40 pt-1">
                        <span className="text-foreground-secondary">Utilization:</span>
                        <span
                          className={cn(
                            'tabular font-semibold',
                            item.status === 'critical'
                              ? 'text-danger'
                              : item.status === 'warning'
                                ? 'text-warning'
                                : 'text-success',
                          )}
                        >
                          {formatPercent(item.utilization, 1)}
                        </span>
                      </span>
                    </ChartTooltipShell>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '8px', fontSize: '11px' }}
              />
              <Bar
                dataKey="allocated"
                name="Budget Limit"
                fill="rgb(var(--surface-secondary))"
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="spent" name="Current Spend" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={THRESHOLD_COLORS[entry.status]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Department Meters List with WCAG AA Progress Indicators */}
        <div
          className="space-y-3"
          role="list"
          aria-label="Department budget meters list"
        >
          {filteredDepartments.map((dept) => {
            const isExpanded = expandedDeptId === dept.id;
            const thresholdStatus = dept.status;
            const utilizationClamped = Math.min(100, Math.max(0, dept.utilization));

            return (
              <div
                key={dept.id}
                role="listitem"
                className="rounded-card border border-border bg-surface-secondary/30 p-4 transition-colors hover:bg-surface-secondary/50"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{dept.name}</span>
                      <Badge variant="outline" size="sm">
                        {dept.code}
                      </Badge>
                      <span
                        className={cn(
                          'py-0.5 inline-flex items-center gap-1 rounded-full border px-2 text-2xs font-medium',
                          THRESHOLD_BG[thresholdStatus],
                        )}
                      >
                        {thresholdStatus === 'critical' ? (
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                        ) : thresholdStatus === 'warning' ? (
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" aria-hidden />
                        )}
                        {dept.statusLabel}
                      </span>
                    </div>

                    <p className="text-2xs text-foreground-muted">
                      Manager: {dept.managerName} · {dept.agentCount} active agents ·{' '}
                      {dept.period} period
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-xs text-foreground-muted">
                        <span className="tabular font-medium text-foreground">
                          {formatCurrency(dept.spent, dept.currency, { compact: true })}
                        </span>{' '}
                        /{' '}
                        <span className="tabular">
                          {formatCurrency(dept.allocated, dept.currency, {
                            compact: true,
                          })}
                        </span>
                      </p>
                      <p className="tabular text-2xs text-foreground-secondary">
                        {formatCurrency(dept.remaining, dept.currency, {
                          compact: true,
                        })}{' '}
                        remaining
                      </p>
                    </div>

                    <div className="w-16 text-right">
                      <span
                        className={cn(
                          'tabular font-display text-base font-bold',
                          thresholdStatus === 'critical'
                            ? 'text-danger'
                            : thresholdStatus === 'warning'
                              ? 'text-warning'
                              : 'text-success',
                        )}
                      >
                        {formatPercent(dept.utilization, 0)}
                      </span>
                    </div>

                    {dept.agents.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={isExpanded}
                        aria-label={`Toggle agent breakdown for ${dept.name}`}
                        onClick={() => toggleExpand(dept.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress Bar / Meter */}
                <div className="mt-3">
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-valuenow={Math.round(dept.utilization)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuetext={`${dept.name}: ${dept.utilization.toFixed(1)}% consumed of ${formatCurrency(dept.allocated, dept.currency)}`}
                    aria-label={`${dept.name} budget progress`}
                  >
                    <div
                      className={cn(
                        'h-full transition-all duration-300',
                        thresholdStatus === 'critical'
                          ? 'bg-danger'
                          : thresholdStatus === 'warning'
                            ? 'bg-warning'
                            : 'bg-success',
                      )}
                      style={{ width: `${utilizationClamped}%` }}
                    />
                  </div>
                </div>

                {/* Optional Agent Drill-Down */}
                {isExpanded && dept.agents.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-foreground-muted">
                      Agent Allocations in {dept.name}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {dept.agents.map((agent) => {
                        const agentUtil =
                          agent.allocatedAmount > 0
                            ? (agent.spentAmount / agent.allocatedAmount) * 100
                            : 0;
                        return (
                          <div
                            key={agent.id}
                            className="rounded-sm border border-border bg-surface px-3 py-2 text-2xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground">
                                {agent.agentName}
                              </span>
                              <span className="tabular text-foreground-secondary">
                                {Math.round(agentUtil)}%
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-foreground-muted">
                              <span>{agent.role}</span>
                              <span className="tabular">
                                {formatCurrency(agent.spentAmount, agent.asset, {
                                  compact: true,
                                })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredDepartments.length === 0 && (
            <p className="py-6 text-center text-xs text-foreground-muted">
              No departments match the selected filter.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default DepartmentBudgetMeterWidget;
