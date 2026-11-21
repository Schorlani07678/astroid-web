'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  ShieldAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { useCurrentUser } from '@/hooks/use-queries';
import { useStellarWallet } from '@/hooks/useStellarWallet';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDateTime, formatRelativeTime } from '@/lib/format';
import { proposalStatus } from '@/lib/status';
import type { Proposal } from '@/types/domain';

import {
  approvalQueryKeys,
  fetchProposalApprovalState,
  submitProposalDecision,
} from './approvalApi';
import {
  approvalProgress,
  canReviewProposal,
  snapshotFromProposal,
  type ApprovalReviewer,
  type ProposalApprovalSnapshot,
  type ReviewDecision,
} from './approvalState';
import { ApprovalStatusLiveRegion } from './components/ApprovalStatusLiveRegion';

export interface ProposalReviewCardProps {
  proposal: Proposal;
  /**
   * Whether the surrounding screen allows review actions. Defaults to `true`;
   * the signed-in user's role is checked independently.
   */
  canReview?: boolean;
  /** Optional reviewer override, useful in tests and read-only embeds. */
  reviewer?: ApprovalReviewer;
  /**
   * Optional Stellar envelope. When supplied and approving, the wallet signs it
   * before the decision is submitted.
   */
  xdr?: string;
  className?: string;
  onDecisionRecorded?: (snapshot: ProposalApprovalSnapshot) => void;
}

const DECISION_COPY: Record<
  ReviewDecision,
  { title: string; description: string; confirm: string; success: string }
> = {
  approved: {
    title: 'Approve this proposal?',
    description:
      'Approving records your weight toward the required quorum. The proposal executes only once the threshold is met.',
    confirm: 'Confirm approval',
    success: 'Approval recorded',
  },
  rejected: {
    title: 'Reject this proposal?',
    description:
      'Rejecting declines this agent-proposed transaction and is written to the approval audit trail.',
    confirm: 'Confirm rejection',
    success: 'Proposal rejected',
  },
};

/**
 * Multi-party proposal review widget.
 *
 * Approval state is fetched and mutated through TanStack Query so every card
 * shares the same cache entry. Buttons are disabled while a decision is in
 * flight, once this reviewer has decided, when the proposal is no longer
 * pending, or when the user's role cannot approve proposals.
 */
