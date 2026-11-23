'use client';

import { useId, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPercent } from '@/lib/format';
import { MOCK_DEPARTMENT_BUDGETS } from './mock-data';
import type { DepartmentBudget } from './types';
import {
  compareAllocationRows,
  matchesAllocationFilter,
  toAllocationRows,
  type DepartmentAllocationRow,
  type NumericAllocationColumn,
} from './departmentBudgetTable';

export interface DepartmentBudgetAllocationTableProps {
  departments?: DepartmentBudget[];
  /** Rows per page. Values below 1 are treated as 1. */
  pageSize?: number;
  className?: string;
}

interface ColumnMeta {
  className?: string;
}

const CAPTION = 'Department budget allocations';
const DEFAULT_PAGE_SIZE = 5;

function numericSort(column: NumericAllocationColumn) {
  return (
    a: { original: DepartmentAllocationRow },
    b: { original: DepartmentAllocationRow },
  ) => compareAllocationRows(a.original, b.original, column);
}

const columns: ColumnDef<DepartmentAllocationRow, unknown>[] = [
  {
    accessorKey: 'department',
    header: 'Department',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">
          {row.original.department}
        </span>
        <span className="text-xs text-foreground-muted">{row.original.asset}</span>
      </div>
    ),
  },
  {
    accessorKey: 'allocated',
    header: 'Allocated',
    sortingFn: numericSort('allocated'),
    cell: ({ row }) => (
      <span className="tabular text-foreground">
        {formatCurrency(row.original.allocated, row.original.asset)}
      </span>
    ),
    meta: { className: 'text-right' } satisfies ColumnMeta,
  },
  {
    accessorKey: 'spent',
    header: 'Spent',
    sortingFn: numericSort('spent'),
    cell: ({ row }) => (
      <span className="tabular text-foreground">
        {formatCurrency(row.original.spent, row.original.asset)}
      </span>
    ),
    meta: { className: 'text-right' } satisfies ColumnMeta,
  },
  {
    accessorKey: 'consumption',
    header: 'Consumption',
    sortingFn: numericSort('consumption'),
    cell: ({ row }) => {
      const value = row.original.consumption;
      return (
        <div className="flex items-center justify-end gap-2">
          <span
            aria-hidden
            className="h-1.5 w-16 hidden overflow-hidden rounded-full bg-surface-secondary sm:block"
          >
            <span
              className={cn(
                'block h-full rounded-full',
                value >= 100 ? 'bg-danger' : value >= 80 ? 'bg-warning' : 'bg-success',
              )}
              style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
          </span>
          <span className="tabular font-medium text-foreground">
            {formatPercent(value)}
          </span>
        </div>
      );
    },
    meta: { className: 'text-right' } satisfies ColumnMeta,
  },
];

/**
 * Department budget allocations in a TanStack table: allocated, spent and
 * consumption per department, sortable by the numeric columns and filterable
 * as you type by department name or token asset.
 *
 * Sort state is exposed with `aria-sort` on each sortable header and the sort
 * control is a real button, so the table is usable from the keyboard alone.
 * The filter is a labelled search field, and the number of matching rows is
 * announced through a polite live region. On narrow screens the toolbar
 * stacks and the table scrolls horizontally instead of overflowing the page.
 */
export function DepartmentBudgetAllocationTable({
  departments = MOCK_DEPARTMENT_BUDGETS,
  pageSize = DEFAULT_PAGE_SIZE,
  className,
}: DepartmentBudgetAllocationTableProps) {
  const filterId = useId();
  const data = useMemo(() => toAllocationRows(departments), [departments]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE),
  });

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, globalFilter: filter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onPaginationChange: setPagination,
    globalFilterFn: (row, _columnId, value) =>
      matchesAllocationFilter(row.original, String(value ?? '')),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const { pageIndex, pageSize: currentPageSize } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const matchCount = table.getFilteredRowModel().rows.length;
  const firstRow = matchCount === 0 ? 0 : pageIndex * currentPageSize + 1;
  const lastRow = Math.min(matchCount, (pageIndex + 1) * currentPageSize);
  const rows = table.getRowModel().rows;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-border bg-surface',
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border bg-surface-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p
          aria-hidden
          className="text-xs font-medium uppercase tracking-[0.18em] text-foreground-secondary"
        >
          {CAPTION}
        </p>
        <div role="search" className="relative block w-full sm:max-w-xs">
          <label htmlFor={filterId} className="sr-only">
            Filter by department or asset
          </label>
          <Search
            className="h-3.5 w-3.5 pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
          <input
            id={filterId}
            type="search"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
            placeholder="Filter by department or asset..."
            className="h-9 w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {matchCount === 1 ? '1 department matches' : `${matchCount} departments match`}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <caption className="sr-only">{CAPTION}</caption>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-border bg-surface-secondary/40"
              >
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const content = flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  );

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        canSort
                          ? sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : 'none'
                          : undefined
                      }
                      className={cn(
                        'px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-foreground-secondary',
                        meta?.className,
                      )}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="gap-1.5 inline-flex items-center rounded-sm font-medium uppercase tracking-[0.18em] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span>{content}</span>
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
                        content
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
                <td
                  colSpan={columns.length}
                  className="p-8 text-center text-sm text-foreground-secondary"
                >
                  No departments match &ldquo;{filter.trim()}&rdquo;.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors hover:bg-surface-secondary/40"
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn('px-4 py-3 align-middle', meta?.className)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <nav
        aria-label={`${CAPTION} pagination`}
        className="flex flex-col gap-3 border-t border-border p-4 text-sm text-foreground-secondary sm:flex-row sm:items-center sm:justify-between"
      >
        <p aria-live="polite">
          Showing {firstRow}–{lastRow} of {matchCount}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <span className="tabular">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </nav>
    </div>
  );
}

export default DepartmentBudgetAllocationTable;
