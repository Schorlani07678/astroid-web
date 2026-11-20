'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { QueryBoundary } from '@/components/dashboard/query-boundary';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MemoryIllustration } from '@/components/illustrations';
import { useMemoryRecords } from '@/hooks/use-queries';
import { formatCurrency, formatNumber, formatRelativeTime } from '@/lib/format';
import type { MemoryRecord } from '@/types/domain';
import { PageTransition } from '@/components/ui/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuditTimeline } from '@/features/audit/AuditTimeline';

const columns: Column<MemoryRecord>[] = [
  {
    header: 'Agent',
    cell: (r) => <span className="font-medium text-foreground">{r.agentName}</span>,
  },
  {
    header: 'Decision',
    hideOnMobile: true,
    cell: (r) => <span className="text-foreground-secondary">{r.task}</span>,
  },
  {
    header: 'Project',
    cell: (r) => (
      <Badge variant="outline" size="sm">
        {r.project}
      </Badge>
    ),
  },
  {
    header: 'Amount',
    align: 'right',
    cell: (r) => (
      <span className="tabular font-medium">{formatCurrency(r.amount, r.asset)}</span>
    ),
  },
  {
    header: 'Risk',
    hideOnMobile: true,
    cell: (r) => <RiskBadge score={r.riskScore} />,
  },
  {
    header: 'Steps',
    align: 'right',
    hideOnMobile: true,
    cell: (r) => (
      <span className="tabular text-2xs text-foreground-secondary">
        {formatNumber(r.steps.length)}
      </span>
    ),
  },
  {
    header: 'When',
    align: 'right',
    cell: (r) => (
      <span className="text-2xs text-foreground-muted">
        {formatRelativeTime(r.createdAt)}
      </span>
    ),
  },
];

export default function AuditPage() {
  const records = useMemoryRecords();

  return (
    <PageTransition className="space-y-8">
      <PageHeader
        eyebrow="Govern"
        title="Audit log"
        description="An immutable trail of every governed decision and settlement — click any row to reconstruct it end to end."
      />

      <QueryBoundary
        query={records}
        loading={<div className="skeleton h-96 w-full rounded-card" />}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            illustration={<MemoryIllustration />}
            title="No audit entries yet"
            description="Every autonomous decision your agents make will be recorded here, permanently."
          />
        }
      >
        {(data) => (
          <div className="space-y-8">
            <ErrorBoundary section="Audit table">
              <DataTable<MemoryRecord>
                columns={columns}
                rows={data}
                rowKey={(r) => r.id}
                rowHref={(r) => `/audit/${r.id}`}
              />
            </ErrorBoundary>
            <div className="pt-6 border-t border-border space-y-4">
              <h3 className="font-display text-lg font-semibold tracking-tight">Organization Audit Log Stream Timeline</h3>
              <ErrorBoundary section="Audit timeline">
                <AuditTimeline />
              </ErrorBoundary>
            </div>
          </div>
        )}
      </QueryBoundary>
    </PageTransition>
  );
}
