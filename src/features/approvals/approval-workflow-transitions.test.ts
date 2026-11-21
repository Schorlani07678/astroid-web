import assert from 'node:assert/strict';
import test from 'node:test';

import { useProposalApprovalStore } from '@/stores/proposal-approval-store';
import type { ApprovalDecision, Proposal, ProposalStatus } from '@/types/domain';

import {
  applyApprovalDecision,
  checkApprovalGuard,
  computeQuorumStatus as computeRosterQuorum,
  findApprover,
  signatureSummary,
} from './approval-state';
import {
  applyDecision,
  approvalProgress,
  canReviewProposal,
  snapshotFromProposal,
} from './approvalState';

const marco = { id: 'usr_marco', name: 'Marco Vitale' };
const lin = { id: 'usr_lin', name: 'Lin Zhao' };
const ada = { id: 'usr_ada', name: 'Ada Okonkwo' };
const outsider = { id: 'usr_outsider', name: 'Outsider' };

const DECIDED_AT = '2026-08-01T09:00:00.000Z';

/** Full proposal fixture — the same shape the approval modules consume. */
function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'prop_3',
    organizationId: 'org_nova',
    transactionId: 'txn_2c19',
    title: 'Linear — annual license renewal',
    description: 'Dual approval required.',
    status: 'pending',
    kind: 'dual',
    agentName: 'Vega',
    amount: 6_800,
    asset: 'USDC',
    counterparty: 'Linear',
    riskScore: 27,
    requiredApprovals: 2,
    approvals: [
      { id: 'apr_3', userId: lin.id, userName: lin.name, decision: 'pending' },
      { id: 'apr_4', userId: marco.id, userName: marco.name, decision: 'pending' },
    ],
    expiresAt: '2026-08-02T14:00:00.000Z',
    createdAt: '2026-07-28T14:02:00.000Z',
    ...overrides,
  };
}

function decided(userId: string, userName: string, decision: ApprovalDecision['decision']): ApprovalDecision {
  return { id: `apr_${userId}`, userId, userName, decision };
}

// ---------------------------------------------------------------------------
// Guard conditions (checkApprovalGuard — roster-based workflow)
// ---------------------------------------------------------------------------

test('guard admits a pending approver with a clean roster slot', () => {
  const result = checkApprovalGuard(proposal(), marco.id);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.approver?.id, 'apr_4');
});

test('guard rejects every non-pending proposal status, including rejection and execution', () => {
  const statuses: ProposalStatus[] = ['approved', 'rejected', 'expired', 'executed'];

  for (const status of statuses) {
    const result = checkApprovalGuard(proposal({ status }), marco.id);
    assert.equal(result.ok, false, `status ${status} must be blocked`);
    if (!result.ok) {
      assert.equal(result.code, 'proposal_not_pending');
      assert.match(result.message, /no longer pending/i);
    }
  }
});

test('guard rejects an in-flight decision, a duplicate session decision, an outsider, and a resolved slot', () => {
  const inFlight = checkApprovalGuard(proposal(), marco.id, { isProcessing: true });
  assert.equal(inFlight.ok, false);
  if (!inFlight.ok) assert.equal(inFlight.code, 'approval_in_progress');

  const duplicateSession = checkApprovalGuard(proposal(), marco.id, { hasLocalDecision: true });
  assert.equal(duplicateSession.ok, false);
  if (!duplicateSession.ok) assert.equal(duplicateSession.code, 'duplicate_decision');

  const unauthorized = checkApprovalGuard(proposal(), outsider.id);
  assert.equal(unauthorized.ok, false);
  if (!unauthorized.ok) {
    assert.equal(unauthorized.code, 'not_an_approver');
    assert.match(unauthorized.message, /not an approver/i);
  }

  const resolvedSlot = checkApprovalGuard(
    proposal({ approvals: [decided(marco.id, marco.name, 'approved')] }),
    marco.id,
  );
  assert.equal(resolvedSlot.ok, false);
  if (!resolvedSlot.ok) assert.equal(resolvedSlot.code, 'duplicate_decision');
});

test('guard applies non-pending status before any other condition, and empty rosters have no approvers', () => {
  const precedence = checkApprovalGuard(
    proposal({ status: 'executed', approvals: [] }),
    outsider.id,
    { isProcessing: true, hasLocalDecision: true },
  );
  assert.equal(precedence.ok, false);
  if (!precedence.ok) assert.equal(precedence.code, 'proposal_not_pending');

  const emptyRoster = checkApprovalGuard(proposal({ approvals: [] }), marco.id);
  assert.equal(emptyRoster.ok, false);
  if (!emptyRoster.ok) assert.equal(emptyRoster.code, 'not_an_approver');
  assert.equal(findApprover(proposal({ approvals: [] }), marco.id), null);
});

