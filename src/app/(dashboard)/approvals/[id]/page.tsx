'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/dashboard/page-header';
import { QueryBoundary } from '@/components/dashboard/query-boundary';
import { KeyValue, SectionLabel } from '@/components/dashboard/stat-card';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import { useProposal } from '@/hooks/use-queries';
import { useProposalApproval } from '@/hooks/useProposalApproval';
import { ProposalApprovalConfirmDialog } from '@/features/approvals/components/ProposalApprovalConfirmDialog';
import { proposalStatus } from '@/lib/status';
import { formatCurrency, formatDateTime, formatRelativeTime } from '@/lib/format';
import type { ApprovalDecision, Proposal } from '@/types/domain';
import type { LocalApprovalDecision } from '@/stores/proposal-approval-store';
import { PageTransition, AnimatedNumber } from '@/components/ui/motion';
import { FileSignature } from 'lucide-react';
import { TransactionSigningModal } from '@/features/wallet/components/TransactionSigningModal';
import { mockMultisigRequest } from '@/features/approvals/fixtures/multisig';
import { ProposalAuditTrail } from '@/features/approvals/components/ProposalAuditTrail';
import { ProposalTimeline } from '@/features/approvals/components/ProposalTimeline';
import { ApprovalStatusLiveRegion } from '@/features/approvals/components/ApprovalStatusLiveRegion';

const decisionMeta: Record<
  ApprovalDecision['decision'],
  { label: string; className: string }
> = {
  approved: { label: 'Approved', className: 'text-success' },
  rejected: { label: 'Rejected', className: 'text-danger' },
  delegated: { label: 'Delegated', className: 'text-info' },
  pending: { label: 'Awaiting', className: 'text-foreground-muted' },
};

/** Approve/reject controls wired to the guarded approval state machine. */
function ApprovalDecisionActions({ proposal }: { proposal: Proposal }) {
  const {
    decision,
    isProcessing,
    approvedWeight,
    requiredApprovals,
  } = useProposalApproval(proposal);

  const [pendingAction, setPendingAction] = useState<LocalApprovalDecision | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openConfirmation = (action: LocalApprovalDecision) => {
    setPendingAction(action);
    setConfirmOpen(true);
  };

  const closeConfirmation = () => {
    setConfirmOpen(false);
    setPendingAction(null);
  };

  const disabled = isProcessing || decision !== null;

  const decisionAnnouncement = decision
    ? `You ${decision} this proposal. ${approvedWeight} of ${requiredApprovals} signatures collected.`
    : '';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ApprovalStatusLiveRegion message={decisionAnnouncement} />
      <Button
        type="button"
        variant="gold"
        size="sm"
        leftIcon={<Check className="h-4 w-4" aria-hidden />}
        onClick={() => openConfirmation('approved')}
        disabled={disabled}
        aria-label={`Approve ${proposal.title}`}
      >
        {decision === 'approved' ? 'Approved' : 'Approve'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        leftIcon={<X className="h-4 w-4" aria-hidden />}
        onClick={() => openConfirmation('rejected')}
        disabled={disabled}
        aria-label={`Reject ${proposal.title}`}
      >
        {decision === 'rejected' ? 'Rejected' : 'Reject'}
      </Button>

      {decision && (
        <span className="text-2xs text-foreground-secondary">
          You {decision} this proposal
          · {approvedWeight} of {requiredApprovals} signatures collected
        </span>
      )}
      <ProposalApprovalConfirmDialog
        proposal={proposal}
        action={pendingAction}
        open={confirmOpen}
        onClose={closeConfirmation}
      />
    </div>
  );
}

/** Live "X of Y signatures collected" label for the approval chain. */
function SignatureProgressLabel({ proposal }: { proposal: Proposal }) {
  const { approvedWeight, requiredApprovals, isQuorumMet } = useProposalApproval(proposal);

  return (
    <SectionLabel>
      Approval chain — {approvedWeight} of {requiredApprovals} signatures collected
      {isQuorumMet && ' · quorum met'}
    </SectionLabel>
  );
}

