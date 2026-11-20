'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ShieldCheck, Wallet } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { useProposalApproval } from '@/hooks/useProposalApproval';
import { useStellarWallet } from '@/hooks/useStellarWallet';
import { useStellarFeeEstimate } from '@/hooks/useStellarFeeEstimate';
import { FeeBadge } from '@/features/wallet/components/FeeBadge';
import type { LocalApprovalDecision } from '@/stores/proposal-approval-store';
import { cn } from '@/lib/cn';
import { formatCurrency, formatRelativeTime } from '@/lib/format';
import type { Proposal } from '@/types/domain';

export interface ProposalApprovalConfirmDialogProps {
  proposal: Proposal;
  /** Which decision the user initiated from the card: approve or reject. */
  action: LocalApprovalDecision | null;
  open: boolean;
  onClose: () => void;
  /**
   * Optional transaction envelope to sign with the connected Freighter wallet
   * before an approval is recorded. Omitted in mock mode, where decisions are
   * recorded without an on-chain signature.
   */
  xdr?: string;
  className?: string;
}

/**
 * Guard rail for multi-party approvals: a confirmation dialog that restates the
 * proposal metadata (recipient, amount, agent, risk) and requires an explicit
 * confirm before the decision is recorded. When an XDR envelope is supplied the
 * approval round-trips through the connected Freighter wallet first, with
 * loading, success and rejection states surfaced inline and via toasts.
 */
