'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { transactionStatus } from '@/lib/status';
import { formatCurrency, formatRelativeTime, truncateHash } from '@/lib/format';
import type { Transaction } from '@/types/domain';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import { TransactionFilters } from './TransactionFilters';
import { filterTransactions, type TransactionFilterValues } from './filterTransactions';
import { downloadTransactionExport } from './exportUtils';

interface TransactionHistoryProps {
  transactions: Transaction[];
}

const transactionStatuses: Transaction['status'][] = [
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

function initialFilters(searchParams: URLSearchParams): TransactionFilterValues {
  const status = searchParams.get('status');
  return {
    query: searchParams.get('q') ?? '',
    status:
      status && transactionStatuses.includes(status as Transaction['status'])
        ? (status as Transaction['status'])
        : 'all',
    asset: searchParams.get('asset') ?? 'all',
    agentId: searchParams.get('agent') ?? 'all',
    dateFrom: searchParams.get('from') ?? '',
    dateTo: searchParams.get('to') ?? '',
  };
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<TransactionFilterValues>(() =>
    initialFilters(searchParams),
  );

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, filters),
    [transactions, filters],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const values: Array<[string, string, string]> = [
        ['q', filters.query.trim(), ''],
        ['status', filters.status, 'all'],
        ['asset', filters.asset, 'all'],
        ['agent', filters.agentId, 'all'],
        ['from', filters.dateFrom, ''],
        ['to', filters.dateTo, ''],
      ];
      for (const [key, value, emptyValue] of values) {
        if (value && value !== emptyValue) params.set(key, value);
        else params.delete(key);
      }
      const queryString = params.toString();
      if (queryString !== searchParams.toString()) {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filters, pathname, router, searchParams]);

  const selectedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedId) ?? null,
    [selectedId, transactions],
  );

  const exportTransactions = (
    rows: readonly Transaction[],
    format: 'csv' | 'json',
  ) => {
    // The active filters are passed to the utility so the file contents match
    // the table even if a caller hands us the unfiltered collection.
    downloadTransactionExport(rows, { format, filters });
  };

  const summary = useMemo(
    () => ({
      totalValue: filteredTransactions.reduce((sum, tx) => sum + tx.usdValue, 0),
      successful: filteredTransactions.filter((tx) =>
        ['completed', 'confirmed', 'approved'].includes(tx.status),
      ).length,
      flagged: filteredTransactions.filter((tx) => tx.riskScore >= 80).length,
    }),
    [filteredTransactions],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-2xs uppercase tracking-[0.18em] text-foreground-secondary">
              USD volume
            </span>
            <Sparkles className="h-4 w-4 text-gold" aria-hidden />
          </div>
          <p className="tabular mt-3 font-display text-2xl font-semibold tracking-tight">
            {formatCurrency(summary.totalValue, 'USDC', { compact: true })}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-2xs uppercase tracking-[0.18em] text-foreground-secondary">
              Settled
            </span>
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
          </div>
          <p className="tabular mt-3 font-display text-2xl font-semibold tracking-tight">
            {summary.successful}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-2xs uppercase tracking-[0.18em] text-foreground-secondary">
              High risk
            </span>
            <Search className="h-4 w-4 text-warning" aria-hidden />
          </div>
          <p className="tabular mt-3 font-display text-2xl font-semibold tracking-tight">
            {summary.flagged}
          </p>
        </Card>
      </div>

      <TransactionFilters
        transactions={transactions}
        visibleTransactions={filteredTransactions}
        value={filters}
        filteredCount={filteredTransactions.length}
        onChange={setFilters}
        onExportCSV={(rows) => exportTransactions(rows, 'csv')}
        onExportJSON={(rows) => exportTransactions(rows, 'json')}
      />

      <DataTable
        data={filteredTransactions}
        pageSize={8}
        pageSizeOptions={[8, 16, 32, 64]}
        caption="Transaction activity"
        onRowClick={(transaction) => setSelectedId(transaction.id)}
        getRowId={(row) => row.id}
        emptyState={
          <div className="py-5 text-center">
            <p className="text-sm font-medium text-foreground">
              No matching transactions
            </p>
            <p className="mt-1 text-xs text-foreground-secondary">
              Try adjusting or clearing the active filters.
            </p>
          </div>
        }
        columns={[
          {
            accessorKey: 'counterpartyAddress',
            header: 'Recipient',
            sortingFn: (rowA, rowB) =>
              rowA.original.counterpartyAddress.localeCompare(rowB.original.counterpartyAddress),
            cell: ({ row }) => {
              const tx = row.original;
              return (
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {tx.counterparty}
                  </p>
                  <p className="tabular text-2xs text-foreground-muted">
                    {truncateHash(tx.counterpartyAddress)}
                  </p>
                </div>
              );
            },
          },
          {
            accessorKey: 'purpose',
            header: 'Purpose',
            cell: ({ row }) => (
              <span className="text-foreground-secondary">{row.original.purpose}</span>
            ),
          },
          {
            accessorKey: 'agentName',
            header: 'Agent',
            cell: ({ row }) => (
              <span className="text-foreground-secondary">
                {row.original.agentName ?? '—'}
              </span>
            ),
          },
          {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ row }) => {
              const tx = row.original;
              const outbound = tx.direction === 'outbound';
              const Icon = outbound ? ArrowUpRight : ArrowDownLeft;
              return (
                <span
                  className={`tabular inline-flex items-center justify-end gap-1 font-medium ${
                    outbound ? 'text-foreground' : 'text-success'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {outbound ? '−' : '+'}
                  {formatCurrency(tx.amount, tx.asset)}
                </span>
              );
            },
            meta: { className: 'text-right' },
          },
          {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
              const status = transactionStatus(row.original.status);
              return <Badge variant={status.variant}>{status.label}</Badge>;
            },
          },
          {
            accessorKey: 'riskScore',
            header: 'Risk',
            cell: ({ row }) => <RiskBadge score={row.original.riskScore} />,
          },
          {
            accessorKey: 'createdAt',
            header: 'When',
            sortingFn: (rowA, rowB) =>
              new Date(rowA.original.createdAt).getTime() - new Date(rowB.original.createdAt).getTime(),
            cell: ({ row }) => (
              <span className="text-2xs text-foreground-muted">
                {formatRelativeTime(row.original.createdAt)}
              </span>
            ),
            meta: { className: 'text-right' },
          },
        ]}
      />

      <TransactionDetailDrawer
        transaction={selectedTransaction}
        open={Boolean(selectedTransaction)}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
