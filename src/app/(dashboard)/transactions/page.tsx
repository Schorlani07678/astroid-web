'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { QueryBoundary } from '@/components/dashboard/query-boundary';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartIllustration } from '@/components/illustrations';
import { useTransactions } from '@/hooks/use-queries';
import { PageTransition } from '@/components/ui/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { XdrSignatureStatus } from '@/features/transactions/XdrSignatureStatus';
import { FeeOptimizationPanel } from '@/features/transactions/FeeOptimizationPanel';
import { TransactionHistory } from '@/features/transactions/TransactionHistory';

export default function TransactionsPage() {
  const transactions = useTransactions();

  return (
    <PageTransition className="space-y-8">
      <PageHeader
        eyebrow="Operate"
        title="Transactions"
        description="Every value movement your agents have proposed, approved and settled on Stellar."
      />

      <ErrorBoundary section="Signature status">
        <XdrSignatureStatus />
      </ErrorBoundary>

      <QueryBoundary
        query={transactions}
        loading={<div className="skeleton h-96 w-full rounded-card" />}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            illustration={<ChartIllustration />}
            title="No transactions yet"
            description="Once your agents start moving value, their on-chain activity lands here."
          />
        }
      >
        {(data) => (
          <div className="space-y-8">
            <ErrorBoundary section="Fee optimization">
              <FeeOptimizationPanel />
            </ErrorBoundary>

            <div className="space-y-4 border-t border-border pt-4">
              <ErrorBoundary section="Transaction history">
                <TransactionHistory transactions={data} />
              </ErrorBoundary>
            </div>
          </div>
        )}
      </QueryBoundary>
    </PageTransition>
  );
}
