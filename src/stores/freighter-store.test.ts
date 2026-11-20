import assert from 'node:assert/strict';
import test from 'node:test';
import { useFreighterStore } from './freighter-store';
import {
  fetchStellarWithFailover,
  normalizeEndpointUrl,
  resolveStellarEndpoints,
  StellarAccountNotFoundError,
  StellarEndpointFailoverError,
  StellarRequestAbortedError,
  useStellarEndpointStore,
  type StellarEndpoint,
} from './stellar-endpoint-store';

const validPublicKey = `G${'A'.repeat(55)}`;

test('updating the public key marks the wallet connected', () => {
  useFreighterStore.getState().disconnect();

  useFreighterStore.getState().updatePublicKey(validPublicKey);

  assert.equal(useFreighterStore.getState().status, 'connected');
  assert.equal(useFreighterStore.getState().publicKey, validPublicKey);
});

test('updating with an invalid public key is rejected without changing state', () => {
  useFreighterStore.getState().disconnect();

  assert.throws(() =>
    useFreighterStore.getState().updatePublicKey('not-a-stellar-key'),
  );
  assert.equal(useFreighterStore.getState().status, 'disconnected');
  assert.equal(useFreighterStore.getState().publicKey, null);
});

test('disconnect clears the key and active network', () => {
  useFreighterStore.getState().updatePublicKey(validPublicKey);
  useFreighterStore.setState({ network: 'testnet' });

  useFreighterStore.getState().disconnect();

  assert.equal(useFreighterStore.getState().status, 'disconnected');
  assert.equal(useFreighterStore.getState().publicKey, null);
  assert.equal(useFreighterStore.getState().network, null);
});

test('network switching while disconnected fails with a useful error', async () => {
  useFreighterStore.getState().disconnect();

  const switched = await useFreighterStore.getState().switchNetwork('mainnet');

  assert.equal(switched, false);
  assert.match(useFreighterStore.getState().error ?? '', /connect a freighter wallet/i);
});

/* -------------------------------------------------------------------------- */
/* Stellar endpoint failover (issue #522)                                     */
/* -------------------------------------------------------------------------- */

const endpointPool: StellarEndpoint[] = [
  { id: 'primary', label: 'Primary Horizon', url: 'https://primary.example.com' },
  { id: 'fallback-1', label: 'Fallback 1', url: 'https://fallback.example.com' },
];

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const resetEndpointStore = () => useStellarEndpointStore.getState().reset();

test('endpoint pool keeps the primary first and drops duplicates and junk', () => {
  const pool = resolveStellarEndpoints('https://horizon.example.com/', [
    ' https://horizon.example.com ',
    'https://backup.example.com',
    'not-a-url',
  ]);

  assert.deepEqual(
    pool.map((endpoint) => endpoint.url),
    ['https://horizon.example.com', 'https://backup.example.com'],
  );
  assert.equal(pool[0]?.id, 'primary');
  assert.equal(pool[1]?.id, 'fallback-1');
  assert.equal(normalizeEndpointUrl('ftp://horizon.example.com'), null);
  assert.equal(normalizeEndpointUrl(''), null);
});

test('a connection-refused primary fails over to the secondary endpoint', async () => {
  resetEndpointStore();
  const calls: string[] = [];

  const result = await fetchStellarWithFailover<{ balance: string }>({
    endpoints: endpointPool,
    path: '/accounts/GABCDEF',
    timeoutMs: 500,
    fetchImpl: async (input) => {
      calls.push(input);
      if (input.startsWith('https://primary.example.com')) {
        throw new TypeError('fetch failed');
      }
      return jsonResponse({ balance: '42.5', balances: [] });
    },
  });

  assert.equal(result.endpoint.id, 'fallback-1');
  assert.equal(result.attempts, 2);
  assert.equal(result.data.balance, '42.5');
  assert.equal(calls.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.kind, 'network');

  const state = useStellarEndpointStore.getState();
  assert.equal(state.activeEndpointId, 'fallback-1');
  assert.equal(state.lastFailoverFrom, 'primary');
  assert.equal(state.transport, 'live');
  assert.equal(state.health.primary, 'degraded');
  assert.equal(state.consecutiveFailures.primary, 1);
});