export default function ApprovalDetailPage({ params }: { params: { id: string } }) {
  const proposal = useProposal(params.id);
  const [priority, setPriority] = useState<'standard' | 'priority' | 'urgent'>(
    'priority',
  );
  const [signingOpen, setSigningOpen] = useState(false);

  const feeEstimate = useMemo(() => {
    const ledgerCongestion = 68;
    const baseFee = 100;
    const priorityProfiles = {
      standard: { label: 'Standard', multiplier: 1.1, inclusion: '3–8 min' },
      priority: { label: 'Priority', multiplier: 1.7, inclusion: '1–3 min' },
      urgent: { label: 'Urgent', multiplier: 2.4, inclusion: '30–90 sec' },
    } as const;

    const selected = priorityProfiles[priority];
    const adjustedFee = Math.round(
      baseFee * (1 + ledgerCongestion / 100) * selected.multiplier,
    );
    const feeBump = adjustedFee - baseFee;

    return { ledgerCongestion, baseFee, selected, adjustedFee, feeBump };
  }, [priority]);

  return (
    <PageTransition className="space-y-8">
      <Link
        href="/approvals"
        className="inline-flex items-center gap-1 text-2xs font-medium text-foreground-secondary transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to approvals
      </Link>

      <QueryBoundary
        query={proposal}
        loading={
          <div className="space-y-6">
            <div className="skeleton h-24 w-full rounded-card" />
            <div className="skeleton h-64 w-full rounded-card" />
          </div>
        }
      >
        {(data) => {
          const status = proposalStatus(data.status);
          const isPending = data.status === 'pending';
          const kindLabel = data.kind === 'multisig' ? 'MultiSig' : data.kind;

          return (
            <div className="space-y-8">
              <PageHeader
                eyebrow={`Proposal · ${data.agentName}`}
                title={data.title}
                description={data.description}
                actions={
                  <Badge variant={status.variant} dot>
                    {status.label}
                  </Badge>
                }
              />

              {/* Amount hero */}
              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-0 bg-gold-sheen"
                  aria-hidden
                />
                <CardContent className="relative pt-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-2xs font-medium uppercase tracking-[0.12em] text-foreground-secondary">
                        Proposed spend
                      </p>
                      <p className="tabular mt-2 font-display text-4xl font-semibold leading-none tracking-tight">
                        <AnimatedNumber
                          value={data.amount}
                          formatter={(v) => formatCurrency(v, data.asset)}
                        />
                      </p>
                      <p className="mt-2 text-2xs text-foreground-secondary">
                        to {data.counterparty} · expires{' '}
                        {formatRelativeTime(data.expiresAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskBadge score={data.riskScore} showScore />
                      <Badge variant="outline" size="sm" className="capitalize">
                        {kindLabel}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
                {isPending && (
                  <CardFooter className="relative">
                    <ApprovalDecisionActions proposal={data} />
                  </CardFooter>
                )}
              </Card>

              <div className="grid gap-6 lg:grid-cols-3">
                {/* Approval timeline */}
                <div className="space-y-4 lg:col-span-2">
                  <SignatureProgressLabel proposal={data} />
                  <ProposalAuditTrail events={data.approvals} />

                  <SectionLabel>Multi-party signer timeline</SectionLabel>
                  <ProposalTimeline threshold={mockMultisigRequest.threshold} />
                </div>

                {/* Detail rail */}
                <div className="space-y-4">
                  <SectionLabel>Details</SectionLabel>
                  <Card className="p-4">
                    <Button
                      type="button"
                      variant="gold"
                      className="w-full"
                      leftIcon={<FileSignature className="h-4 w-4" aria-hidden />}
                      onClick={() => setSigningOpen(true)}
                    >
                      Review and sign transaction
                    </Button>
                  </Card>
                  <TransactionSigningModal
                    open={signingOpen}
                    onClose={() => setSigningOpen(false)}
                    xdr={mockMultisigRequest.xdr}
                    expectedNetworkPassphrase={mockMultisigRequest.networkPassphrase}
                    title={`Sign — ${data.title}`}
                  />
                  <Card className="p-5">
                    <dl className="grid gap-4">
                      <KeyValue label="Proposed by">{data.agentName}</KeyValue>
                      <KeyValue label="Counterparty">{data.counterparty}</KeyValue>
                      <KeyValue label="Approval type">
                        <span className="capitalize">{kindLabel}</span>
                      </KeyValue>
                      <KeyValue label="Risk">
                        <RiskBadge score={data.riskScore} showScore />
                      </KeyValue>
                      <KeyValue label="Created">
                        {formatDateTime(data.createdAt)}
                      </KeyValue>
                      <KeyValue label="Expires">
                        {formatDateTime(data.expiresAt)}
                      </KeyValue>
                      <KeyValue label="Linked transaction">
                        <Link
                          href={`/transactions/${data.transactionId}`}
                          className="inline-flex items-center gap-1 text-gold-strong hover:underline"
                        >
                          View transaction
                          <ArrowUpRight className="h-3 w-3" aria-hidden />
                        </Link>
                      </KeyValue>
                    </dl>
                  </Card>
                </div>
              </div>

              {/* Approver roster */}
              <div className="space-y-4">
                <SectionLabel>Approvers</SectionLabel>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.approvals.map((decision) => (
                    <Card
                      key={decision.id}
                      elevation="flat"
                      className="flex items-center gap-3 p-4"
                    >
                      <Avatar
                        name={decision.userName}
                        src={decision.userAvatar}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {decision.userName}
                        </p>
                        <p
                          className={cn(
                            'text-2xs font-medium',
                            decisionMeta[decision.decision].className,
                          )}
                        >
                          {decisionMeta[decision.decision].label}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-sm">Stellar fee estimator</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 text-2xs uppercase tracking-[0.12em] text-foreground-secondary">
                    <span>Ledger congestion</span>
                    <span className="font-medium text-gold-strong">
                      {feeEstimate.ledgerCongestion}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${feeEstimate.ledgerCongestion}%` }}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
                    <label className="space-y-2 text-sm text-foreground">
                      <span className="text-xs font-medium uppercase tracking-[0.12em] text-foreground-secondary">
                        Dispatch priority
                      </span>
                      <select
                        value={priority}
                        onChange={(event) =>
                          setPriority(event.target.value as typeof priority)
                        }
                        className="h-10 w-full rounded-sm border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="standard">Standard</option>
                        <option value="priority">Priority</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </label>

                    <div className="space-y-2 rounded-md border border-border bg-surface-secondary p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-foreground-secondary">
                        Suggested fee bump
                      </p>
                      <p className="tabular font-display text-2xl font-semibold tracking-tight">
                        {feeEstimate.adjustedFee} stroops
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-secondary/70 p-3 text-sm">
                    <span className="text-foreground-secondary">
                      {feeEstimate.selected.label} lane ·{' '}
                      {feeEstimate.selected.inclusion}
                    </span>
                    <span className="font-medium text-gold-strong">
                      +{feeEstimate.feeBump} stroops vs base
                    </span>
                  </div>

                  <p className="max-w-prose text-xs leading-relaxed text-foreground-secondary">
                    This proposal was evaluated against {data.requiredApprovals}{' '}
                    {data.requiredApprovals === 1 ? 'policy' : 'policies'} and carries a
                    cryptographic decision record. Approving signs on-chain; rejecting
                    writes an immutable entry to the audit log.
                  </p>
                </CardContent>
              </Card>
            </div>
          );
        }}
      </QueryBoundary>
    </PageTransition>
  );
}
