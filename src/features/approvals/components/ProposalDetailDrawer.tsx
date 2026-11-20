'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Clock, FileCode2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { formatCurrency, formatRelativeTime } from '@/lib/format';
import { useProposalApproval } from '@/hooks/useProposalApproval';
import { useStellarWallet } from '@/hooks/useStellarWallet';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { Proposal } from '@/types/domain';

export interface ProposalDetailDrawerProps {
  proposal: Proposal;
  open: boolean;
  onClose: () => void;
}

export function ProposalDetailDrawer({ proposal, open, onClose }: ProposalDetailDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const submitGuard = useRef(false);
  const closeRef = useRef(onClose);
  const [activeAction, setActiveAction] = useState<'approved' | 'rejected' | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [xdrOpen, setXdrOpen] = useState(false);
  const { approve, reject, isProcessing, approvedWeight, requiredApprovals, isQuorumMet } =
    useProposalApproval(proposal);
  const { isConnected, signTransaction } = useStellarWallet();
  const busy = isProcessing || isSigning;

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Shared WCAG AA modal behaviour (focus trap, scroll lock, focus restore).
  // Escape is ignored while a decision is being signed/submitted so the user
  // cannot dismiss the drawer mid-transaction.
  useFocusTrap({
    active: open,
    containerRef: panelRef,
    onEscape: () => {
      if (!submitGuard.current) closeRef.current();
    },
  });

  const handleDecision = async (action: 'approved' | 'rejected') => {
    if (submitGuard.current || isProcessing || proposal.status !== 'pending') return;
    submitGuard.current = true;
    setActiveAction(action);
    try {
      if (action === 'approved' && proposal.xdr) {
        if (!isConnected) {
          toast.error('Connect Freighter to sign this transaction before approving.');
          return;
        }
        setIsSigning(true);
        const signedXdr = await signTransaction(proposal.xdr);
        if (!signedXdr) {
          toast.error('Signing was cancelled or failed. The proposal was not approved.');
          return;
        }
      }
      if (action === 'approved') await approve();
      else await reject();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to record this decision.');
    } finally {
      setIsSigning(false);
      setActiveAction(null);
      submitGuard.current = false;
    }
  };

  const approvalsCollected = proposal.approvals.filter((entry) => entry.decision === 'approved').length;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex justify-end" aria-live="off">
          <motion.button
            type="button"
            aria-label="Close proposal details"
            className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => !busy && onClose()}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative flex h-full w-full max-w-2xl flex-col border-l border-border bg-surface shadow-soft-3 outline-none"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
              <div className="min-w-0">
                <p className="text-2xs font-medium uppercase text-foreground-muted">Proposal review</p>
                <h2 id={titleId} className="mt-1 text-lg font-semibold text-foreground">{proposal.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={proposal.status === 'pending' ? 'warning' : 'neutral'} size="sm">
                    {proposal.status}
                  </Badge>
                  <RiskBadge score={proposal.riskScore} showScore />
                  <Badge variant="outline" size="sm" className="capitalize">{proposal.kind}</Badge>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} disabled={busy} aria-label="Close drawer">
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
              <p className="text-sm leading-relaxed text-foreground-secondary">{proposal.description}</p>
              <dl className="grid gap-x-5 gap-y-4 border-y border-border py-4 text-xs sm:grid-cols-2">
                <div><dt className="text-2xs uppercase text-foreground-muted">Amount</dt><dd className="mt-1 font-medium tabular text-foreground">{formatCurrency(proposal.amount, proposal.asset)}</dd></div>
                <div><dt className="text-2xs uppercase text-foreground-muted">Recipient</dt><dd className="mt-1 break-all font-medium text-foreground">{proposal.counterparty}</dd></div>
                <div><dt className="text-2xs uppercase text-foreground-muted">Agent</dt><dd className="mt-1 font-medium text-foreground">{proposal.agentName}</dd></div>
                <div><dt className="text-2xs uppercase text-foreground-muted">Created</dt><dd className="mt-1 font-medium text-foreground">{new Date(proposal.createdAt).toISOString()}</dd></div>
                <div><dt className="text-2xs uppercase text-foreground-muted">Expires</dt><dd className="mt-1 inline-flex items-center gap-1 font-medium text-foreground"><Clock className="h-3 w-3" aria-hidden />{formatRelativeTime(proposal.expiresAt)}</dd></div>
                <div><dt className="text-2xs uppercase text-foreground-muted">Risk score</dt><dd className="mt-1"><RiskBadge score={proposal.riskScore} showScore /></dd></div>
              </dl>

              <section aria-labelledby="proposal-quorum-heading" className="rounded-card border border-border bg-surface-secondary/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="proposal-quorum-heading" className="inline-flex items-center gap-2 text-xs font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-gold" aria-hidden />Quorum progress</h3>
                  <Badge variant={isQuorumMet ? 'success' : 'warning'} size="sm" dot>{isQuorumMet ? 'Quorum met' : 'Awaiting approvals'}</Badge>
                </div>
                <p className="mt-2 text-xs text-foreground-secondary">{approvedWeight} of {requiredApprovals} approvals collected</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={requiredApprovals} aria-valuenow={Math.min(approvedWeight, requiredApprovals)} aria-label="Approval quorum progress">
                  <div className="h-full bg-success transition-[width]" style={{ width: `${Math.min(100, (approvedWeight / Math.max(1, requiredApprovals)) * 100)}%` }} />
                </div>
              </section>

              {proposal.riskScore >= 70 && <p className="flex items-start gap-2 rounded-sm border border-danger/30 bg-danger-soft/40 p-3 text-xs text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />High risk. Confirm the recipient and amount against the transaction intent.</p>}

              <section className="overflow-hidden rounded-card border border-border" aria-labelledby="proposal-xdr-heading">
                <button type="button" id="proposal-xdr-heading" aria-expanded={xdrOpen} onClick={() => setXdrOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 bg-surface-secondary/30 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground"><FileCode2 className="h-4 w-4 text-gold" aria-hidden />Raw Stellar XDR</span>
                  <span className="text-2xs text-foreground-muted">{xdrOpen ? 'Hide payload' : 'Inspect payload'}</span>
                </button>
                {xdrOpen && (proposal.xdr ? (
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all border-t border-border bg-background-primary p-4 font-mono text-2xs leading-relaxed text-foreground-secondary" tabIndex={0}>{proposal.xdr}</pre>
                ) : (
                  <p className="border-t border-border p-4 text-xs text-foreground-muted">No XDR payload is attached to this proposal.</p>
                ))}
              </section>

              <p className="text-2xs text-foreground-muted">{approvalsCollected} of {proposal.requiredApprovals} approvals collected · created {formatRelativeTime(proposal.createdAt)}</p>
              {proposal.xdr && !isConnected && <p role="status" className="text-2xs text-warning">Connect Freighter before approving this signed transaction.</p>}
            </div>

            <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-5 py-4 sm:px-7">
              <Button type="button" variant="outline" onClick={() => void handleDecision('rejected')} loading={busy && activeAction === 'rejected'} disabled={proposal.status !== 'pending' || busy}>Reject</Button>
              <Button type="button" variant="gold" leftIcon={<Check className="h-4 w-4" aria-hidden />} onClick={() => void handleDecision('approved')} loading={busy && activeAction === 'approved'} disabled={proposal.status !== 'pending' || busy}>Approve</Button>
            </footer>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}