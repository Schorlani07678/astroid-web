'use client';

/**
 * Advanced filter bar rendered above the department budget table (#175).
 *
 * Controls date range, agent attribution, and derived budget status; the
 * Export CSV button serializes exactly the filtered rows visible in the
 * table. Filters live in parent state so the existing TanStack sorting and
 * the department select keep composing with them.
 */

import { CalendarDays, Filter, FileSpreadsheet, X } from 'lucide-react';
import {
  BUDGET_LEDGER_STATUS_LABELS,
  type BudgetLedgerFilterState,
  type BudgetLedgerStatusFilter,
} from './budgetLedgerFiltering';

export interface BudgetAgentOption {
  agentId: string;
  agentName: string;
}

export interface BudgetLedgerFiltersProps {
  filters: BudgetLedgerFilterState;
  agentOptions: BudgetAgentOption[];
  hasActiveFilters: boolean;
  totalEntryCount: number;
  filteredEntryCount: number;
  onChange: (patch: Partial<BudgetLedgerFilterState>) => void;
  onClear: () => void;
  onExportCSV: () => void;
}

const selectClass =
  'rounded-button border border-border bg-surface px-3 py-1.5 text-xs text-foreground font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function BudgetLedgerFilters({
  filters,
  agentOptions,
  hasActiveFilters,
  totalEntryCount,
  filteredEntryCount,
  onChange,
  onClear,
  onExportCSV,
}: BudgetLedgerFiltersProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border pb-4">
        <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-foreground-muted">
          <Filter className="h-3.5 w-3.5" aria-hidden />
          <span>Ledger Filters</span>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Filter ledger by date range">
          <CalendarDays className="h-3.5 w-3.5 text-foreground-muted" aria-hidden />
          <label className="sr-only" htmlFor="budget-ledger-date-from">
            From date
          </label>
          <input
            id="budget-ledger-date-from"
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || undefined}
            onChange={(event) => onChange({ dateFrom: event.target.value })}
            className={selectClass}
          />
          <span className="text-2xs text-foreground-muted" aria-hidden>
            to
          </span>
          <label className="sr-only" htmlFor="budget-ledger-date-to">
            To date
          </label>
          <input
            id="budget-ledger-date-to"
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom || undefined}
            onChange={(event) => onChange({ dateTo: event.target.value })}
            className={selectClass}
          />
        </div>

        {/* Agent attribution */}
        <label className="sr-only" htmlFor="budget-ledger-agent">
          Filter by agent
        </label>
        <select
          id="budget-ledger-agent"
          value={filters.agentId}
          onChange={(event) => onChange({ agentId: event.target.value })}
          className={selectClass}
        >
          <option value="all">All Agents ({agentOptions.length})</option>
          {agentOptions.map((agent) => (
            <option key={agent.agentId} value={agent.agentId}>
              {agent.agentName} ({agent.agentId})
            </option>
          ))}
        </select>

        {/* Budget status */}
        <label className="sr-only" htmlFor="budget-ledger-status">
          Filter by budget status
        </label>
        <select
          id="budget-ledger-status"
          value={filters.status}
          onChange={(event) => onChange({ status: event.target.value as BudgetLedgerStatusFilter })}
          className={selectClass}
        >
          <option value="all">All Statuses</option>
          {(Object.keys(BUDGET_LEDGER_STATUS_LABELS) as (keyof typeof BUDGET_LEDGER_STATUS_LABELS)[]).map(
            (value) => (
              <option key={value} value={value}>
                {BUDGET_LEDGER_STATUS_LABELS[value]}
              </option>
            ),
          )}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-2xs font-semibold text-gold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-button"
          >
            <X className="h-3 w-3" aria-hidden />
            Reset Filters
          </button>
        )}

        {/* CSV export of the filtered rows */}
        <button
          type="button"
          onClick={onExportCSV}
          className="ml-auto flex items-center gap-1.5 rounded-button border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground-secondary transition-colors hover:border-gold hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Export filtered budget ledger as CSV"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          <span>Export CSV</span>
        </button>
      </div>

      <p className="text-2xs text-foreground-muted" aria-live="polite">
        Showing {filteredEntryCount} of {totalEntryCount} ledger entries
      </p>
    </div>
  );
}

export default BudgetLedgerFilters;
