'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  FileCode2,
  Lock,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useStellarWallet } from '@/hooks/useStellarWallet';
import { useProposalApproval } from '@/hooks/useProposalApproval';
import { cn } from '@/lib/cn';
import { formatCurrency, formatRelativeTime } from '@/lib/format';
import type { Proposal } from '@/types/domain';

export interface ApprovalModalProps {
  proposal: Proposal | null;
  open: boolean;
  onClose: () => void;
  /** Optional transaction XDR envelope to review / sign */
  xdr?: string;
  /** Optional callback fired when decision is recorded */
  onDecisionComplete?: (decision: 'approved' | 'rejected') => void;
  className?: string;
}

/**
 * Accessible multi-party proposal review & approval workflow modal (WCAG AA).
 *
 * Implements:
 * - Focus trapping and restoration via `useFocusTrap`
 * - Escape key dismissal (with signing transaction protection)
 * - Radix-inspired dialog structure and portal mounting
 * - Descriptive `aria-labelledby`, `aria-describedby`, and `aria-controls`
 * - Polite live-region status announcements (`role="status" aria-live="polite"`)
 * - Explicit `aria-label` on all interactive controls (close, review, XDR toggle, copy, actions)
 * - Ordered keyboard navigation (Tab / Shift+Tab)
 */
