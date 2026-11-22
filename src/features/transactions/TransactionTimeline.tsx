'use client';

import { useId, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock3,
  Globe,
  Loader2,
  Send,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import {
  describeTransactionTimeline,
  resolveTransactionTimeline,
  type ResolvedTransactionStage,
  type TransactionStageId,
  type TransactionStageStatus,
  type TransactionTimelineInput,
} from './transactionTimeline';

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

const STAGE_ICON: Record<TransactionStageId, LucideIcon> = {
  submission: Send,
  network: Globe,
  approval: Users,
  settlement: BadgeCheck,
};

interface StageStatusMeta {
  label: string;
  Icon: LucideIcon;
  /** Node treatment: border + fill + icon color from tokens. */
  node: string;
  /** Connector below the node. */
  connector: string;
  badge: 'success' | 'info' | 'danger' | 'neutral';
  spin?: boolean;
}

const STATUS_META: Record<TransactionStageStatus, StageStatusMeta> = {
  completed: {
    label: 'Completed',
    Icon: Check,
    node: 'border-success bg-success-soft text-success',
    connector: 'bg-success/50',
    badge: 'success',
  },
  active: {
    label: 'In progress',
    Icon: Loader2,
    node: 'border-info bg-info-soft text-info ring-2 ring-info/20',
    connector: 'bg-info/50',
    badge: 'info',
    spin: true,
  },
  error: {
    label: 'Failed',
    Icon: AlertTriangle,
    node: 'border-danger bg-danger-soft text-danger ring-2 ring-danger/20',
    connector: 'bg-danger/50',
    badge: 'danger',
  },
  pending: {
    label: 'Pending',
    Icon: Clock3,
    node: 'border-border-strong bg-surface-secondary text-foreground-muted',
    connector: 'bg-border',
    badge: 'neutral',
  },
};

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

export interface TransactionTimelineProps extends TransactionTimelineInput {
  /** Hash of the submitted/confirmed transaction, when one exists. */
  transactionHash?: string | null;
  /** Signed envelope in base64 XDR, shown when a stage is expanded. */
  xdr?: string | null;
  /** Chooses the Stellar Expert network for the explorer link. */
  network?: 'public' | 'testnet';
  /** Heading for the timeline region. */
  title?: string;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function explorerUrl(hash: string, network: 'public' | 'testnet'): string {
  return `https://stellar.expert/explorer/${network}/tx/${encodeURIComponent(hash)}`;
}

function stageSummary(
  step: ResolvedTransactionStage,
  props: TransactionTimelineInput,
  transactionHash?: string | null,
): string {
  if (step.id === 'network') {
    return props.state === 'submitted' || props.state === 'propagating'
      ? 'Propagation pending — waiting for validator confirmation.'
      : 'Transaction accepted by the network.';
  }

  if (step.id === 'approval') {
    const progress = props.approvalProgress;
    return progress && progress.required > 0
      ? `${progress.collected} of ${progress.required} required signatures collected.`
      : 'Collecting signatures from the required signers.';
  }

  if (step.id === 'settlement') {
    return props.state === 'settled'
      ? 'Included in a ledger; funds have moved.'
      : 'Waiting for the transaction to be included in a ledger.';
  }

  return transactionHash
    ? 'Transaction envelope broadcast to Horizon.'
    : 'Signed envelope is queued for broadcast to Horizon.';
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Visual timeline for reviewing Stellar transaction submission and XDR signing.
 *
 * Stages run sequentially from submission to settlement. Each stage exposes a
 * text status alongside its icon and color, the active/error stage is marked
 * `aria-current="step"`, and expanding a stage reveals its transaction hash and
 * raw XDR. A polite live region announces every lifecycle change for screen
 * reader users. Long labels, hashes, and XDR wrap instead of clipping at any
 * viewport width.
 */
export function TransactionTimeline({
  transactionHash,
  xdr,
  network = 'testnet',
  title = 'Transaction lifecycle',
  className,
  ...input
}: TransactionTimelineProps) {
  const steps = resolveTransactionTimeline(input);
  const announcement = describeTransactionTimeline(input);
  const baseId = useId();
  const [expandedStage, setExpandedStage] = useState<TransactionStageId | null>(null);
  const failed = input.state === 'failed';

  return (
    <section
      className={cn(
        'rounded-card border border-border bg-surface-primary p-5 shadow-soft-1',
        className,
      )}
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Badge variant={failed ? 'danger' : input.state === 'settled' ? 'success' : 'info'} size="sm">
          {failed ? 'Failed' : input.state === 'settled' ? 'Settled' : 'In progress'}
        </Badge>
      </div>

      <p className="mt-2 break-words text-2xs text-foreground-secondary">{announcement}</p>

      {/* Announced on every lifecycle change without repeating the visible copy. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      <ol className="mt-4" aria-label={`${title} steps`}>
        {steps.map((step, index) => {
          const meta = STATUS_META[step.status];
          const StageIcon = STAGE_ICON[step.id];
          const StatusIcon = meta.Icon;
          const isLast = index === steps.length - 1;
          const expandable = step.status !== 'pending';
          const isExpanded = expandable && expandedStage === step.id;
          const panelId = `${baseId}-${step.id}-details`;

          const header = (
            <>
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                  meta.node,
                )}
                aria-hidden
              >
                <StageIcon className="h-3 w-3" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-words text-xs font-medium text-foreground">
                    <span className="sm:hidden">{step.shortLabel}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </span>
                  <Badge variant={meta.badge} size="sm">
                    <StatusIcon
                      className={cn('h-3 w-3', meta.spin && 'animate-spin')}
                      aria-hidden
                    />
                    {meta.label}
                  </Badge>
                </span>
                <span className="mt-1 block break-words text-2xs text-foreground-muted">
                  {step.description}
                </span>
              </span>

              {expandable && (
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-foreground-muted transition-transform duration-base ease-astroid',
                    isExpanded && 'rotate-180',
                  )}
                  aria-hidden
                />
              )}
            </>
          );

          return (
            <li
              key={step.id}
              aria-current={step.isCurrent ? 'step' : undefined}
              className={cn('relative flex gap-3', !isLast && 'pb-5')}
            >
              {!isLast && (
                <span
                  aria-hidden
                  className={cn('absolute left-4 top-6 bottom-0 w-px', meta.connector)}
                />
              )}

              {expandable ? (
                <button
                  type="button"
                  onClick={() => setExpandedStage(isExpanded ? null : step.id)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  className={cn(
                    'flex w-full min-w-0 items-start gap-3 rounded-sm text-left',
                    FOCUS_RING,
                  )}
                >
                  {header}
                </button>
              ) : (
                <div className="flex w-full min-w-0 items-start gap-3">{header}</div>
              )}

              {isExpanded && (
                <div
                  id={panelId}
                  className="ml-8 mt-3 w-full min-w-0 space-y-2 rounded-sm border border-border bg-surface-secondary/30 p-3"
                >
                  <p className="break-words text-2xs text-foreground-secondary">
                    {stageSummary(step, input, transactionHash)}
                  </p>

                  <dl className="space-y-2">
                    <div className="min-w-0">
                      <dt className="text-2xs font-medium text-foreground-muted">
                        Transaction hash
                      </dt>
                      <dd className="mt-1 min-w-0 break-all font-mono text-2xs text-foreground">
                        {transactionHash ? (
                          <>
                            <span className="break-all">{transactionHash}</span>{' '}
                            <a
                              href={explorerUrl(transactionHash, network)}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                'inline-block font-medium text-gold-strong underline-offset-2 hover:underline',
                                FOCUS_RING,
                              )}
                            >
                              View on Stellar Expert
                            </a>
                          </>
                        ) : (
                          <span className="font-sans text-foreground-muted">
                            No transaction hash yet — the envelope has not been submitted.
                          </span>
                        )}
                      </dd>
                    </div>

                    <div className="min-w-0">
                      <dt className="text-2xs font-medium text-foreground-muted">Raw XDR</dt>
                      <dd className="mt-1 min-w-0">
                        {xdr ? (
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xs bg-surface-secondary p-2 font-mono text-2xs text-foreground-secondary">
                            {xdr}
                          </pre>
                        ) : (
                          <span className="text-2xs text-foreground-muted">
                            No XDR payload attached to this transaction.
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {failed && input.failureMessage && (
        <p role="alert" className="mt-4 break-words text-2xs text-danger">
          {input.failureMessage}
        </p>
      )}
    </section>
  );
}
