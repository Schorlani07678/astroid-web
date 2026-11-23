'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { Proposal } from '@/types/domain';

import type { ReviewDecision } from '../approvalState';
import type {
  SimulationOutcome,
  SimulationVerdict,
} from '../simulation/proposalSimulation';
import {
  fetchProposalSimulation,
  simulationQueryKeys,
} from '../simulation/proposalSimulationApi';

export interface ProposalSimulationModalProps {
  proposal: Proposal;
  open: boolean;
  onClose: () => void;
  /**
   * Records the decision (signing + workflow API call). Resolves `true` when
   * recorded, which closes the modal; `false` keeps it open to show the error.
   */
  onDecide: (decision: ReviewDecision) => Promise<boolean>;
  /** Whether this reviewer may act on the proposal right now. */
  canAct: boolean;
  /** Explanation shown when `canAct` is false. */
  disabledReason?: string;
  /** Decision currently in flight, used for button spinners. */
  pendingDecision?: ReviewDecision | null;
  /** Last decision error, rendered inside the modal. */
  error?: string | null;
}

const OUTCOME_STYLE: Record<SimulationOutcome, { icon: LucideIcon; className: string; label: string }> = {
  passed: { icon: CheckCircle2, className: 'text-success', label: 'Passed' },
  warning: { icon: AlertTriangle, className: 'text-warning', label: 'Warning' },
  failed: { icon: XCircle, className: 'text-danger', label: 'Failed' },
};

const VERDICT_STYLE: Record<
  SimulationVerdict,
  { icon: LucideIcon; badge: 'success' | 'warning' | 'danger'; title: string; body: string; panel: string }
> = {
  clear: {
    icon: ShieldCheck,
    badge: 'success',
    title: 'Simulation clear',
    body: 'Every check passed. Approving is safe to proceed.',
    panel: 'border-success/40 bg-success-soft',
  },
  review: {
    icon: AlertTriangle,
    badge: 'warning',
    title: 'Review warnings before approving',
    body: 'The transaction would succeed, but one or more checks need your attention.',
    panel: 'border-warning/40 bg-warning-soft',
  },
  blocked: {
    icon: ShieldAlert,
    badge: 'danger',
    title: 'Simulation failed',
    body: 'This transaction would fail or breach policy. Approval is disabled.',
    panel: 'border-danger/40 bg-danger-soft',
  },
};