// ---------------------------------------------------------------------------
// Roster transitions (applyApprovalDecision — immutable Proposal → Proposal)
// ---------------------------------------------------------------------------

test('pending approval below threshold stays pending and does not mutate the input', () => {
  const original = proposal();
  const next = applyApprovalDecision(original, marco, 'approved', {
    comment: 'Within budget.',
    timestamp: DECIDED_AT,
  });

  assert.equal(original.status, 'pending');
  assert.equal(original.approvals[1]?.decision, 'pending');
  assert.notEqual(next, original);

  const slot = findApprover(next, marco.id);
  assert.equal(slot?.decision, 'approved');
  assert.equal(slot?.comment, 'Within budget.');
  assert.equal(slot?.createdAt, DECIDED_AT);
  assert.equal(next.status, 'pending');
  assert.equal(computeRosterQuorum(next, null).isQuorumMet, false);
});

test('pending approval reaching the threshold transitions to approved', () => {
  const next = applyApprovalDecision(
    proposal({ approvals: [decided(lin.id, lin.name, 'approved'), decided(marco.id, marco.name, 'pending')] }),
    marco,
    'approved',
    { timestamp: DECIDED_AT },
  );

  assert.equal(next.status, 'approved');
  assert.equal(computeRosterQuorum(next, null).isQuorumMet, true);
  assert.equal(computeRosterQuorum(next, null).remaining, 0);
});

test('rejection is recorded without quorum weight and does not close the proposal', () => {
  const rejected = applyApprovalDecision(proposal(), marco, 'rejected', {
    comment: 'Vendor needs review.',
    timestamp: DECIDED_AT,
  });

  assert.equal(rejected.status, 'pending');
  assert.equal(findApprover(rejected, marco.id)?.decision, 'rejected');
  assert.equal(computeRosterQuorum(rejected, null).approvedWeight, 0);

  // A rejection does not short-circuit the remaining signer: the other
  // approver can still record a decision, but a rejection carries no quorum
  // weight, so a two-of-two proposal can no longer reach its threshold.
  const thenApproved = applyApprovalDecision(rejected, lin, 'approved', { timestamp: DECIDED_AT });
  assert.equal(findApprover(thenApproved, lin.id)?.decision, 'approved');
  assert.equal(thenApproved.status, 'pending');
  assert.equal(computeRosterQuorum(thenApproved, null).approvedWeight, 1);
  assert.equal(computeRosterQuorum(thenApproved, null).isQuorumMet, false);
});

test('the pure apply helper has no status or roster guard of its own', () => {
  // Current behaviour: callers must run checkApprovalGuard first. The helper
  // itself appends off-roster decisions and will happily rewrite a decided or
  // executed proposal. Documented here as a known gap, not silently fixed.
  const appended = applyApprovalDecision(proposal(), outsider, 'approved', { timestamp: DECIDED_AT });
  assert.equal(findApprover(appended, outsider.id)?.decision, 'approved');
  assert.equal(appended.approvals.length, 3);

  const afterRejection = applyApprovalDecision(
    proposal({ status: 'rejected' }),
    marco,
    'approved',
    { timestamp: DECIDED_AT },
  );
  assert.equal(findApprover(afterRejection, marco.id)?.decision, 'approved');

  // Below-threshold decisions leave `executed` untouched; a decision that
  // satisfies the threshold rewrites it to `approved`.
  const executedBelow = applyApprovalDecision(
    proposal({ status: 'executed', approvals: [] }),
    marco,
    'approved',
    { timestamp: DECIDED_AT },
  );
  assert.equal(executedBelow.status, 'executed');

  const executedAtThreshold = applyApprovalDecision(
    proposal({
      status: 'executed',
      approvals: [decided(lin.id, lin.name, 'approved'), decided(marco.id, marco.name, 'pending')],
    }),
    marco,
    'approved',
    { timestamp: DECIDED_AT },
  );
  assert.equal(executedAtThreshold.status, 'approved');
});

test('the roster helpers never synthesise an executed status', () => {
  const approved = applyApprovalDecision(
    proposal({ approvals: [decided(lin.id, lin.name, 'approved'), decided(marco.id, marco.name, 'pending')] }),
    marco,
    'approved',
    { timestamp: DECIDED_AT },
  );

  assert.notEqual(approved.status, 'executed');
  assert.equal(computeRosterQuorum(approved, null).approvedWeight, 2);
});