export function ProposalReviewCard({
  proposal,
  canReview = true,
  reviewer,
  xdr,
  className,
  onDecisionRecorded,
}: ProposalReviewCardProps) {
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const { isConnected, signTransaction } = useStellarWallet();

  const [confirmAction, setConfirmAction] = useState<ReviewDecision | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Destructive confirmations place focus on Cancel, never on the confirm action.
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const snapshotQuery = useQuery({
    queryKey: approvalQueryKeys.proposal(proposal.id),
    queryFn: () => fetchProposalApprovalState(proposal.id),
    initialData: snapshotFromProposal(proposal),
    staleTime: 30_000,
  });

  const snapshot = snapshotQuery.data;
  const progress = useMemo(() => approvalProgress(snapshot), [snapshot]);

  const activeReviewer: ApprovalReviewer =
    reviewer ??
    (currentUser.data
      ? {
          id: currentUser.data.id,
          name: currentUser.data.name,
          avatar: currentUser.data.avatar,
        }
      : { id: 'usr_signed_in', name: 'You' });

  const roleAllowsReview = currentUser.data
    ? canReviewProposal(currentUser.data.role)
    : true;
  const authorized = canReview && roleAllowsReview;

  const myDecision = snapshot.approvals.find(
    (approval) => approval.userId === activeReviewer.id,
  )?.decision;
  const hasDecided = myDecision === 'approved' || myDecision === 'rejected';
  const isPending = snapshot.status === 'pending';

  const mutation = useMutation({
    mutationFn: (decision: ReviewDecision) =>
      submitProposalDecision({
        proposalId: proposal.id,
        decision,
        reviewer: activeReviewer,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(approvalQueryKeys.proposal(proposal.id), next);
      onDecisionRecorded?.(next);
    },
  });

  const busy = mutation.isPending || isSigning;
  const canAct = authorized && isPending && !hasDecided && !busy;

  const status = proposalStatus(snapshot.status);
  const dialogCopy = confirmAction ? DECISION_COPY[confirmAction] : null;

  const openConfirmation = (action: ReviewDecision) => {
    if (!canAct) return;
    setActionError(null);
    setConfirmAction(action);
  };

  const closeConfirmation = () => {
    if (busy) return;
    setConfirmAction(null);
    setActionError(null);
  };

  const handleConfirm = async () => {
    if (!confirmAction || busy) return;
    setActionError(null);

    try {
      if (confirmAction === 'approved' && xdr) {
        if (!isConnected) {
          throw new Error(
            'Freighter wallet is not connected. Reconnect the extension and try again.',
          );
        }
        setIsSigning(true);
        const signedXdr = await signTransaction(xdr);
        if (!signedXdr) {
          throw new Error('Signing was cancelled or failed in the wallet.');
        }
      }

      const next = await mutation.mutateAsync(confirmAction);
      toast.success(DECISION_COPY[confirmAction].success, {
        description:
          confirmAction === 'approved'
            ? `${approvalProgress(next).approved} of ${next.requiredApprovals} approvals collected.`
            : 'The rejection has been added to the audit trail.',
      });
      setConfirmAction(null);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'The decision could not be recorded. Please try again.';
      setActionError(message);
      toast.error(message);
    } finally {
      setIsSigning(false);
    }
  };

  const disabledReason = !authorized
    ? 'Your role cannot approve or reject proposals.'
    : !isPending
      ? 'This proposal is no longer pending.'
      : hasDecided
        ? `You already ${myDecision} this proposal.`
        : undefined;

  // These regions live on the card, not inside the dialog: they are mounted
  // before the decision arrives and keep announcing after the dialog closes.
  const decisionAnnouncement = hasDecided
    ? `Your ${myDecision} decision is recorded for ${proposal.title}. ${progress.approved} of ${progress.required} approvals collected.`
    : '';
  const dialogAnnouncement = isSigning
    ? 'Waiting for wallet signature.'
    : mutation.isPending
      ? 'Submitting your decision.'
      : `Reviewing ${confirmAction ?? 'proposal'} decision for ${proposal.title}.`;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <ApprovalStatusLiveRegion message={decisionAnnouncement} />
      <ApprovalStatusLiveRegion
        message={actionError ? `Decision failed: ${actionError}` : ''}
        assertive
      />
      <CardContent className="pt-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{proposal.title}</p>
              <Badge variant={status.variant} size="sm">
                {status.label}
              </Badge>
              <Badge variant="outline" size="sm" className="capitalize">
                {proposal.kind}
              </Badge>
              <RiskBadge score={proposal.riskScore} showScore />
              {hasDecided && (
                <Badge
                  variant={myDecision === 'approved' ? 'success' : 'danger'}
                  size="sm"
                >
                  You {myDecision}
                </Badge>
              )}
              {!authorized && (
                <Badge variant="neutral" size="sm">
                  View only
                </Badge>
              )}
            </div>
            <p className="max-w-prose text-xs leading-relaxed text-foreground-secondary">
              {proposal.description}
            </p>
            <p className="text-2xs text-foreground-muted">
              {proposal.agentName} · to {proposal.counterparty}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular font-display text-lg font-semibold">
              {formatCurrency(proposal.amount, proposal.asset, { compact: true })}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-2xs text-foreground-muted">
              <Clock className="h-3 w-3" aria-hidden />
              expires {formatRelativeTime(proposal.expiresAt)}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-foreground-secondary">
            <span>
              {progress.approved} of {progress.required} approvals collected
              {progress.quorumMet && ' · quorum met'}
            </span>
            <span className="tabular">{progress.percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Approval progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-valuetext={`${progress.approved} of ${progress.required} approvals collected`}
            className="h-2 overflow-hidden rounded-full bg-surface-secondary"
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-slow ease-astroid',
                progress.quorumMet ? 'bg-success' : 'bg-gold',
              )}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-2xs text-foreground-muted">
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {progress.approved} approved
            </span>
            <span className="inline-flex items-center gap-1 text-danger">
              <X className="h-3 w-3" aria-hidden />
              {progress.rejected} rejected
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {progress.remaining} remaining
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="flex -space-x-2">
              {snapshot.approvals.map((decisionEntry) => (
                <Avatar
                  key={decisionEntry.id}
                  name={decisionEntry.userName}
                  src={decisionEntry.userAvatar}
                  size="xs"
                  className="ring-2 ring-surface"
                />
              ))}
            </div>
            <span className="text-2xs text-foreground-secondary">
              {snapshotQuery.isFetching
                ? 'Syncing approval state…'
                : `Last updated ${formatDateTime(snapshot.updatedAt)}`}
            </span>
          </div>

          {snapshotQuery.isError && (
            <p role="alert" className="text-2xs font-medium text-danger">
              Approval state could not be refreshed.{' '}
              <button
                type="button"
                onClick={() => void snapshotQuery.refetch()}
                className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Retry
              </button>
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex-wrap justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="gold"
            size="sm"
            leftIcon={<Check className="h-4 w-4" aria-hidden />}
            disabled={!canAct}
            title={disabledReason}
            aria-label={
              disabledReason
                ? `Approve unavailable: ${disabledReason}`
                : 'Approve proposal'
            }
            onClick={() => openConfirmation('approved')}
          >
            Approve
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<X className="h-4 w-4" aria-hidden />}
            disabled={!canAct}
            title={disabledReason}
            aria-label={
              disabledReason
                ? `Reject unavailable: ${disabledReason}`
                : 'Reject proposal'
            }
            onClick={() => openConfirmation('rejected')}
          >
            Reject
          </Button>
        </div>
        {disabledReason && (
          <p className="text-2xs text-foreground-muted">{disabledReason}</p>
        )}
      </CardFooter>

      <Dialog
        open={confirmAction !== null}
        onClose={closeConfirmation}
        title={dialogCopy?.title}
        description={dialogCopy?.description}
        size="md"
        initialFocusRef={cancelButtonRef}
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={cancelButtonRef}
              type="button"
              variant="outline"
              onClick={closeConfirmation}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirmAction === 'rejected' ? 'danger' : 'gold'}
              loading={busy}
              onClick={() => void handleConfirm()}
            >
              {dialogCopy?.confirm}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <ApprovalStatusLiveRegion message={dialogAnnouncement} />

          <dl className="grid gap-x-4 gap-y-3 rounded-card border border-border bg-surface-secondary/40 p-4 text-xs sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-2xs uppercase tracking-wide text-foreground-muted">
                Recipient
              </dt>
              <dd
                className="mt-0.5 truncate font-medium text-foreground"
                title={proposal.counterparty}
              >
                {proposal.counterparty}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-foreground-muted">
                Amount
              </dt>
              <dd className="tabular mt-0.5 font-medium text-foreground">
                {formatCurrency(proposal.amount, proposal.asset)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-2xs uppercase tracking-wide text-foreground-muted">
                Agent
              </dt>
              <dd className="mt-0.5 truncate font-medium text-foreground">
                {proposal.agentName}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-foreground-muted">
                Quorum
              </dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {progress.approved} of {progress.required} approvals
              </dd>
            </div>
          </dl>

          {proposal.riskScore >= 70 && (
            <p className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger-soft/40 p-3 text-2xs text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                High-risk proposal (score {proposal.riskScore}). Double-check the
                recipient and amount before confirming.
              </span>
            </p>
          )}

          {confirmAction === 'approved' && xdr && (
            <p className="flex items-start gap-2 rounded-card border border-border bg-surface p-3 text-2xs text-foreground-secondary">
              <ShieldAlert
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold"
                aria-hidden
              />
              <span>
                {isConnected
                  ? 'Your connected Freighter wallet will be asked to sign the transaction before the approval is recorded.'
                  : 'This approval requires a wallet signature. Connect Freighter to continue.'}
              </span>
            </p>
          )}

          {actionError && (
            <p className="text-xs font-medium text-danger">
              {actionError}
            </p>
          )}
        </div>
      </Dialog>
    </Card>
  );
}

export default ProposalReviewCard;
