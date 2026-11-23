'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { QueryBoundary } from '@/components/dashboard/query-boundary';
import { SectionLabel } from '@/components/dashboard/stat-card';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { BellIllustration } from '@/components/illustrations';
import { useProposals } from '@/hooks/use-queries';
import { ApprovalQueue } from '@/features/approvals/ApprovalQueue';
import { MultisigProgressCard } from '@/features/approvals/components/MultisigProgressCard';
import { mockMultisigRequest } from '@/features/approvals/fixtures/multisig';
import { PageTransition } from '@/components/ui/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function ApprovalsPage() {
  const proposals = useProposals();

  return (
    <PageTransition className="space-y-8">
      <PageHeader
        eyebrow="Operate"
        title="Approvals"
        description="Pending decisions awaiting your review — every one traceable to a proposed transaction."
      />

      <QueryBoundary
        query={proposals}
        loading={
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            illustration={<BellIllustration />}
            title="Nothing to approve"
            description="You're all caught up. New proposals will appear here as agents request approval."
          />
        }
      >
        {(data) => (
          <ErrorBoundary section="Approval queue">
            <ApprovalQueue proposals={data} />
          </ErrorBoundary>
        )}
      </QueryBoundary>

      <section className="space-y-4">
        <div className="space-y-1.5">
          <SectionLabel>Multi-party approval progress</SectionLabel>
          <p className="max-w-prose text-xs text-foreground-secondary">
            Threshold status for the pending multi-signature signing request — collected
            weight, remaining signatures, and each approver&apos;s decision.
          </p>
        </div>
        <ErrorBoundary section="Signing progress">
          <MultisigProgressCard request={mockMultisigRequest} />
        </ErrorBoundary>
      </section>
    </PageTransition>
  );
}