// ---------------------------------------------------------------------------
// Quorum / signature helper boundaries (computeQuorumStatus, signatureSummary)
// ---------------------------------------------------------------------------

test('quorum counts server approvals plus a local decision without double counting', () => {
  const base = proposal({
    approvals: [decided(lin.id, lin.name, 'approved'), decided(marco.id, marco.name, 'pending')],
  });

  const withLocal = computeRosterQuorum(base, 'approved');
  assert.equal(withLocal.approvedWeight, 2);
  assert.equal(withLocal.isQuorumMet, true);
  assert.equal(withLocal.remaining, 0);

  assert.equal(computeRosterQuorum(base, null).approvedWeight, 1);
  assert.equal(computeRosterQuorum(base, 'rejected').approvedWeight, 1);
  assert.equal(computeRosterQuorum(base, 'rejected').isQuorumMet, false);
});

test('quorum clamps excess approvals and handles empty or zero thresholds', () => {
  const overThreshold = proposal({
    requiredApprovals: 2,
    approvals: [
      decided(lin.id, lin.name, 'approved'),
      decided(marco.id, marco.name, 'approved'),
      decided(ada.id, ada.name, 'approved'),
    ],
  });
  assert.equal(computeRosterQuorum(overThreshold, 'approved').approvedWeight, 2);

  const empty = proposal({ approvals: [] });
  assert.deepEqual(computeRosterQuorum(empty, null), {
    approvedWeight: 0,
    requiredApprovals: 2,
    isQuorumMet: false,
    remaining: 2,
  });

  // Boundary: a zero threshold is already satisfied and never yields negative
  // remaining approvals.
  assert.deepEqual(computeRosterQuorum(proposal({ requiredApprovals: 0, approvals: [] }), null), {
    approvedWeight: 0,
    requiredApprovals: 0,
    isQuorumMet: true,
    remaining: 0,
  });
});

test('signature summary uses the singular form at a one-signer threshold', () => {
  assert.equal(signatureSummary(proposal(), null), '0 of 2 signatures collected');
  assert.equal(
    signatureSummary(proposal({ approvals: [decided(lin.id, lin.name, 'approved')] }), 'approved'),
    '2 of 2 signatures collected',
  );

  const single = proposal({ requiredApprovals: 1, approvals: [] });
  assert.equal(signatureSummary(single, null), '0 of 1 signature collected');
  assert.equal(signatureSummary(single, 'approved'), '1 of 1 signature collected');
});

// ---------------------------------------------------------------------------
// Snapshot transitions (applyDecision — role guard, status recomputation)
// ---------------------------------------------------------------------------

test('review roles gate who may record a decision', () => {
  for (const role of ['owner', 'admin', 'finance'] as const) {
    assert.equal(canReviewProposal(role), true, `${role} may review`);
  }
  for (const role of ['developer', 'auditor', 'viewer'] as const) {
    assert.equal(canReviewProposal(role), false, `${role} may not review`);
  }
});

test('snapshotFromProposal copies approvals and stamps a deterministic update time', () => {
  const source = proposal();
  const snapshot = snapshotFromProposal(source);

  assert.equal(snapshot.proposalId, source.id);
  assert.equal(snapshot.status, 'pending');
  assert.equal(snapshot.requiredApprovals, 2);
  assert.equal(snapshot.updatedAt, source.createdAt);
  assert.notEqual(snapshot.approvals, source.approvals);
  assert.deepEqual(snapshot.approvals, source.approvals);
});

test('snapshot approval below threshold stays pending; reaching the threshold approves', () => {
  const snapshot = snapshotFromProposal(proposal());

  const partial = applyDecision(snapshot, {
    decision: 'approved',
    reviewer: ada,
    decidedAt: DECIDED_AT,
  });
  assert.equal(partial.status, 'pending');
  assert.equal(approvalProgress(partial).approved, 1);
  assert.equal(approvalProgress(partial).quorumMet, false);

  const atThreshold = applyDecision(
    snapshotFromProposal(
      proposal({ approvals: [decided(lin.id, lin.name, 'approved')] }),
    ),
    { decision: 'approved', reviewer: ada, decidedAt: DECIDED_AT },
  );
  assert.equal(atThreshold.status, 'approved');
  assert.equal(atThreshold.updatedAt, DECIDED_AT);
  assert.equal(approvalProgress(atThreshold).quorumMet, true);
});