test('a primary timeout fails over to the secondary endpoint', async () => {
  resetEndpointStore();

  const result = await fetchStellarWithFailover<{ balance: string }>({
    endpoints: endpointPool,
    path: '/accounts/GABCDEF',
    timeoutMs: 10,
    fetchImpl: (input, init) => {
      if (input.startsWith('https://primary.example.com')) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted.');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }
      return Promise.resolve(jsonResponse({ balance: '7' }));
    },
  });

  assert.equal(result.endpoint.id, 'fallback-1');
  assert.equal(result.failures[0]?.kind, 'timeout');
  assert.match(result.failures[0]?.message ?? '', /timed out/i);
});

test('a 5xx from the primary retries the secondary endpoint', async () => {
  resetEndpointStore();

  const result = await fetchStellarWithFailover<{ balance: string }>({
    endpoints: endpointPool,
    path: '/accounts/GABCDEF',
    timeoutMs: 500,
    fetchImpl: async (input) =>
      input.startsWith('https://primary.example.com')
        ? jsonResponse({ error: 'unavailable' }, 503)
        : jsonResponse({ balance: '9.25' }, 200),
  });

  assert.equal(result.endpoint.id, 'fallback-1');
  assert.equal(result.data.balance, '9.25');
  assert.equal(result.failures[0]?.status, 503);
  assert.equal(useStellarEndpointStore.getState().health.primary, 'degraded');
});

test('a request that recovers marks the endpoint healthy again', async () => {
  resetEndpointStore();
  let primaryDown = true;

  const fetchImpl = async (input: string): Promise<Response> => {
    if (input.startsWith('https://primary.example.com')) {
      if (primaryDown) throw new TypeError('fetch failed');
      return jsonResponse({ balance: '1' });
    }
    return jsonResponse({ balance: '2' });
  };

  const failed = await fetchStellarWithFailover<{ balance: string }>({
    endpoints: endpointPool,
    path: '/accounts/GABCDEF',
    fetchImpl,
  });
  assert.equal(failed.endpoint.id, 'fallback-1');
  assert.equal(useStellarEndpointStore.getState().health.primary, 'degraded');

  primaryDown = false;
  const recovered = await fetchStellarWithFailover<{ balance: string }>({
    endpoints: endpointPool,
    path: '/accounts/GABCDEF',
    fetchImpl,
  });

  const state = useStellarEndpointStore.getState();
  assert.equal(recovered.endpoint.id, 'primary');
  assert.equal(recovered.failures.length, 0);
  assert.equal(state.health.primary, 'healthy');
  assert.equal(state.consecutiveFailures.primary, 0);
  assert.equal(state.transport, 'live');
});

test('an exhausted pool degrades the wallet layer to read-only', async () => {
  resetEndpointStore();

  await assert.rejects(
    () =>
      fetchStellarWithFailover({
        endpoints: endpointPool,
        path: '/accounts/GABCDEF',
        timeoutMs: 500,
        fetchImpl: async () => {
          throw new TypeError('connection refused');
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof StellarEndpointFailoverError);
      assert.equal(error.failures.length, endpointPool.length);
      assert.match(error.message, /unreachable/i);
      return true;
    },
  );

  const state = useStellarEndpointStore.getState();
  assert.equal(state.transport, 'read-only');
  assert.equal(state.health.primary, 'degraded');
  assert.equal(state.health['fallback-1'], 'degraded');
});

test('a 404 stops the failover chain because the account is simply unfunded', async () => {
  resetEndpointStore();
  let calls = 0;

  await assert.rejects(
    () =>
      fetchStellarWithFailover({
        endpoints: endpointPool,
        path: '/accounts/GABCDEF',
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse({}, 404);
        },
      }),
    StellarAccountNotFoundError,
  );

  assert.equal(calls, 1);
});

test('a deterministic 4xx fails fast instead of fanning out', async () => {
  resetEndpointStore();
  let calls = 0;

  await assert.rejects(
    () =>
      fetchStellarWithFailover({
        endpoints: endpointPool,
        path: '/accounts/GABCDEF',
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse({ error: 'bad request' }, 400);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof StellarEndpointFailoverError);
      assert.equal(error.fatal, true);
      return true;
    },
  );

  assert.equal(calls, 1);
});

test('an already-aborted caller signal cancels before any request', async () => {
  resetEndpointStore();
  const controller = new AbortController();
  controller.abort();
  let calls = 0;

  await assert.rejects(
    () =>
      fetchStellarWithFailover({
        endpoints: endpointPool,
        path: '/accounts/GABCDEF',
        signal: controller.signal,
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse({ balance: '1' });
        },
      }),
    StellarRequestAbortedError,
  );

  assert.equal(calls, 0);
});