const formatDelta = (value: number, asset: string) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCurrency(Math.abs(value), asset, {
    decimals: asset === 'XLM' && Math.abs(value) < 1 ? 7 : undefined,
  })}`;

/**
 * Dry-run preview of a pending proposal's transaction for multi-party
 * approvers: step-by-step simulation outcomes, ledger state changes, network
 * fee estimate and policy evaluations, with approve/reject actions.
 *
 * Built on the shared `Dialog`, so focus is trapped inside while open, Escape
 * closes it, and focus returns to the trigger on close. Simulation data comes
 * from TanStack Query (mock data when `NEXT_PUBLIC_API_URL` is unset).
 */
export function ProposalSimulationModal({
  proposal,
  open,
  onClose,
  onDecide,
  canAct,
  disabledReason,
  pendingDecision = null,
  error,
}: ProposalSimulationModalProps) {
  const reduceMotion = useReducedMotion();
  const simulation = useQuery({
    queryKey: simulationQueryKeys.proposal(proposal.id),
    queryFn: () => fetchProposalSimulation(proposal),
    enabled: open,
    staleTime: 60_000,
  });

  const data = simulation.data;
  const verdict = data ? VERDICT_STYLE[data.verdict] : null;
  const busy = pendingDecision !== null;
  const blocked = data?.verdict === 'blocked';
  const approveDisabled = !canAct || busy || !data || blocked;
  const rejectDisabled = !canAct || busy;

  const close = () => {
    if (!busy) onClose();
  };

  const decide = async (decision: ReviewDecision) => {
    const ok = await onDecide(decision);
    if (ok) onClose();
  };

  const approveTitle = !canAct
    ? disabledReason
    : blocked
      ? 'Approval is disabled because the simulation failed.'
      : !data
        ? 'Wait for the simulation to finish.'
        : undefined;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Transaction simulation"
      description={`${proposal.title} · ${formatCurrency(proposal.amount, proposal.asset)} to ${proposal.counterparty}`}
      className="max-h-[90vh] overflow-y-auto"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-2xs text-foreground-muted">
            {!canAct && disabledReason
              ? disabledReason
              : data
                ? `Simulated ${formatDateTime(data.simulatedAt)}`
                : ' '}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={close} disabled={busy}>
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              leftIcon={<X className="h-4 w-4" aria-hidden />}
              loading={pendingDecision === 'rejected'}
              disabled={rejectDisabled}
              title={!canAct ? disabledReason : undefined}
              onClick={() => void decide('rejected')}
            >
              Reject
            </Button>
            <Button
              type="button"
              variant="gold"
              leftIcon={<Check className="h-4 w-4" aria-hidden />}
              loading={pendingDecision === 'approved'}
              disabled={approveDisabled}
              title={approveTitle}
              onClick={() => void decide('approved')}
            >
              Approve
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5" aria-busy={simulation.isPending}>
        <p role="status" aria-live="polite" className="sr-only">
          {simulation.isPending
            ? 'Running transaction simulation.'
            : verdict
              ? `${verdict.title}.`
              : ''}
        </p>

        {simulation.isPending && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}

        {simulation.isError && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-4">
            <p className="text-sm font-medium text-foreground">Simulation unavailable</p>
            <p className="mt-1 text-xs text-foreground-secondary">
              {simulation.error instanceof Error
                ? simulation.error.message
                : 'The simulation service did not respond.'}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => void simulation.refetch()}
            >
              Retry simulation
            </Button>
          </div>
        )}

        {data && verdict && (
          <>
            <div className={cn('flex items-start gap-3 rounded-lg border p-4', verdict.panel)}>
              <verdict.icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{verdict.title}</p>
                  <Badge variant={verdict.badge} size="sm" className="capitalize">
                    {data.verdict}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-foreground-secondary">{verdict.body}</p>
              </div>
            </div>

            <section aria-label="Simulation steps" className="space-y-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-foreground-muted">
                Simulation steps
              </h3>
              <ol className="space-y-1.5">
                {data.steps.map((step, index) => {
                  const style = OUTCOME_STYLE[step.outcome];
                  return (
                    <motion.li
                      key={step.id}
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduceMotion ? 0 : index * 0.05, duration: 0.2 }}
                      className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2"
                    >
                      <style.icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.className)} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">
                          {step.label}
                          <span className="sr-only">: {style.label}</span>
                        </p>
                        <p className="text-2xs text-foreground-secondary">{step.detail}</p>
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
            </section>

            <section aria-label="State changes" className="space-y-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-foreground-muted">
                State changes
              </h3>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[28rem] text-left text-2xs">
                  <thead className="bg-surface-secondary text-foreground-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Account</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Before</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Change</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stateChanges.map((change, i) => (
                      <tr key={`${change.account}-${change.role}-${i}`} className="border-t border-border">
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{change.role}</p>
                          <p className="max-w-[12rem] truncate text-foreground-muted">{change.account}</p>
                        </td>
                        <td className="tabular px-3 py-2 text-right text-foreground-secondary">
                          {change.before === null ? '—' : formatCurrency(change.before, change.asset)}
                        </td>
                        <td
                          className={cn(
                            'tabular px-3 py-2 text-right font-medium',
                            change.delta < 0 ? 'text-danger' : 'text-success',
                          )}
                        >
                          {formatDelta(change.delta, change.asset)}
                        </td>
                        <td
                          className={cn(
                            'tabular px-3 py-2 text-right',
                            change.after !== null && change.after < 0 ? 'text-danger' : 'text-foreground',
                          )}
                        >
                          {change.after === null
                            ? '—'
                            : formatCurrency(change.after, change.asset, {
                                decimals: change.asset === 'XLM' ? 7 : undefined,
                              })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <section aria-label="Fee estimate" className="space-y-2">
                <h3 className="text-2xs font-semibold uppercase tracking-wide text-foreground-muted">
                  Fee estimate
                </h3>
                <dl className="space-y-1 rounded-md border border-border p-3 text-2xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-foreground-secondary">Operations</dt>
                    <dd className="tabular text-foreground">{data.fee.operations}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-foreground-secondary">Base fee</dt>
                    <dd className="tabular text-foreground">{data.fee.baseFeeStroops} stroops / op</dd>
                  </div>
                  {data.fee.resourceFeeStroops > 0 && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-foreground-secondary">Resource fee</dt>
                      <dd className="tabular text-foreground">{data.fee.resourceFeeStroops} stroops</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 border-t border-border pt-1">
                    <dt className="font-medium text-foreground">Total</dt>
                    <dd className="tabular font-medium text-foreground">
                      {data.fee.totalXlm.toFixed(7)} XLM
                    </dd>
                  </div>
                </dl>
              </section>

              <section aria-label="Policy evaluations" className="space-y-2">
                <h3 className="text-2xs font-semibold uppercase tracking-wide text-foreground-muted">
                  Policy evaluations
                </h3>
                <ul className="space-y-1.5">
                  {data.policies.map((policy) => {
                    const style = OUTCOME_STYLE[policy.outcome];
                    return (
                      <li key={policy.policyId} className="flex items-start gap-2 text-2xs">
                        <style.icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', style.className)} aria-hidden />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {policy.name}
                            <span className="sr-only">: {style.label}</span>
                          </p>
                          <p className="text-foreground-secondary">{policy.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