test('duplicate decisions replace the reviewer entry rather than adding weight', () => {
  const snapshot = snapshotFromProposal(proposal());
  const approved = applyDecision(snapshot, {
    decision: 'approved',
    reviewer: ada,
    decidedAt: DECIDED_AT,
  });
  const changed = applyDecision(approved, {
    decision: 'rejected',
    reviewer: ada,
    comment: 'Budget changed.',
    decidedAt: '2026-08-01T10:00:00.000Z',
  });

  const mine = changed.approvals.filter((entry) => entry.userId === ada.id);
  assert.equal(mine.length, 1);
  assert.equal(mine[0]?.decision, 'rejected');
  assert.equal(mine[0]?.comment, 'Budget changed.');
  assert.equal(approvalProgress(changed).approved, 0);
  assert.equal(approvalProgress(changed).rejected, 1);
  assert.equal(changed.status, 'pending');
});

test('rejection does not meet quorum and a decided snapshot keeps terminal statuses', () => {
  const snapshot = snapshotFromProposal(proposal());
  const rejected = applyDecision(snapshot, { decision: 'rejected', reviewer: ada, decidedAt: DECIDED_AT });

  assert.equal(rejected.status, 'pending');
  // Both original slots are still pending and a rejection adds no approval
  // weight, so the full two-signature requirement remains outstanding.
  assert.equal(approvalProgress(rejected).remaining, 2);
  assert.equal(approvalProgress(rejected).quorumMet, false);

  // Terminal statuses are deliberately not recomputed by applyDecision: an
  // executed/rejected proposal cannot be reopened through this helper.
  for (const status of ['rejected', 'executed', 'expired'] as const) {
    const terminal = applyDecision(snapshotFromProposal(proposal({ status })), {
      decision: 'approved',
      reviewer: ada,
      decidedAt: DECIDED_AT,
    });
    assert.equal(terminal.status, status);
  }
});

test('approvalProgress handles empty rosters and zero thresholds', () => {
  const empty = approvalProgress(
    snapshotFromProposal(proposal({ requiredApprovals: 0, approvals: [] })),
  );
  assert.equal(empty.approved, 0);
  assert.equal(empty.rejected, 0);
  assert.equal(empty.pending, 0);
  assert.equal(empty.required, 0);
  assert.equal(empty.quorumMet, true);
  assert.equal(empty.remaining, 0);
  // The display divisor is clamped to one, so a zero threshold is already met
  // and progress stays at 0% instead of producing NaN.
  assert.equal(empty.percent, 0);

  const single = approvalProgress(
    snapshotFromProposal(proposal({ requiredApprovals: 1, approvals: [] })),
  );
  assert.equal(single.percent, 0);
  assert.equal(single.quorumMet, false);
});

// ---------------------------------------------------------------------------
// Session store guards (single submission per proposal)
// ---------------------------------------------------------------------------

test('session store claims one decision per proposal and blocks duplicates', () => {
  const store = useProposalApprovalStore.getState();
  store.reset('prop_store');

  assert.equal(store.tryBeginDecision('prop_store'), true);
  assert.equal(useProposalApprovalStore.getState().getEntry('prop_store').isProcessing, true);
  assert.equal(useProposalApprovalStore.getState().tryBeginDecision('prop_store'), false);

  useProposalApprovalStore.getState().resolveDecision('prop_store', 'approved');
  const resolved = useProposalApprovalStore.getState().getEntry('prop_store');
  assert.equal(resolved.decision, 'approved');
  assert.equal(resolved.isProcessing, false);
  assert.equal(resolved.error, null);
  assert.equal(useProposalApprovalStore.getState().tryBeginDecision('prop_store'), false);

  useProposalApprovalStore.getState().reset('prop_store');
  assert.deepEqual(useProposalApprovalStore.getState().getEntry('prop_store'), {
    decision: null,
    isProcessing: false,
    error: null,
  });
});

test('session store failure clears in-flight state and tracks proposals independently', () => {
  const store = useProposalApprovalStore.getState();
  store.reset('prop_failed');
  store.reset('prop_other');

  assert.equal(store.tryBeginDecision('prop_failed'), true);
  useProposalApprovalStore.getState().failDecision('prop_failed', 'Signing cancelled.');

  const failed = useProposalApprovalStore.getState().getEntry('prop_failed');
  assert.equal(failed.isProcessing, false);
  assert.equal(failed.error, 'Signing cancelled.');
  assert.equal(failed.decision, null);
  assert.equal(useProposalApprovalStore.getState().tryBeginDecision('prop_failed'), true);

  assert.equal(useProposalApprovalStore.getState().tryBeginDecision('prop_other'), true);
  useProposalApprovalStore.getState().reset('prop_failed');
  useProposalApprovalStore.getState().reset('prop_other');
});
