import type { Proposal } from '../../../types/domain';

/**
 * Transaction simulation preview for a pending proposal: what would change on
 * ledger, what it would cost, and how the policy engine evaluates it, shown to
 * human approvers before they sign off.
 *
 * This module is pure (no React, no network) so the mock simulation used when
 * `NEXT_PUBLIC_API_URL` is unset is deterministic and unit-testable. The live
 * call lives in `proposalSimulationApi.ts`.
 */

export type SimulationOutcome = 'passed' | 'warning' | 'failed';

/** Overall verdict: `clear` to approve, `review` with caveats, `blocked` must not be approved. */
export type SimulationVerdict = 'clear' | 'review' | 'blocked';

export interface SimulationStepResult {
  id: string;
  label: string;
  detail: string;
  outcome: SimulationOutcome;
}

export interface SimulationStateChange {
  account: string;
  /** Short role shown next to the account, e.g. "Treasury (source)". */
  role: string;
  asset: string;
  /** Balance before the transaction; null when the account is external/unknown. */
  before: number | null;
  /** Balance after the transaction; null when `before` is unknown. */
  after: number | null;
  /** Signed change applied by the transaction. */
  delta: number;
}

export interface SimulationFeeEstimate {
  operations: number;
  baseFeeStroops: number;
  /** Soroban resource fee; 0 for classic payments. */
  resourceFeeStroops: number;
  totalStroops: number;
  totalXlm: number;
}

export interface SimulationPolicyEvaluation {
  policyId: string;
  name: string;
  outcome: SimulationOutcome;
  detail: string;
}

export interface ProposalSimulation {
  proposalId: string;
  verdict: SimulationVerdict;
  steps: SimulationStepResult[];
  stateChanges: SimulationStateChange[];
  fee: SimulationFeeEstimate;
  policies: SimulationPolicyEvaluation[];
  simulatedAt: string;
}

export const STROOPS_PER_XLM = 10_000_000;
export const BASE_FEE_STROOPS = 100;

/** Policy thresholds mirrored from the mock policy simulator (`resources.simulatePolicy`). */
export const DUAL_APPROVAL_THRESHOLD = 5_000;
export const MAX_TRANSACTION_CEILING = 25_000;
export const HIGH_RISK_SCORE = 70;

/** Mock treasury balances the simulated source account holds before the transaction. */
export const MOCK_TREASURY_BALANCES: Record<string, number> = {
  USDC: 412_800,
  XLM: 1_250_000,
};
const MOCK_TREASURY_ACCOUNT = 'GTREASURY…ORG';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/** Most-severe-wins verdict across step outcomes. */
export function deriveVerdict(outcomes: SimulationOutcome[]): SimulationVerdict {
  if (outcomes.includes('failed')) return 'blocked';
  if (outcomes.includes('warning')) return 'review';
  return 'clear';
}

/** Most severe outcome in a list (`failed` > `warning` > `passed`). */
export function worstOutcome(outcomes: SimulationOutcome[]): SimulationOutcome {
  if (outcomes.includes('failed')) return 'failed';
  if (outcomes.includes('warning')) return 'warning';
  return 'passed';
}

export function estimateFee(operations: number, resourceFeeStroops = 0): SimulationFeeEstimate {
  const ops = Math.max(1, Math.floor(operations));
  const totalStroops = ops * BASE_FEE_STROOPS + Math.max(0, resourceFeeStroops);
  return {
    operations: ops,
    baseFeeStroops: BASE_FEE_STROOPS,
    resourceFeeStroops: Math.max(0, resourceFeeStroops),
    totalStroops,
    totalXlm: totalStroops / STROOPS_PER_XLM,
  };
}

/**
 * Deterministic simulation used in mock mode. Same input, same output — the
 * `now` clock is injectable so tests can pin `simulatedAt`.
 */