export function ProposalApprovalConfirmDialog({
  proposal,
  action,
  open,
  onClose,
  xdr,
  className,
}: ProposalApprovalConfirmDialogProps) {
  const { approve, reject, requestChanges, decision, error, isProcessing } =
    useProposalApproval(proposal);
  const { isConnected, signTransaction } = useStellarWallet();
  const feeEstimate = useStellarFeeEstimate();

  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  // Synchronous double-submit guard: `busy` comes from React state, so two
  // clicks in the same tick would both observe `false` before the re-render.
  const submitGuardRef = useRef(false);
  // Safe default focus target for a destructive confirmation.
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const isApprove = action === 'approved';
  const isRequestChanges = action === 'changes_requested';
  const busy = isProcessing || isSigning;

  // Reset transient signing state whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setSignError(null);
      setIsSigning(false);
    }
  }, [open, action]);

  const handleConfirm = async () => {
    if (!action || busy || submitGuardRef.current) return;
    submitGuardRef.current = true;
    setSignError(null);

    try {
      // Optional wallet signature round-trip before the decision is recorded.
      if (isApprove && xdr) {
        if (!isConnected) {
          const message =
            'Freighter wallet is not connected. Reconnect the extension and try again.';
          setSignError(message);
          toast.error(message);
          return;
        }
        setIsSigning(true);
        try {
          const signedXdr = await signTransaction(xdr);
          if (!signedXdr) {
            // Hook already surfaced its own error; treat as a cancelled signing.
            const message = 'Signing was cancelled or failed in the wallet.';
            setSignError(message);
            toast.error(message);
            return;
          }
          toast.success('Transaction signed with Freighter');
        } catch (error) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : 'Wallet signing failed. The decision was not recorded.';
          setSignError(message);
          toast.error(message);
          return;
        } finally {
          setIsSigning(false);
        }
      }

      let succeeded = false;
      if (isApprove) {
        succeeded = await approve();
      } else if (isRequestChanges) {
        succeeded = await requestChanges();
      } else {
        succeeded = await reject();
      }
      if (succeeded) onClose();
    } catch {
      // Decision failures already toast inside the approval hook.
    } finally {
      submitGuardRef.current = false;
    }
  };

  const handleCancel = () => {
    if (busy) return;
    onClose();
  };

  const quorumLabel = `${proposal.approvals.filter((a) => a.decision === 'approved').length} of ${proposal.requiredApprovals} approvals collected`;

  return (
    <Dialog
      open={open && action !== null}
      onClose={handleCancel}
      title={
        isApprove
          ? 'Approve this proposal?'
          : isRequestChanges
            ? 'Request changes?'
            : 'Reject this proposal?'
      }
      description={
        isApprove
          ? 'Review the details below. Approving records your weight toward the required quorum.'
          : isRequestChanges
            ? 'Return this proposal to its author with a request for revisions.'
            : 'Review the details below. Rejecting declines this agent-proposed transaction.'
      }
      size="md"
      className={className}
      initialFocusRef={cancelButtonRef}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={busy}
            aria-label={
              isApprove
                ? 'Cancel approval'
                : isRequestChanges
                  ? 'Cancel request changes'
                  : 'Cancel rejection'
            }
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isApprove ? 'gold' : isRequestChanges ? 'secondary' : 'danger'}
            onClick={() => void handleConfirm()}
            loading={busy}
            aria-label={
              isApprove
                ? `Confirm approval of ${proposal.title}`
                : isRequestChanges
                  ? `Request changes to ${proposal.title}`
                  : `Confirm rejection of ${proposal.title}`
            }
            aria-describedby="proposal-confirm-risk-note"
          >
            {isApprove
              ? 'Confirm approval'
              : isRequestChanges
                ? 'Request changes'
                : 'Confirm rejection'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4" aria-busy={busy}>
        {/* Screen reader context ------------------------------------------- */}
        <p role="status" aria-live="polite" className="sr-only">
          {busy
            ? isSigning
              ? 'Waiting for wallet signature.'
              : 'Recording your decision.'
            : `Reviewing ${isApprove ? 'approval' : 'rejection'} of proposal ${proposal.title}.`}
        </p>

        {/* Proposal summary ------------------------------------------------- */}
        <div className="flex items-center justify-between rounded-card border border-border bg-surface-secondary/40 px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-foreground-secondary">
            Network fee estimate
          </span>
          <FeeBadge feeEstimate={feeEstimate} showDetails />
        </div>

        <dl className="grid gap-x-4 gap-y-3 rounded-card border border-border bg-surface-secondary/40 p-4 text-xs sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-2xs uppercase tracking-wide text-foreground-muted">Recipient</dt>
            <dd className="mt-0.5 truncate font-medium text-foreground" title={proposal.counterparty}>
              {proposal.counterparty}
            </dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-wide text-foreground-muted">Amount</dt>
            <dd className="mt-0.5 font-medium tabular text-foreground">
              {formatCurrency(proposal.amount, proposal.asset)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-2xs uppercase tracking-wide text-foreground-muted">Agent</dt>
            <dd className="mt-0.5 truncate font-medium text-foreground">{proposal.agentName}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-wide text-foreground-muted">Risk score</dt>
            <dd className="mt-0.5">
              <RiskBadge score={proposal.riskScore} showScore />
            </dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-wide text-foreground-muted">Quorum</dt>
            <dd className="mt-0.5 font-medium text-foreground">{quorumLabel}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-wide text-foreground-muted">Expires</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {formatRelativeTime(proposal.expiresAt)}
            </dd>
          </div>
        </dl>

        {/* Signing context -------------------------------------------------- */}
        {isApprove && (
          <div className="flex items-start gap-2 rounded-card border border-border bg-surface p-3 text-2xs text-foreground-secondary">
            {xdr ? (
              isConnected ? (
                <>
                  <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                  <span>
                    Freighter wallet connected — confirming will prompt you to sign the
                    transaction envelope before the approval is recorded.
                  </span>
                </>
              ) : (
                <>
                  <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                  <span>
                    This approval requires a wallet signature, but no Freighter wallet is
                    connected. Connect the extension to sign.
                  </span>
                </>
              )
            ) : (
              <>
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
                <span>
                  Recording this approval adds your weight to the quorum. An on-chain
                  signature is requested separately once the threshold is met.
                </span>
              </>
            )}
          </div>
        )}

        {proposal.riskScore >= 70 && (
          <p
            id="proposal-confirm-risk-note"
            className={cn(
              'flex items-start gap-2 rounded-card border border-danger/30 bg-danger-soft/40 p-3 text-2xs text-danger',
            )}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              High-risk proposal (score {proposal.riskScore}). Double-check the recipient and
              amount before confirming.
            </span>
          </p>
        )}

        {/* Outcome / error states ------------------------------------------- */}
        {(signError || error) && (
          <p role="alert" className="text-xs font-medium text-danger">
            {signError ?? error}
          </p>
        )}
        {decision && (
          <p role="status" className="text-xs font-medium text-success">
            Your decision ({decision}) has been recorded.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" size="sm" className="capitalize">
            {proposal.kind} approval
          </Badge>
          {proposal.riskScore >= 70 && (
            <Badge variant="danger" size="sm">
              High risk
            </Badge>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export default ProposalApprovalConfirmDialog;
