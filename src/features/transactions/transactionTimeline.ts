/**
 * Pure state resolution for the Stellar transaction timeline.
 *
 * The UI only needs one input — the lifecycle state reported by the API (or
 * the signing flow) — and this module expands it into the sequential stages an
 * operator sees: submission, network validation, multi-party approval, and
 * final settlement. Keeping the rules here (rather than inside the component)
 * makes every edge case — a failure at a specific stage, a transaction still
 * propagating across the network, a settled transaction — unit-testable.
 */

/** Ordered stages of a Stellar transaction's life. */
export type TransactionStageId = 'submission' | 'network' | 'approval' | 'settlement';

/** How a single stage renders. */
export type TransactionStageStatus = 'completed' | 'active' | 'pending' | 'error';

/** Coarse lifecycle reported by the transaction service. */
export type TransactionTimelineState =
  | 'queued'
  | 'submitted'
  | 'propagating'
  | 'awaiting_approval'
  | 'settling'
  | 'settled'
  | 'failed';

/** Multi-party approval progress, e.g. 2 of 3 required signatures. */
export interface TransactionApprovalProgress {
  collected: number;
  required: number;
}

/** Input accepted by {@link resolveTransactionTimeline}. */
export interface TransactionTimelineInput {
  state: TransactionTimelineState;
  /**
   * Stage at which a failed transaction stopped. Defaults to `network`, which
   * is where Horizon rejections (bad sequence, insufficient fee, timeouts)
   * normally surface. Ignored unless `state` is `failed`.
   */
  failedAt?: TransactionStageId;
  /** Signature progress shown on the approval stage. */
  approvalProgress?: TransactionApprovalProgress;
  /** Human-readable failure detail, e.g. `tx_bad_seq`. */
  failureMessage?: string;
}

/** Static definition of one stage. */
export interface TransactionStage {
  id: TransactionStageId;
  /** Full label; may be long and must wrap rather than clip. */
  label: string;
  /** Compact label for very narrow viewports. */
  shortLabel: string;
  description: string;
}

/** A stage after lifecycle state has been applied. */
export interface ResolvedTransactionStage extends TransactionStage {
  /** Position in the sequence, starting at 0. */
  index: number;
  status: TransactionStageStatus;
  /** The stage an operator is currently waiting on (`aria-current="step"`). */
  isCurrent: boolean;
}

/** The four stages, in submission order. */
export const TRANSACTION_TIMELINE_STAGES: readonly TransactionStage[] = [
  {
    id: 'submission',
    label: 'Submitted to network',
    shortLabel: 'Submitted',
    description: 'Signed transaction broadcast to Horizon.',
  },
  {
    id: 'network',
    label: 'Network validation & propagation',
    shortLabel: 'Network',
    description: 'Validators accept the transaction and propagate it to the ledger.',
  },
  {
    id: 'approval',
    label: 'Multi-party approval',
    shortLabel: 'Approval',
    description: 'Required signers authorise the transaction above the threshold.',
  },
  {
    id: 'settlement',
    label: 'Final settlement',
    shortLabel: 'Settled',
    description: 'Transaction is included in a ledger and funds have moved.',
  },
];

/** Index of the stage that is currently in flight, per lifecycle state. */
const ACTIVE_STAGE_INDEX: Record<
  Exclude<TransactionTimelineState, 'failed' | 'settled'>,
  number
> = {
  queued: 0,
  submitted: 1,
  propagating: 1,
  awaiting_approval: 2,
  settling: 3,
};

export function transactionStageIndex(stageId: TransactionStageId): number {
  const index = TRANSACTION_TIMELINE_STAGES.findIndex((stage) => stage.id === stageId);
  // The stage list is exhaustive, so this is only reachable for malformed input.
  return index === -1 ? 0 : index;
}

export function transactionStage(stageId: TransactionStageId): TransactionStage {
  return TRANSACTION_TIMELINE_STAGES[transactionStageIndex(stageId)]!;
}

/**
 * Expand a lifecycle state into concrete stage states.
 *
 * - `settled` marks every stage completed.
 * - `failed` marks stages before `failedAt` completed, `failedAt` in error, and
 *   later stages pending — so the timeline never implies work that never ran.
 * - Any other state marks earlier stages completed and exactly one stage active.
 */
export function resolveTransactionTimeline(
  input: TransactionTimelineInput,
): ResolvedTransactionStage[] {
  const failedIndex =
    input.state === 'failed' ? transactionStageIndex(input.failedAt ?? 'network') : -1;
  const activeIndex =
    input.state === 'settled'
      ? TRANSACTION_TIMELINE_STAGES.length
      : input.state === 'failed'
        ? -1
        : ACTIVE_STAGE_INDEX[input.state];
  const currentIndex = input.state === 'failed' ? failedIndex : activeIndex;

  return TRANSACTION_TIMELINE_STAGES.map((stage, index) => {
    let status: TransactionStageStatus;
    if (input.state === 'failed') {
      status = index < failedIndex ? 'completed' : index === failedIndex ? 'error' : 'pending';
    } else if (index < activeIndex) {
      status = 'completed';
    } else if (index === activeIndex) {
      status = 'active';
    } else {
      status = 'pending';
    }

    return {
      ...stage,
      index,
      status,
      isCurrent: index === currentIndex && currentIndex >= 0,
    };
  });
}

/** Whether the transaction is still waiting for network propagation. */
export function isAwaitingNetworkPropagation(input: TransactionTimelineInput): boolean {
  return input.state === 'submitted' || input.state === 'propagating';
}

/**
 * One-sentence summary of the current state, used both visually and in the
 * `aria-live` region so screen readers announce every transition.
 */
export function describeTransactionTimeline(input: TransactionTimelineInput): string {
  if (input.state === 'failed') {
    const failedStage = transactionStage(input.failedAt ?? 'network');
    return input.failureMessage
      ? `Transaction failed during ${failedStage.label.toLowerCase()}: ${input.failureMessage}`
      : `Transaction failed during ${failedStage.label.toLowerCase()}.`;
  }

  if (input.state === 'settled') {
    return 'Transaction settled: all stages completed.';
  }

  if (input.state === 'settling') {
    return 'Approval complete; the transaction is settling on the Stellar network.';
  }

  if (input.state === 'awaiting_approval') {
    const progress = input.approvalProgress;
    const suffix =
      progress && progress.required > 0
        ? ` ${progress.collected} of ${progress.required} signatures collected.`
        : '';
    return `Network validated; awaiting multi-party approval.${suffix}`;
  }

  if (isAwaitingNetworkPropagation(input)) {
    return input.state === 'propagating'
      ? 'Transaction is propagating across the Stellar network; waiting for validator confirmation.'
      : 'Transaction submitted; validating on the Stellar network.';
  }

  return 'Transaction is queued for submission to the Stellar network.';
}
