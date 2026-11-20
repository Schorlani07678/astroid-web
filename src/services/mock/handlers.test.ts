import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMockRequest } from '@/services/mock/handlers';

async function request(path: string, init: Record<string, unknown> = {}) {
  return resolveMockRequest(path, init);
}

test('mock provider — agents: returns the full collection with pagination meta', async () => {
  const { data, meta } = await request<{ id: string; name: string }[]>('/agents');

  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
  for (const agent of data) {
    assert.ok(agent.id);
    assert.ok(agent.name);
  }
  assert.strictEqual(meta.total, data.length);
  assert.strictEqual(meta.totalPages, 1);
});

test('mock provider — agents: returns a single agent by id', async () => {
  const { data } = await request<{ id: string; name: string }>('/agents/agt_atlas');

  assert.strictEqual(data.id, 'agt_atlas');
  assert.strictEqual(data.name, 'Atlas');
});

test('mock provider — agents: returns 404 for an unknown agent id', async () => {
  await assert.rejects(request('/agents/nope'), {
    code: 'NOT_FOUND',
    name: 'AstroidApiError',
  });
});

test('mock provider — wallets: returns the wallet collection with balances', async () => {
  const { data } = await request<{ id: string; name: string; balances: unknown[] }[]>(
    '/wallets',
  );

  assert.ok(data.length > 0);
  for (const wallet of data) {
    assert.ok(wallet.id);
    assert.ok(Array.isArray(wallet.balances));
  }
});

test('mock provider — wallets: returns balances for a nested route', async () => {
  const { data } = await request<unknown[]>('/wallets/wal_treasury/balances');

  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
});

test('mock provider — transactions: supports pagination', async () => {
  const first = await request<{ id: string }[]>('/transactions', {
    query: { page: 1, limit: 2 },
  });
  const second = await request<{ id: string }[]>('/transactions', {
    query: { page: 2, limit: 2 },
  });

  assert.strictEqual(first.data.length, 2);
  assert.ok(first.meta.total > 2);
  assert.ok(first.meta.totalPages > 1);
  assert.strictEqual(second.data.length, 2);
  assert.notDeepStrictEqual(
    first.data.map((t) => t.id).sort(),
    second.data.map((t) => t.id).sort(),
  );
});

test('mock provider — transactions: supports case-insensitive search', async () => {
  const { data } = await request<{ id: string; counterparty: string }[]>('/transactions', {
    query: { search: 'openai' },
  });

  assert.ok(data.length > 0);
  assert.ok(
    data.every((tx) => tx.counterparty.toLowerCase().includes('openai')),
  );
});

test('mock provider — transactions: supports exact-match filters', async () => {
  const { data } = await request<{ id: string; status: string }[]>('/transactions', {
    query: { filter: { status: 'completed' } },
  });

  assert.ok(data.length > 0);
  assert.ok(data.every((tx) => tx.status === 'completed'));
});

test('mock provider — transactions: returns 404 for an unknown transaction id', async () => {
  await assert.rejects(request('/transactions/nope'), { code: 'NOT_FOUND' });
});

test('mock provider — policies: returns the policy collection', async () => {
  const { data } = await request<{ id: string; name: string; type: string }[]>('/policies');

  assert.ok(data.length > 0);
  for (const policy of data) {
    assert.ok(policy.id);
    assert.ok(policy.name);
    assert.ok(policy.type);
  }
});

test('mock provider — policy simulation: returns a structured result for a positive amount', async () => {
  const { data } = await request<{
    passed: boolean;
    requiredApprovals: number;
    estimatedRisk: number;
  }>('/policies/simulate', {
    method: 'POST',
    body: JSON.stringify({ amount: 7_000 }),
  });

  assert.strictEqual(data.passed, true);
  assert.strictEqual(data.requiredApprovals, 2);
  assert.ok(data.estimatedRisk > 0);
});

test('mock provider — policy simulation: rejects non-positive amounts', async () => {
  await assert.rejects(
    request('/policies/simulate', {
      method: 'POST',
      body: JSON.stringify({ amount: -5 }),
    }),
    { code: 'VALIDATION_ERROR' },
  );
});

test('mock provider — error surface: throws AstroidApiError for unregistered routes', async () => {
  await assert.rejects(request('/v1/does-not-exist'), {
    code: 'NOT_FOUND',
    name: 'AstroidApiError',
  });
});

test('mock provider — error surface: returns responses in the { data, meta } envelope', async () => {
  const { data, meta } = await request<{ id: string }[]>('/agents');

  assert.ok(data);
  assert.ok(meta);
  assert.ok(typeof meta.total === 'number');
});