export function buildMockProposalSimulation(
  proposal: Pick<
    Proposal,
    'id' | 'amount' | 'asset' | 'counterparty' | 'riskScore' | 'requiredApprovals' | 'approvals' | 'xdr' | 'expiresAt' | 'status'
  >,
  now: Date = new Date(),
): ProposalSimulation {
  const amount = Math.max(0, proposal.amount);
  const asset = proposal.asset || 'XLM';
  const balanceBefore = MOCK_TREASURY_BALANCES[asset] ?? 0;
  const balanceAfter = balanceBefore - amount;
  const fee = estimateFee(1);

  const approved = proposal.approvals.filter((a) => a.decision === 'approved').length;
  const rejected = proposal.approvals.filter((a) => a.decision === 'rejected').length;
  const remaining = Math.max(0, proposal.requiredApprovals - approved);
  const expired = new Date(proposal.expiresAt).getTime() <= now.getTime();

  const policies: SimulationPolicyEvaluation[] = [
    {
      policyId: 'pol_max_txn',
      name: 'Maximum transaction ceiling',
      outcome: amount > MAX_TRANSACTION_CEILING ? 'failed' : 'passed',
      detail:
        amount > MAX_TRANSACTION_CEILING
          ? `${amount.toLocaleString('en-US')} ${asset} exceeds the ${MAX_TRANSACTION_CEILING.toLocaleString('en-US')} ceiling.`
          : `Within the ${MAX_TRANSACTION_CEILING.toLocaleString('en-US')} ${asset} ceiling.`,
    },
    {
      policyId: 'pol_approval_5k',
      name: 'Dual approval above 5,000',
      outcome: amount >= DUAL_APPROVAL_THRESHOLD ? 'warning' : 'passed',
      detail:
        amount >= DUAL_APPROVAL_THRESHOLD
          ? `Requires ${proposal.requiredApprovals} approvals before execution.`
          : 'Below the dual-approval threshold.',
    },
    {
      policyId: 'pol_risk_score',
      name: 'Agent risk score',
      outcome: proposal.riskScore >= HIGH_RISK_SCORE ? 'warning' : 'passed',
      detail: `Risk score ${proposal.riskScore}/100${proposal.riskScore >= HIGH_RISK_SCORE ? ' — above the high-risk threshold.' : '.'}`,
    },
  ];

  const steps: SimulationStepResult[] = [
    {
      id: 'decode',
      label: 'Decode transaction envelope',
      outcome: 'passed',
      detail: proposal.xdr
        ? 'XDR envelope decoded: 1 payment operation.'
        : 'No signed envelope yet; simulated from the proposal fields.',
    },
    {
      id: 'balance',
      label: 'Source account balance',
      outcome: balanceAfter < 0 ? 'failed' : balanceAfter < balanceBefore * 0.1 ? 'warning' : 'passed',
      detail:
        balanceAfter < 0
          ? `Insufficient ${asset}: needs ${amount.toLocaleString('en-US')}, holds ${balanceBefore.toLocaleString('en-US')}.`
          : `${balanceAfter.toLocaleString('en-US')} ${asset} remains after the payment.`,
    },
    {
      id: 'counterparty',
      label: 'Destination account',
      outcome: 'passed',
      detail: STELLAR_ADDRESS_RE.test(proposal.counterparty)
        ? 'Destination account exists and accepts the asset.'
        : `Resolved "${proposal.counterparty}" through the vendor directory.`,
    },
    {
      id: 'policy',
      label: 'Policy engine evaluation',
      outcome: worstOutcome(policies.map((p) => p.outcome)),
      detail: `${policies.filter((p) => p.outcome === 'passed').length} of ${policies.length} policies passed outright.`,
    },
    {
      id: 'quorum',
      label: 'Approval quorum',
      outcome: rejected > 0 || remaining > 0 ? 'warning' : 'passed',
      detail: [
        remaining > 0
          ? `${approved} of ${proposal.requiredApprovals} approvals collected; ${remaining} more needed.`
          : `Quorum met (${approved} of ${proposal.requiredApprovals}).`,
        rejected > 0 ? `${rejected} reviewer${rejected === 1 ? '' : 's'} rejected.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      id: 'expiry',
      label: 'Proposal validity window',
      outcome: expired ? 'failed' : 'passed',
      detail: expired ? 'The proposal has expired and cannot be executed.' : 'Proposal is within its validity window.',
    },
    {
      id: 'fee',
      label: 'Network fee estimate',
      outcome: 'passed',
      detail: `${fee.totalStroops} stroops (${fee.totalXlm.toFixed(7)} XLM) for ${fee.operations} operation.`,
    },
  ];

  const stateChanges: SimulationStateChange[] = [
    {
      account: MOCK_TREASURY_ACCOUNT,
      role: 'Treasury (source)',
      asset,
      before: balanceBefore,
      after: balanceAfter,
      delta: -amount,
    },
    {
      account: proposal.counterparty,
      role: 'Destination',
      asset,
      before: null,
      after: null,
      delta: amount,
    },
    {
      account: MOCK_TREASURY_ACCOUNT,
      role: 'Network fee',
      asset: 'XLM',
      before: MOCK_TREASURY_BALANCES.XLM ?? 0,
      after: (MOCK_TREASURY_BALANCES.XLM ?? 0) - fee.totalXlm,
      delta: -fee.totalXlm,
    },
  ];

  return {
    proposalId: proposal.id,
    verdict: deriveVerdict(steps.map((step) => step.outcome)),
    steps,
    stateChanges,
    fee,
    policies,
    simulatedAt: now.toISOString(),
  };
}
