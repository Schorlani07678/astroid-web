'use client';

import React, { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ExpandedState,
} from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronRight,
  BarChart3,
  Bot,
  Filter,
  ArrowUpDown,
  Building2,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';
import { ChartFrame } from '@/components/charts/chart-frame';
import { AXIS_TICK, CHART_COLORS, chartToken, ChartTooltipShell } from '@/components/charts/theme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/dashboard/risk-badge';
import { formatCurrency, formatRelativeTime } from '@/lib/format';
import { MOCK_DEPARTMENT_BUDGETS } from './mock-data';
import {
  EMPTY_BUDGET_LEDGER_FILTERS,
  applyBudgetLedgerFilters,
  isBudgetLedgerFilterActive,
  type BudgetLedgerFilterState,
} from './budgetLedgerFiltering';
import { exportBudgetLedgerCsv } from './budgetLedgerCsv';
import { BudgetLedgerFilters, type BudgetAgentOption } from './BudgetLedgerFilters';
import type { DepartmentBudget, AgentAllocation } from './types';
/** One categorical chart token per asset, so the colors follow the active theme. */
const ASSET_COLORS: Record<string, string> = {
  USDC: chartToken('chart-1'),
  XLM: chartToken('chart-4'),
  ASTRO: chartToken('chart-7'),
  EURC: chartToken('chart-6'),
};
const DEFAULT_ASSET_COLOR = chartToken('chart-4');

