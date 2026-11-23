'use client';

import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Check, X } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
} from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { ProposalApprovalConfirmDialog } from '@/features/approvals/components/ProposalApprovalConfirmDialog';
import { useProposalApproval } from '@/hooks/useProposalApproval';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDateTime, formatRelativeTime } from '@/lib/format';
import { proposalStatus, riskLevel } from '@/lib/status';
import type { Proposal, ProposalStatus } from '@/types/domain';
import type { LocalApprovalDecision } from '@/stores/proposal-approval-store';

/** Risk bucket exposed to operators. `high` deliberately includes `critical`. */
type RiskFilter = 'all' | 'low' | 'medium' | 'high';

const STATUS_ORDER: ProposalStatus[] = [
  'pending',
  'approved',
  'executed',
  'rejected',
  'expired',
];

const MIN_AMOUNT_PRESETS = [0, 5_000, 10_000, 25_000, 50_000];

const riskFilterFn: FilterFn<Proposal> = (row, columnId, value) => {
  const filter = value as RiskFilter;
  if (!filter || filter === 'all') return true;
  const level = riskLevel(row.getValue<number>(columnId)).level;
  if (filter === 'high') return level === 'high' || level === 'critical';
  return level === filter;
};

const amountAtLeastFilterFn: FilterFn<Proposal> = (row, columnId, value) => {
  const minimum = Number(value);
  if (!Number.isFinite(minimum) || minimum <= 0) return true;
  return (row.getValue<number>(columnId) ?? 0) >= minimum;
};

interface ProposalRowActionsProps {
  proposal: Proposal;
}

/** Row actions preserving the existing confirm-dialog approval flow. */
function ProposalRowActions({ proposal }: ProposalRowActionsProps) {
  const { decision } = useProposalApproval(proposal);
  const [confirmAction, setConfirmAction] = useState<LocalApprovalDecision | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openConfirmation = (action: LocalApprovalDecision) => {
    setConfirmAction(action);
    setConfirmOpen(true);
  };

  const closeConfirmation = () => {
    setConfirmOpen(false);
    setConfirmAction(null);
  };

  const isPending = proposal.status === 'pending';

  return (
    <div className="gap-1.5 flex flex-wrap items-center justify-end">
      {decision && (
        <Badge variant={decision === 'approved' ? 'success' : 'danger'} size="sm">
          You {decision}
        </Badge>
      )}
      {isPending && !decision && (
        <>
          <Button
            type="button"
            variant="gold"
            size="sm"
            leftIcon={<Check className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => openConfirmation('approved')}
            aria-label={`Approve ${proposal.title}`}
          >
            Approve
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<X className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => openConfirmation('rejected')}
            aria-label={`Reject ${proposal.title}`}
          >
            Reject
          </Button>
        </>
      )}
      <Link
        href={`/approvals/${proposal.id}`}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        aria-label={`Review ${proposal.title}`}
      >
        Review
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </Link>

      <ProposalApprovalConfirmDialog
        proposal={proposal}
        action={confirmAction}
        open={confirmOpen}
        onClose={closeConfirmation}
      />
    </div>
  );
}

export interface ProposalReviewWorkflowProps {
  proposals: Proposal[];
  className?: string;
}

/**
 * Operator review queue for multi-party proposals.
 *
 * Filters (risk level, agent, minimum amount) and sorting (submission time,
 * transaction value) are driven through TanStack Table's `columnFilters` /
 * `sorting` state machine. Status tabs only swap the status entry of the
 * filter set, so risk/agent/amount selections and the sort order survive tab
 * changes. Every control is a labelled native input or an `aria-sort` header
 * button, so keyboard and screen-reader flows match the visual affordances.
 */
