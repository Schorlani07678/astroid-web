'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import type { Transaction, TransactionStatus } from '@/types/domain';
import type { TransactionFilterValues } from './filterTransactions';
import { TransactionExportActions } from './TransactionExportActions';

interface TransactionFiltersProps {
  transactions: Transaction[];
  visibleTransactions: Transaction[];
  value: TransactionFilterValues;
  filteredCount: number;
  onChange: (value: TransactionFilterValues) => void;
  onExportCSV?: (transactions: Transaction[]) => void;
  onExportJSON?: (transactions: Transaction[]) => void;
}

const STATUSES: TransactionStatus[] = [
  'draft',
  'pending',
  'approved',
  'submitting',
  'confirmed',
  'completed',
  'rejected',
  'expired',
  'cancelled',
  'failed',
];

export function TransactionFilters({
  transactions,
  visibleTransactions,
  value,
  filteredCount,
  onChange,
  onExportCSV,
  onExportJSON,
}: TransactionFiltersProps) {
  const assets = Array.from(
    new Set(transactions.map((transaction) => transaction.asset)),
  ).sort();
  const agents = Array.from(
    new Map(
      transactions
        .filter((transaction) => transaction.agentId)
        .map((transaction) => [
          transaction.agentId as string,
          transaction.agentName ?? (transaction.agentId as string),
        ]),
    ),
  );
  const hasFilters =
    Boolean(value.query) ||
    value.status !== 'all' ||
    value.asset !== 'all' ||
    value.agentId !== 'all' ||
    Boolean(value.dateFrom) ||
    Boolean(value.dateTo);

  const update = (patch: Partial<TransactionFilterValues>) =>
    onChange({ ...value, ...patch });

  return (
    <section aria-label="Transaction filters" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <label className="gap-1.5 flex min-w-0 flex-col sm:col-span-2 xl:col-span-2">
          <span className="text-xs font-medium text-foreground">
            Search transactions
          </span>
          <Input
            type="search"
            value={value.query}
            onChange={(event) => update({ query: event.target.value })}
            placeholder="Counterparty, hash, purpose, agent..."
            leftIcon={<Search className="h-4 w-4" aria-hidden />}
            aria-label="Search transactions"
          />
        </label>

        <label className="gap-1.5 flex min-w-0 flex-col">
          <span className="text-xs font-medium text-foreground">Asset</span>
          <Select
            value={value.asset}
            onChange={(event) => update({ asset: event.target.value })}
            aria-label="Filter transactions by asset"
          >
            <option value="all">All assets</option>
            {assets.map((asset) => (
              <option key={asset} value={asset}>
                {asset}
              </option>
            ))}
          </Select>
        </label>

        <label className="gap-1.5 flex min-w-0 flex-col">
          <span className="text-xs font-medium text-foreground">Status</span>
          <Select
            value={value.status}
            onChange={(event) =>
              update({
                status: event.target.value as TransactionFilterValues['status'],
              })
            }
            aria-label="Filter transactions by status"
          >
            <option value="all">All statuses</option>
            {STATUSES.filter((status) =>
              transactions.some((transaction) => transaction.status === status),
            ).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </label>

        <label className="gap-1.5 flex min-w-0 flex-col">
          <span className="text-xs font-medium text-foreground">Agent</span>
          <Select
            value={value.agentId}
            onChange={(event) => update({ agentId: event.target.value })}
            aria-label="Filter transactions by agent"
          >
            <option value="all">All agents</option>
            {agents.map(([agentId, agentName]) => (
              <option key={agentId} value={agentId}>
                {agentName}
              </option>
            ))}
          </Select>
        </label>

        <label className="gap-1.5 flex min-w-0 flex-col">
          <span className="text-xs font-medium text-foreground">From date</span>
          <Input
            type="date"
            value={value.dateFrom}
            max={value.dateTo || undefined}
            onChange={(event) => update({ dateFrom: event.target.value })}
            aria-label="Filter transactions from date"
          />
        </label>

        <label className="gap-1.5 flex min-w-0 flex-col">
          <span className="text-xs font-medium text-foreground">To date</span>
          <Input
            type="date"
            value={value.dateTo}
            min={value.dateFrom || undefined}
            onChange={(event) => update({ dateTo: event.target.value })}
            aria-label="Filter transactions to date"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div
          className="flex flex-wrap items-center gap-3 text-xs text-foreground-muted"
          aria-live="polite"
        >
          <span>
            Showing {filteredCount} of {transactions.length} transactions
          </span>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  query: '',
                  status: 'all',
                  asset: 'all',
                  agentId: 'all',
                  dateFrom: '',
                  dateTo: '',
                })
              }
            >
              <X className="h-3.5 w-3.5 mr-1" aria-hidden />
              Clear filters
            </Button>
          )}
        </div>
        <TransactionExportActions
          rows={visibleTransactions}
          onExportCSV={onExportCSV}
          onExportJSON={onExportJSON}
        />
      </div>
    </section>
  );
}