export function BudgetMatrix() {
  const [data] = useState<DepartmentBudget[]>(MOCK_DEPARTMENT_BUDGETS);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'spendPercent', desc: true },
  ]);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [activeChartMode, setActiveChartMode] = useState<'bar' | 'distribution'>('bar');
  const [ledgerFilters, setLedgerFilters] = useState<BudgetLedgerFilterState>(EMPTY_BUDGET_LEDGER_FILTERS);

  // Filter department list
  const filteredData = useMemo(() => {
    if (departmentFilter === 'all') return data;
    return data.filter((d) => d.departmentCode === departmentFilter);
  }, [data, departmentFilter]);

  // Advanced agent-level filters (date range / agent id / budget status)
  const tableData = useMemo(
    () => applyBudgetLedgerFilters(filteredData, ledgerFilters),
    [filteredData, ledgerFilters],
  );

  const agentOptions = useMemo<BudgetAgentOption[]>(() => {
    const seen = new Map<string, BudgetAgentOption>();
    for (const dept of data) {
      for (const agent of dept.agents) {
        if (!seen.has(agent.agentId)) {
          seen.set(agent.agentId, { agentId: agent.agentId, agentName: agent.agentName });
        }
      }
    }
    return [...seen.values()];
  }, [data]);

  const ledgerEntryCount = (departments: DepartmentBudget[]) =>
    departments.reduce(
      (sum, dept) =>
        sum + dept.agents.reduce((acc, agent) => acc + Math.max(agent.ledger?.length ?? 0, 1), 0),
      0,
    );

  const hasLedgerFilters = isBudgetLedgerFilterActive(ledgerFilters);

  const handleLedgerFilterChange = (patch: Partial<BudgetLedgerFilterState>) =>
    setLedgerFilters((current) => ({ ...current, ...patch }));

  // Chart data
  const chartData = useMemo(() => {
    return filteredData.map((dept) => {
      const spendPercent = dept.totalLimit > 0 ? (dept.totalSpent / dept.totalLimit) * 100 : 0;
      return {
        name: dept.departmentCode,
        fullName: dept.departmentName,
        limit: dept.totalLimit,
        spent: dept.totalSpent,
        remaining: dept.totalRemaining,
        spendPercent: Math.round(spendPercent),
        asset: dept.asset,
      };
    });
  }, [filteredData]);

  // Table columns definition
  const columns = useMemo<ColumnDef<DepartmentBudget>[]>(
    () => [
      {
        id: 'expander',
        header: () => null,
        cell: ({ row }) => {
          return row.getCanExpand() ? (
            <button
              type="button"
              onClick={row.getToggleExpandedHandler()}
              className="grid h-6 w-6 place-items-center rounded-xs hover:bg-surface-secondary text-foreground-secondary transition-colors"
              aria-label={row.getIsExpanded() ? 'Collapse agents' : 'Expand agents'}
            >
              {row.getIsExpanded() ? (
                <ChevronDown className="h-4 w-4 text-gold" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : null;
        },
      },
      {
        accessorKey: 'departmentName',
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1.5 font-semibold text-foreground hover:text-gold transition-colors"
          >
            <span>Department</span>
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-foreground-muted" />
              <span className="font-semibold text-foreground">
                {row.original.departmentName}
              </span>
              <Badge variant="outline" size="sm">
                {row.original.departmentCode}
              </Badge>
            </div>
            <p className="text-2xs text-foreground-muted pl-6">
              Manager: {row.original.managerName} • {row.original.agents.length} Agent allocations
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'asset',
        header: 'Asset',
        cell: ({ row }) => (
          <Badge variant="neutral" size="sm" className="font-mono font-bold">
            {row.original.asset}
          </Badge>
        ),
      },
      {
        accessorKey: 'totalLimit',
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center justify-end gap-1.5 font-semibold text-foreground hover:text-gold transition-colors w-full text-right"
          >
            <span>Limit</span>
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-foreground tabular">
            {formatCurrency(row.original.totalLimit, row.original.asset, { compact: true })}
          </div>
        ),
      },
      {
        accessorKey: 'totalSpent',
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center justify-end gap-1.5 font-semibold text-foreground hover:text-gold transition-colors w-full text-right"
          >
            <span>Spent</span>
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-foreground tabular">
            {formatCurrency(row.original.totalSpent, row.original.asset, { compact: true })}
          </div>
        ),
      },
      {
        id: 'spendPercent',
        accessorFn: (row) =>
          row.totalLimit > 0 ? (row.totalSpent / row.totalLimit) * 100 : 0,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center justify-end gap-1.5 font-semibold text-foreground hover:text-gold transition-colors w-full text-right"
          >
            <span>Utilization</span>
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => {
          const percent = Math.round(
            row.original.totalLimit > 0
              ? (row.original.totalSpent / row.original.totalLimit) * 100
              : 0
          );
          return (
            <div className="space-y-1 w-32 ml-auto">
              <div className="flex justify-between text-2xs font-semibold tabular">
                <span className={percent > 85 ? 'text-red-500 font-bold' : 'text-foreground'}>
                  {percent}%
                </span>
                <span className="text-foreground-muted">
                  Rem: {formatCurrency(row.original.totalRemaining, row.original.asset, { compact: true })}
                </span>
              </div>
              <ProgressBar value={percent} />
            </div>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      expanded,
      sorting,
    },
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    getSubRows: (row) => row.agents as unknown as DepartmentBudget[],
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* Controls & Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-foreground-muted" />
          <span className="text-xs font-semibold text-foreground">Department Filter:</span>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-button border border-border bg-surface px-3 py-1.5 text-xs text-foreground font-medium focus:border-gold focus:outline-none"
          >
            <option value="all">All Departments ({data.length})</option>
            {data.map((dept) => (
              <option key={dept.id} value={dept.departmentCode}>
                {dept.departmentName} ({dept.departmentCode})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 rounded-button border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setActiveChartMode('bar')}
            className={`flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
              activeChartMode === 'bar'
                ? 'bg-gold text-surface-dark font-bold shadow-xs'
                : 'text-foreground-secondary hover:text-foreground'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Spend Velocity</span>
          </button>
        </div>
      </div>

      {/* Spend Analytics Visualization */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 text-gold" />
            <span>Department Multi-Currency Spend & Utilization</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-64 w-full">
            <ChartFrame
              label="Spend utilization by department"
              height="100%"
              empty={chartData.length === 0}
              emptyTitle="No department spend yet"
              emptyDescription="Utilization per department appears here once budgets are in use."
            >
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <XAxis dataKey="name" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} unit="%" domain={[0, 100]} />
                <RechartsTooltip
                  cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.3 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as typeof chartData[0] | undefined;
                    if (!d) return null;
                    return (
                      <ChartTooltipShell label={label ? String(label) : d.fullName}>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-foreground-secondary">Utilization:</span>
                          <span className="tabular font-bold text-gold">{d.spendPercent}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-foreground-secondary">Spent:</span>
                          <span className="tabular font-medium text-foreground">
                            {formatCurrency(d.spent, d.asset)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-foreground-secondary">Limit:</span>
                          <span className="tabular font-medium text-foreground">
                            {formatCurrency(d.limit, d.asset)}
                          </span>
                        </div>
                      </ChartTooltipShell>
                    );
                  }}
                />
                <Bar dataKey="spendPercent" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={ASSET_COLORS[entry.asset] || DEFAULT_ASSET_COLOR}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          </div>
        </CardContent>
      </Card>

      {/* Advanced ledger filters + CSV export, directly above the budget table */}
      <BudgetLedgerFilters
        filters={ledgerFilters}
        agentOptions={agentOptions}
        hasActiveFilters={hasLedgerFilters}
        totalEntryCount={ledgerEntryCount(filteredData)}
        filteredEntryCount={ledgerEntryCount(tableData)}
        onChange={handleLedgerFilterChange}
        onClear={() => setLedgerFilters(EMPTY_BUDGET_LEDGER_FILTERS)}
        onExportCSV={() => exportBudgetLedgerCsv(tableData)}
      />

      {/* TanStack Department Table with Expandable Agent Rows */}
      <Card className="overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-surface-secondary border-b border-border text-foreground-muted uppercase tracking-wider font-semibold">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {table.getRowModel().rows.map((row) => {
                const dept = row.original;
                const isExpanded = row.getIsExpanded();

                return (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-surface-secondary/50 transition-colors">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3.5 align-middle">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>

                    {/* Sub-rows for Individual Agent Allocations */}
                    {isExpanded && dept.agents && dept.agents.length > 0 && (
                      <tr className="bg-surface-secondary/30">
                        <td colSpan={columns.length} className="px-6 py-4 border-t border-b border-border/50">
                          <div className="space-y-3 pl-6">
                            <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-foreground-muted">
                              <Bot className="h-3.5 w-3.5 text-gold" />
                              <span>Individual Agent Allocations & Spend Velocity</span>
                            </div>

                            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                              {dept.agents.map((agent: AgentAllocation) => {
                                const agentUtil =
                                  agent.allocatedAmount > 0
                                    ? Math.round((agent.spentAmount / agent.allocatedAmount) * 100)
                                    : 0;

                                return (
                                  <div
                                    key={agent.id}
                                    className="rounded-card border border-border bg-surface p-3.5 space-y-2 shadow-2xs hover:border-gold/50 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="space-y-0.5">
                                        <p className="font-semibold text-foreground text-xs">{agent.agentName}</p>
                                        <p className="text-2xs text-foreground-muted">{agent.role}</p>
                                      </div>
                                      <Badge variant="outline" size="sm" className="font-mono">
                                        {agent.agentId}
                                      </Badge>
                                    </div>

                                    <div className="space-y-1">
                                      <div className="flex justify-between text-2xs tabular">
                                        <span className="text-foreground-secondary">
                                          Spent: {formatCurrency(agent.spentAmount, agent.asset, { compact: true })}
                                        </span>
                                        <span className="font-bold text-foreground">{agentUtil}%</span>
                                      </div>
                                      <ProgressBar value={agentUtil} />
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-border/50 text-2xs text-foreground-muted">
                                      <span>Velocity 24h: {formatCurrency(agent.velocity24h, agent.asset, { compact: true })}</span>
                                      <span>Active {formatRelativeTime(agent.lastTransactionAt)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