export function ProposalReviewWorkflow({
  proposals,
  className,
}: ProposalReviewWorkflowProps) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: 'status', value: 'pending' satisfies ProposalStatus },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);

  const agents = useMemo(
    () => Array.from(new Set(proposals.map((proposal) => proposal.agentName))).sort(),
    [proposals],
  );

  const statusTabs = useMemo<(ProposalStatus | 'all')[]>(() => {
    const present = new Set(proposals.map((proposal) => proposal.status));
    return ['all', ...STATUS_ORDER.filter((status) => present.has(status))];
  }, [proposals]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: proposals.length };
    for (const proposal of proposals) {
      counts[proposal.status] = (counts[proposal.status] ?? 0) + 1;
    }
    return counts;
  }, [proposals]);

  const readFilter = (id: string): unknown =>
    columnFilters.find((filter) => filter.id === id)?.value;

  const setFilter = (id: string, value: unknown) => {
    setColumnFilters((current) => [
      ...current.filter((filter) => filter.id !== id),
      ...(value === undefined || value === null || value === '' || value === 'all'
        ? []
        : [{ id, value }]),
    ]);
  };

  const activeStatus = (readFilter('status') as ProposalStatus | undefined) ?? 'all';
  const selectStatus = (status: ProposalStatus | 'all') => {
    setFilter('status', status);
  };

  // A tablist is a single tab stop: arrows move between tabs, Home/End jump to
  // the ends. Without this, the ARIA tab roles promise keyboard behaviour that
  // native buttons do not provide on their own.
  const handleStatusTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    status: ProposalStatus | 'all',
  ) => {
    const currentIndex = statusTabs.indexOf(status);
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % statusTabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + statusTabs.length) % statusTabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = statusTabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextStatus = statusTabs[nextIndex];
    if (!nextStatus) return;
    selectStatus(nextStatus);
    document.getElementById(`proposal-tab-${nextStatus}`)?.focus();
  };

  const riskFilter = (readFilter('riskScore') as RiskFilter | undefined) ?? 'all';
  const agentFilter = (readFilter('agentName') as string | undefined) ?? 'all';
  const minimumAmount = Number(readFilter('amount') ?? 0) || 0;

  const hasActiveFilters =
    activeStatus !== 'pending' ||
    riskFilter !== 'all' ||
    agentFilter !== 'all' ||
    minimumAmount > 0;

  const clearFilters = () => {
    setColumnFilters([]);
  };

  const columns = useMemo<ColumnDef<Proposal, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Proposal',
        enableSorting: false,
        cell: ({ row }) => {
          const proposal = row.original;
          return (
            <div className="min-w-0 max-w-[22rem]">
              <p
                className="truncate font-medium text-foreground"
                title={proposal.title}
              >
                {proposal.title}
              </p>
              <p className="truncate text-2xs text-foreground-muted">
                {proposal.counterparty}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: 'agentName',
        header: 'Agent',
        enableSorting: false,
        filterFn: 'equals',
        cell: ({ row }) => (
          <span className="text-foreground-secondary">{row.original.agentName}</span>
        ),
      },
      {
        accessorKey: 'riskScore',
        header: 'Risk',
        enableSorting: false,
        filterFn: riskFilterFn,
        cell: ({ row }) => <RiskBadge score={row.original.riskScore} showScore />,
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        filterFn: amountAtLeastFilterFn,
        sortingFn: 'basic',
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {formatCurrency(row.original.amount, row.original.asset)}
          </span>
        ),
        meta: { className: 'text-right' },
      },
      {
        accessorKey: 'createdAt',
        header: 'Submitted',
        sortingFn: 'datetime',
        cell: ({ row }) => (
          <time
            dateTime={row.original.createdAt}
            title={formatDateTime(row.original.createdAt)}
            className="text-2xs text-foreground-secondary"
          >
            {formatRelativeTime(row.original.createdAt)}
          </time>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        filterFn: 'equals',
        cell: ({ row }) => {
          const status = proposalStatus(row.original.status);
          return (
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
          );
        },
      },
      {
        id: 'quorum',
        header: 'Quorum',
        enableSorting: false,
        cell: ({ row }) => {
          const approved = row.original.approvals.filter(
            (approval) => approval.decision === 'approved',
          ).length;
          const met = approved >= row.original.requiredApprovals;
          return (
            <span
              className={cn(
                'tabular text-2xs font-medium',
                met ? 'text-success' : 'text-foreground-secondary',
              )}
            >
              {approved} / {row.original.requiredApprovals}
              {met ? ' · met' : ''}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => <ProposalRowActions proposal={row.original} />,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: proposals,
    columns,
    state: { columnFilters, sorting },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;
  const filteredCount = rows.length;
  const tabStopStatus = statusTabs.includes(activeStatus) ? activeStatus : 'all';

  return (
    <section
      className={cn('space-y-4', className)}
      aria-label="Proposal review workflow"
    >
      {/* Status tabs */}
      <div
        role="tablist"
        aria-label="Filter proposals by status"
        className="gap-1.5 flex flex-wrap items-center"
      >
        {statusTabs.map((status) => {
          const selected = activeStatus === status;
          return (
            <button
              key={status}
              id={`proposal-tab-${status}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="proposal-review-panel"
              tabIndex={status === tabStopStatus ? 0 : -1}
              onClick={() => selectStatus(status)}
              onKeyDown={(event) => handleStatusTabKeyDown(event, status)}
              className={cn(
                'gap-1.5 py-1.5 inline-flex items-center rounded-button border px-3 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                  ? 'border-gold bg-gold-soft text-foreground'
                  : 'border-border bg-surface text-foreground-secondary hover:border-gold hover:text-foreground',
              )}
            >
              {status === 'all' ? 'All' : proposalStatus(status).label}
              <span className="tabular text-foreground-muted">
                {statusCounts[status] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="proposal-review-panel"
        role="tabpanel"
        aria-labelledby={`proposal-tab-${activeStatus}`}
        className="space-y-4"
      >
        {/* Filter controls */}
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-2xs font-medium text-foreground-secondary">
              Risk level
              <select
                value={riskFilter}
                onChange={(event) => setFilter('riskScore', event.target.value)}
                className="h-9 rounded-button border border-border bg-surface px-3 text-xs text-foreground focus:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All levels</option>
                <option value="low">Low (&lt; 25)</option>
                <option value="medium">Medium (25–49)</option>
                <option value="high">High (50+)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-2xs font-medium text-foreground-secondary">
              Agent
              <select
                value={agentFilter}
                onChange={(event) => setFilter('agentName', event.target.value)}
                className="h-9 rounded-button border border-border bg-surface px-3 text-xs text-foreground focus:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All agents</option>
                {agents.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-2xs font-medium text-foreground-secondary">
              Minimum amount
              <span className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-foreground-muted"
                >
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  inputMode="numeric"
                  value={minimumAmount > 0 ? minimumAmount : ''}
                  onChange={(event) => setFilter('amount', event.target.value)}
                  placeholder="0"
                  list="proposal-amount-presets"
                  className="tabular w-36 h-9 rounded-button border border-border bg-surface pl-6 pr-3 text-xs text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <datalist id="proposal-amount-presets">
                  {MIN_AMOUNT_PRESETS.filter((preset) => preset > 0).map((preset) => (
                    <option key={preset} value={preset} />
                  ))}
                </datalist>
              </span>
            </label>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                leftIcon={<X className="h-3.5 w-3.5" aria-hidden />}
              >
                Clear filters
              </Button>
            )}
          </div>

          <p
            role="status"
            aria-live="polite"
            className="text-2xs text-foreground-muted"
          >
            Showing{' '}
            <span className="tabular font-medium text-foreground">{filteredCount}</span>{' '}
            of{' '}
            <span className="tabular font-medium text-foreground">
              {proposals.length}
            </span>{' '}
            proposals
          </p>
        </div>

        {/* Results table */}
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Proposals matching the active filters. Use the column headers to sort by
                submission time or transaction amount.
              </caption>
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="border-b border-border bg-surface-secondary/40"
                  >
                    {headerGroup.headers.map((header) => {
                      const meta = header.column.columnDef.meta as
                        | { className?: string }
                        | undefined;
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      const ariaSort = !canSort
                        ? undefined
                        : sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none';

                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={ariaSort}
                          className={cn(
                            'px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-foreground-secondary',
                            meta?.className,
                          )}
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              aria-label={`Sort by ${header.column.columnDef.header?.toString() ?? header.column.id}`}
                              className="gap-1.5 inline-flex items-center font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span>
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                              </span>
                              <span aria-hidden className="text-foreground-muted">
                                {sorted === 'asc' ? (
                                  <ArrowUp className="h-3.5 w-3.5" />
                                ) : sorted === 'desc' ? (
                                  <ArrowDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                                )}
                              </span>
                            </button>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>

              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="p-6">
                      <EmptyState
                        compact
                        title="No proposals match"
                        description="Adjust the risk, agent, or amount filters to widen the review queue."
                        action={
                          hasActiveFilters ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={clearFilters}
                            >
                              Clear filters
                            </Button>
                          ) : undefined
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="transition-colors duration-fast hover:bg-surface-secondary/30"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            'px-4 py-3 align-middle text-foreground',
                            (
                              cell.column.columnDef.meta as
                                | { className?: string }
                                | undefined
                            )?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProposalReviewWorkflow;
