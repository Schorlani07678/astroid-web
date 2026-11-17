import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agent } from '@/types/domain';
import {
  filterAgentsByCriteria,
  extractAvailableProviders,
  INITIAL_ADVANCED_AGENT_FILTERS,
} from './advancedAgentFilter';

const MOCK_AGENTS: Agent[] = [
  {
    id: 'agt-1',
    organizationId: 'org-1',
    name: 'Stellar Treasury Sentinel',
    description: 'Monitors Soroban liquidity pools and rebalances USDC reserves.',
    role: 'finance',
    status: 'active',
    mode: 'autonomous',
    provider: 'Nvidia',
    model: 'nemotron-70b',
    capabilities: ['wallet.read', 'wallet.transfer'],
    monthlyBudget: 5000,
    budgetSpent: 1200,
    policyIds: ['pol-1'],
    lastActiveAt: '2026-11-15T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'agt-2',
    organizationId: 'org-1',
    name: 'Vendor Invoice Auditor',
    description: 'Audits cross-border supplier invoices before settlement.',
    role: 'procurement',
    status: 'paused',
    mode: 'assisted',
    provider: 'Anthropic',
    model: 'claude-3-5-sonnet-latest',
    capabilities: ['proposal.create'],
    monthlyBudget: 2000,
    budgetSpent: 450,
    policyIds: ['pol-2'],
    lastActiveAt: '2026-11-14T00:00:00Z',
    createdAt: '2026-10-05T00:00:00Z',
  },
];

test('filterAgentsByCriteria matches partial case-insensitive name and description', () => {
  const byName = filterAgentsByCriteria(MOCK_AGENTS, {
    ...INITIAL_ADVANCED_AGENT_FILTERS,
    query: 'sentinel',
  });
  assert.equal(byName.length, 1);
  assert.equal(byName[0]?.id, 'agt-1');

  const byDesc = filterAgentsByCriteria(MOCK_AGENTS, {
    ...INITIAL_ADVANCED_AGENT_FILTERS,
    query: 'SUPPLIER INVOICES',
  });
  assert.equal(byDesc.length, 1);
  assert.equal(byDesc[0]?.id, 'agt-2');
});

test('filterAgentsByCriteria filters by provider and operational status', () => {
  const filtered = filterAgentsByCriteria(MOCK_AGENTS, {
    query: '',
    provider: 'Anthropic',
    status: 'paused',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, 'agt-2');

  const empty = filterAgentsByCriteria(MOCK_AGENTS, {
    query: '',
    provider: 'OpenAI',
    status: 'active',
  });
  assert.equal(empty.length, 0);
});

test('extractAvailableProviders returns sorted unique providers', () => {
  assert.deepEqual(extractAvailableProviders(MOCK_AGENTS), ['Anthropic', 'Nvidia']);
});