export function ApprovalModal({
  proposal,
  open,
  onClose,
  xdr,
  onDecisionComplete,
  className,
}: ApprovalModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const xdrRegionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [mounted, setMounted] = useState(false);
  const [xdrExpanded, setXdrExpanded] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [activeDecision, setActiveDecision] = useState<'approved' | 'rejected' | null>(
    null,
  );

  const { isConnected, signTransaction } = useStellarWallet();
  const fallbackProposal = useRef<Proposal>({
    id: 'placeholder',
    organizationId: '',
    transactionId: '',
    title: '',
    description: '',
    amount: 0,
    asset: 'USDC',
    agentName: '',
    counterparty: '',
    status: 'pending',
    kind: 'multisig',
    riskScore: 0,
    requiredApprovals: 1,
    approvals: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
  });

  const activeProposal = proposal ?? fallbackProposal.current;
  const {
    approve,
    reject,
    isProcessing,
    approvedWeight,
    requiredApprovals,
    isQuorumMet,
  } = useProposalApproval(activeProposal);

  const busy = isProcessing || isSigning;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Update screen-reader announcement when dialog opens or closes
  useEffect(() => {
    if (open && proposal) {
      setStatusMessage(
        `Reviewing proposal: ${proposal.title}. Total amount: ${formatCurrency(
          proposal.amount,
          proposal.asset,
        )}.`,
      );
    } else {
      setXdrExpanded(false);
      setActiveDecision(null);
      setIsSigning(false);
    }
  }, [open, proposal]);

  // Trap focus and support Escape dismissal
  useFocusTrap({
    active: open && mounted && Boolean(proposal),
    containerRef: panelRef,
    onEscape: () => {
      if (!busy) {
        onClose();
      }
    },
    initialFocusRef: cancelButtonRef,
  });

  const handleCopyXdr = async () => {
    const payload = xdr ?? proposal?.xdr;
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      toast.success('XDR copied to clipboard');
      setStatusMessage('Raw XDR payload copied to clipboard.');
    } catch {
      toast.error('Failed to copy XDR to clipboard');
    }
  };

  const handleToggleXdr = () => {
    setXdrExpanded((prev) => {
      const next = !prev;
      setStatusMessage(
        next
          ? 'Raw Stellar XDR payload expanded.'
          : 'Raw Stellar XDR payload collapsed.',
      );
      return next;
    });
  };

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!proposal || busy || proposal.status !== 'pending') return;

    setActiveDecision(decision);
    const envelope = xdr ?? proposal.xdr;

    try {
      if (decision === 'approved' && envelope) {
        if (!isConnected) {
          const msg =
            'Please connect Freighter to sign this transaction before approving.';
          toast.error(msg);
          setStatusMessage(msg);
          setActiveDecision(null);
          return;
        }

        setIsSigning(true);
        setStatusMessage('Requesting wallet signature with Freighter...');
        const signedXdr = await signTransaction(envelope);
        if (!signedXdr) {
          const msg = 'Signing was cancelled or failed in the wallet.';
          toast.error(msg);
          setStatusMessage(msg);
          setIsSigning(false);
          setActiveDecision(null);
          return;
        }
        setIsSigning(false);
        toast.success('Transaction signed successfully with Freighter');
      }

      setStatusMessage(`Recording your ${decision} decision...`);
      if (decision === 'approved') {
        await approve();
      } else {
        await reject();
      }

      toast.success(`Proposal ${decision} successfully`);
      setStatusMessage(`Proposal ${decision} successfully.`);
      onDecisionComplete?.(decision);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record decision.';
      toast.error(msg);
      setStatusMessage(`Error: ${msg}`);
    } finally {
      setIsSigning(false);
      setActiveDecision(null);
    }
  };

  if (!open || !mounted || !proposal) {
    return null;
  }

  const envelope = xdr ?? proposal.xdr;
  const approvalsCount = proposal.approvals.filter(
    (a) => a.decision === 'approved',
  ).length;
  const quorumProgressPct = Math.min(
    100,
    (approvedWeight / Math.max(1, requiredApprovals)) * 100,
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="presentation"
    >
      {/* Backdrop overlay */}
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity"
        onClick={() => !busy && onClose()}
        aria-hidden="true"
      />

      {/* Polite live region for screen-reader state announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      {/* Modal Dialog Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-card border border-border bg-surface shadow-soft-3 outline-none',
          className,
        )}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-surface-secondary text-gold">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="text-2xs font-semibold uppercase tracking-wider text-foreground-muted">
                Proposal Review & Approval
              </p>
            </div>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-foreground">
              {proposal.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge
                variant={proposal.status === 'pending' ? 'warning' : 'neutral'}
                size="sm"
              >
                {proposal.status}
              </Badge>
              <RiskBadge score={proposal.riskScore} showScore />
              <Badge variant="outline" size="sm" className="capitalize">
                {proposal.kind}
              </Badge>
            </div>
          </div>

          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Close approval review modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        {/* Content Body */}
        <div
          id={descriptionId}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5"
          aria-busy={busy}
        >
          <p className="text-xs leading-relaxed text-foreground-secondary">
            {proposal.description}
          </p>

          {/* Proposal Attributes Grid */}
          <dl className="grid gap-x-4 gap-y-3 rounded-card border border-border bg-surface-secondary/40 p-4 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-2xs uppercase tracking-wide text-foreground-muted">
                Amount
              </dt>
              <dd className="mt-0.5 tabular font-medium text-foreground">
                {formatCurrency(proposal.amount, proposal.asset)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-2xs uppercase tracking-wide text-foreground-muted">
                Recipient / Counterparty
              </dt>
              <dd
                className="mt-0.5 truncate font-medium text-foreground"
                title={proposal.counterparty}
              >
                {proposal.counterparty}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-2xs uppercase tracking-wide text-foreground-muted">
                Requesting Agent
              </dt>
              <dd className="mt-0.5 truncate font-medium text-foreground">
                {proposal.agentName}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-foreground-muted">
                Expires
              </dt>
              <dd className="mt-0.5 inline-flex items-center gap-1 font-medium text-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatRelativeTime(proposal.expiresAt)}
              </dd>
            </div>
          </dl>

          {/* Multi-party Quorum Progress */}
          <section
            aria-labelledby="quorum-section-heading"
            className="rounded-card border border-border bg-surface-secondary/30 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="quorum-section-heading"
                className="inline-flex items-center gap-2 text-xs font-semibold text-foreground"
              >
                <ShieldCheck className="h-4 w-4 text-gold" aria-hidden="true" />
                Multi-Party Quorum Progress
              </h3>
              <Badge variant={isQuorumMet ? 'success' : 'warning'} size="sm" dot>
                {isQuorumMet ? 'Quorum Met' : 'Awaiting Signatures'}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-foreground-secondary">
              {approvedWeight} of {requiredApprovals} required approvals collected (
              {approvalsCount} reviewers signed)
            </p>
            <div
              className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={Math.round(quorumProgressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${approvedWeight} of ${requiredApprovals} approvals`}
              aria-label="Quorum progress bar"
            >
              <div
                className="h-full bg-success transition-all duration-300"
                style={{ width: `${quorumProgressPct}%` }}
              />
            </div>
          </section>

          {/* High Risk Advisory */}
          {proposal.riskScore >= 70 && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger-soft/40 p-3 text-xs text-danger"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                High-risk proposal (score {proposal.riskScore}). Verify the destination
                address and transaction intent before authorizing.
              </span>
            </div>
          )}

          {/* XDR Inspection Section */}
          {envelope ? (
            <section
              className="overflow-hidden rounded-card border border-border"
              aria-label="Stellar transaction XDR details"
            >
              <div className="flex items-center justify-between gap-2 bg-surface-secondary/40 px-4 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 p-0 text-xs font-semibold text-foreground hover:bg-transparent"
                  aria-expanded={xdrExpanded}
                  aria-controls={xdrRegionId}
                  aria-label={
                    xdrExpanded
                      ? 'Collapse raw Stellar XDR payload'
                      : 'Expand raw Stellar XDR payload'
                  }
                  onClick={handleToggleXdr}
                >
                  <FileCode2 className="h-4 w-4 text-gold" aria-hidden="true" />
                  <span>Stellar XDR Envelope</span>
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-2xs"
                    onClick={handleCopyXdr}
                    aria-label="Copy raw XDR to clipboard"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy XDR
                  </Button>
                </div>
              </div>

              {xdrExpanded && (
                <div
                  id={xdrRegionId}
                  className="border-t border-border bg-background-primary p-3"
                >
                  <pre
                    tabIndex={0}
                    aria-label="Raw base64 Stellar transaction envelope"
                    className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-surface p-3 font-mono text-2xs text-foreground-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {envelope}
                  </pre>
                  {isConnected ? (
                    <p className="gap-1.5 mt-2 flex items-center text-2xs text-success">
                      <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                      Freighter connected — approval will prompt for signature.
                    </p>
                  ) : (
                    <p className="gap-1.5 mt-2 flex items-center text-2xs text-warning">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      Freighter extension required for signing on-chain transactions.
                    </p>
                  )}
                </div>
              )}
            </section>
          ) : (
            <p className="text-2xs text-foreground-muted">
              No on-chain transaction envelope is attached to this proposal.
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-6 py-4">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
            aria-label="Cancel proposal review"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={busy || proposal.status !== 'pending'}
            loading={busy && activeDecision === 'rejected'}
            onClick={() => void handleDecision('rejected')}
            aria-label={`Reject proposal ${proposal.title}`}
          >
            Reject
          </Button>

          <Button
            type="button"
            variant="gold"
            disabled={busy || proposal.status !== 'pending'}
            loading={busy && activeDecision === 'approved'}
            leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
            onClick={() => void handleDecision('approved')}
            aria-label={`Approve proposal ${proposal.title}`}
          >
            Approve
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export default ApprovalModal;
