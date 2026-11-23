import assert from 'node:assert/strict';
import test from 'node:test';
import type { Proposal } from '../../../types/domain';
import {
  BASE_FEE_STROOPS,
  MOCK_TREASURY_BALANCES,
  buildMockProposalSimulation,
  deriveVerdict,
  estimateFee,
} from './proposalSimulation';

const NOW = new Date('2026-07-31T09:00:00.000Z');

const proposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: 'prop_test',
  organizationId: 'org_test',
  transactionId: 'txn_test',
  title: 'Vendor payment',
  description: 'Test proposal',
  status: 'pending',
  kind: 'single',
  agentName: 'Atlas',
  amount: 1_200,
  asset: 'USDC',
  counterparty: 'Scale AI',
  riskScore: 20,
  requiredApprovals: 1,
  approvals: [
    { id: 'a1', userId: 'u1', userName: 'Marco', decision: 'approved', createdAt: NOW.toISOString() },
  ],
  expiresAt: '2026-08-01T08:00:00.000Z',
  createdAt: '2026-07-31T08:00:00.000Z',
  ...overrides,
});

const step = (sim: ReturnType<typeof buildMockProposalSimulation>, id: string) =>
  sim.steps.find((s) => s.id === id);

test('a small, approved, in-window payment simulates clear', () => {
  const sim = buildMockProposalSimulation(proposal(), NOW);
  assert.equal(sim.verdict, 'clear');
  assert.ok(sim.steps.every((s) => s.outcome === 'passed'));
  assert.equal(sim.simulatedAt, NOW.toISOString());
});

test('the simulation is deterministic for the same proposal and clock', () => {
  assert.deepEqual(
    buildMockProposalSimulation(proposal(), NOW),
    buildMockProposalSimulation(proposal(), NOW),
  );
});

test('payments above the dual-approval threshold with missing approvals need review', () => {
  const sim = buildMockProposalSimulation(
    proposal({
      amount: 22_000,
      requiredApprovals: 2,
      approvals: [
        { id: 'a1', userId: 'u1', userName: 'Marco', decision: 'approved', createdAt: NOW.toISOString() },
        { id: 'a2', userId: 'u2', userName: 'Ada', decision: 'pending' },
      ],
    }),
    NOW,
  );
  assert.equal(sim.verdict, 'review');
  assert.equal(step(sim, 'policy')?.outcome, 'warning');
  assert.equal(step(sim, 'quorum')?.outcome, 'warning');
  assert.match(step(sim, 'quorum')?.detail ?? '', /1 more needed/);
});

test('payments above the transaction ceiling are blocked', () => {
  const sim = buildMockProposalSimulation(proposal({ amount: 30_000 }), NOW);
  assert.equal(sim.verdict, 'blocked');
  assert.equal(sim.policies.find((p) => p.policyId === 'pol_max_txn')?.outcome, 'failed');
  assert.equal(step(sim, 'policy')?.outcome, 'failed');
});

test('insufficient treasury balance fails the balance step', () => {
  const sim = buildMockProposalSimulation(
    proposal({ amount: (MOCK_TREASURY_BALANCES.USDC ?? 0) + 1 }),
    NOW,
  );
  assert.equal(step(sim, 'balance')?.outcome, 'failed');
  assert.equal(sim.verdict, 'blocked');
});

test('expired proposals are blocked', () => {
  const sim = buildMockProposalSimulation(proposal({ expiresAt: '2026-07-31T08:59:59.000Z' }), NOW);
  assert.equal(step(sim, 'expiry')?.outcome, 'failed');
  assert.equal(sim.verdict, 'blocked');
});

test('high risk scores raise a policy warning', () => {
  const sim = buildMockProposalSimulation(proposal({ riskScore: 85 }), NOW);
  assert.equal(sim.policies.find((p) => p.policyId === 'pol_risk_score')?.outcome, 'warning');
  assert.equal(sim.verdict, 'review');
});

test('state changes debit the treasury, credit the destination and charge the fee', () => {
  const sim = buildMockProposalSimulation(proposal({ amount: 1_000 }), NOW);
  const [source, destination, fee] = sim.stateChanges;
  assert.equal(source?.delta, -1_000);
  assert.equal(source?.after, (MOCK_TREASURY_BALANCES.USDC ?? 0) - 1_000);
  assert.equal(destination?.delta, 1_000);
  assert.equal(destination?.before, null);
  assert.equal(fee?.asset, 'XLM');
  assert.equal(fee?.delta, -sim.fee.totalXlm);
});

test('fee estimate scales with the operation count', () => {
  assert.equal(estimateFee(1).totalStroops, BASE_FEE_STROOPS);
  assert.equal(estimateFee(3, 500).totalStroops, 3 * BASE_FEE_STROOPS + 500);
  assert.equal(estimateFee(0).operations, 1);
  assert.equal(estimateFee(1).totalXlm, BASE_FEE_STROOPS / 10_000_000);
});

test('deriveVerdict picks the most severe outcome', () => {
  assert.equal(deriveVerdict(['passed', 'passed']), 'clear');
  assert.equal(deriveVerdict(['passed', 'warning']), 'review');
  assert.equal(deriveVerdict(['warning', 'failed', 'passed']), 'blocked');
});
