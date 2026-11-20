import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyFreighterError,
  FREIGHTER_PERSIST_KEY,
  type FreighterApi,
  FreighterError,
  mergePersistedFreighterState,
  partializeFreighterState,
  __setFreighterLoaderForTests,
  STELLAR_NETWORKS,
  useFreighterStore,
} from './freighter-store';
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
const testnetPassphrase = STELLAR_NETWORKS.testnet.passphrase;
const userRejected = { code: -4, message: 'The user rejected this request.' };

/** Puts the store back to a pristine disconnected state with a fake extension. */
function resetStore(api: FreighterApi | null = null): void {
  __setFreighterLoaderForTests(
    api ? async () => api : async () => Promise.reject(new Error('Cannot find module @stellar/freighter-api')),
  );
  useFreighterStore.setState({
    status: 'disconnected',
    isInstalled: false,
    publicKey: null,
    network: null,
    networkPassphrase: null,
    targetNetwork: 'testnet',
    isSwitching: false,
    isSigning: false,
    error: null,
    errorCode: null,
  });
}

/** A healthy, unlocked Freighter on testnet that approves everything. */
function healthyApi(overrides: Partial<FreighterApi> = {}): FreighterApi {
  return {
    isConnected: async () => ({ isConnected: true }),
    setAllowed: async () => ({ isAllowed: true }),
    getAddress: async () => ({ address: validPublicKey }),
    getNetwork: async () => ({ network: 'TESTNET', networkPassphrase: testnetPassphrase }),
    signTransaction: async () => ({ signedTxXdr: 'SIGNED_XDR' }),
    ...overrides,
  };
}

function markConnected(): void {
  useFreighterStore.setState({
    status: 'connected',
    isInstalled: true,
    publicKey: validPublicKey,
    network: 'TESTNET',
    networkPassphrase: testnetPassphrase,
  });
}

test.afterEach(() => {
  __setFreighterLoaderForTests(null);
});

// ---------------------------------------------------------------------------
// Existing behaviour
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

test('classifyFreighterError maps Freighter API codes and messages to categories', () => {
  assert.equal(classifyFreighterError(userRejected).code, 'USER_DECLINED');
  assert.equal(classifyFreighterError(new Error('User declined access')).code, 'USER_DECLINED');
  assert.equal(classifyFreighterError('Request was cancelled by the user').code, 'USER_DECLINED');
  assert.equal(classifyFreighterError(new Error('Freighter is not installed')).code, 'NOT_INSTALLED');
  assert.equal(classifyFreighterError(new Error('Request timed out')).code, 'TIMEOUT');
  assert.equal(classifyFreighterError(new Error('Wallet is locked')).code, 'LOCKED');
  assert.equal(classifyFreighterError({ weird: true }).code, 'UNKNOWN');
});

test('classifyFreighterError keeps the original message and passes typed errors through', () => {
  const typed = new FreighterError('LOCKED', 'Unlock first');
  assert.equal(classifyFreighterError(typed), typed);

  const classified = classifyFreighterError(userRejected);
  assert.ok(classified instanceof FreighterError);
  assert.equal(classified.message, userRejected.message);
});

test('classifyFreighterError falls back to a friendly message when none is provided', () => {
  const classified = classifyFreighterError({ code: -4 });
  assert.equal(classified.code, 'USER_DECLINED');
  assert.match(classified.message, /declined/i);
});

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------

test('connect reports NOT_INSTALLED and clears the spinner when the extension is missing', async () => {
  resetStore(null);

  const result = await useFreighterStore.getState().connect();
  const state = useFreighterStore.getState();

  assert.equal(result, null);
  assert.equal(state.status, 'disconnected');
  assert.equal(state.isInstalled, false);
  assert.equal(state.errorCode, 'NOT_INSTALLED');
  assert.match(state.error ?? '', /not installed/i);
});

test('connect resets the loading state when the approval prompt is dismissed', async () => {
  resetStore(healthyApi({ setAllowed: async () => ({ isAllowed: false, error: userRejected }) }));

  const pending = useFreighterStore.getState().connect();
  assert.equal(useFreighterStore.getState().status, 'connecting');
  const result = await pending;
  const state = useFreighterStore.getState();

  assert.equal(result, null);
  assert.equal(state.status, 'disconnected', 'spinner must not stay in `connecting`');
  assert.equal(state.errorCode, 'USER_DECLINED');
  assert.equal(state.isInstalled, true, 'a decline proves the extension is installed');
  assert.equal(state.publicKey, null);
});

test('connect treats a falsy setAllowed answer as a user decline', async () => {
  resetStore(healthyApi({ setAllowed: async () => false }));

  await useFreighterStore.getState().connect();

  assert.equal(useFreighterStore.getState().errorCode, 'USER_DECLINED');
  assert.equal(useFreighterStore.getState().status, 'disconnected');
});

test('declining a re-connect prompt keeps an existing healthy session', async () => {
  resetStore(healthyApi({ setAllowed: async () => ({ isAllowed: false, error: userRejected }) }));
  markConnected();

  await useFreighterStore.getState().connect();
  const state = useFreighterStore.getState();

  assert.equal(state.status, 'connected');
  assert.equal(state.publicKey, validPublicKey);
  assert.equal(state.networkPassphrase, testnetPassphrase);
  assert.equal(state.errorCode, 'USER_DECLINED');
});

test('connect flags a malformed address payload as INVALID_RESPONSE', async () => {
  resetStore(healthyApi({ getAddress: async () => ({ address: 'not-a-key' }) }));

  await useFreighterStore.getState().connect();

  assert.equal(useFreighterStore.getState().errorCode, 'INVALID_RESPONSE');
  assert.equal(useFreighterStore.getState().status, 'disconnected');
});

test('connect moves to `locked` when Freighter reports a locked wallet', async () => {
  resetStore(healthyApi({ getAddress: async () => ({ address: '', error: { message: 'Wallet is locked' } }) }));

  await useFreighterStore.getState().connect();

  assert.equal(useFreighterStore.getState().status, 'locked');
  assert.equal(useFreighterStore.getState().errorCode, 'LOCKED');
});

test('successful connect clears a previous error and stores the network', async () => {
  resetStore(healthyApi());
  useFreighterStore.setState({ error: 'old failure', errorCode: 'TIMEOUT' });

  const key = await useFreighterStore.getState().connect();
  const state = useFreighterStore.getState();

  assert.equal(key, validPublicKey);
  assert.equal(state.status, 'connected');
  assert.equal(state.error, null);
  assert.equal(state.errorCode, null);
  assert.equal(state.networkPassphrase, testnetPassphrase);
});

test('a failing network lookup does not abort an approved connection', async () => {
  resetStore(healthyApi({ getNetwork: async () => Promise.reject(new Error('port closed')) }));

  const key = await useFreighterStore.getState().connect();

  assert.equal(key, validPublicKey);
  assert.equal(useFreighterStore.getState().status, 'connected');
  assert.equal(useFreighterStore.getState().networkPassphrase, null, 'unknown network stays null (fail closed)');
});

test('concurrent connect calls share one Freighter prompt', async () => {
  let prompts = 0;
  resetStore(
    healthyApi({
      setAllowed: async () => {
        prompts += 1;
        return { isAllowed: true };
      },
    }),
  );

  const [first, second] = await Promise.all([
    useFreighterStore.getState().connect(),
    useFreighterStore.getState().connect(),
  ]);

  assert.equal(prompts, 1);
  assert.equal(first, validPublicKey);
  assert.equal(second, validPublicKey);
});

// ---------------------------------------------------------------------------
// requestSignature()
// ---------------------------------------------------------------------------

test('declining a signature keeps the wallet connected and throws a typed error', async () => {
  resetStore(healthyApi({ signTransaction: async () => ({ signedTxXdr: '', error: userRejected }) }));
  markConnected();

  await assert.rejects(
    () => useFreighterStore.getState().requestSignature('AAAA'),
    (error: unknown) => error instanceof FreighterError && error.code === 'USER_DECLINED',
  );
  const state = useFreighterStore.getState();

  assert.equal(state.status, 'connected', 'declining one signature must not disconnect the session');
  assert.equal(state.publicKey, validPublicKey);
  assert.equal(state.isSigning, false);
  assert.equal(state.errorCode, 'USER_DECLINED');
});

test('a signature request against a vanished extension disconnects with NOT_INSTALLED', async () => {
  resetStore(healthyApi({ signTransaction: undefined }));
  markConnected();

  await assert.rejects(
    () => useFreighterStore.getState().requestSignature('AAAA'),
    (error: unknown) => error instanceof FreighterError && error.code === 'NOT_INSTALLED',
  );

  assert.equal(useFreighterStore.getState().status, 'disconnected');
  assert.equal(useFreighterStore.getState().isInstalled, false);
  assert.equal(useFreighterStore.getState().isSigning, false);
});

test('a network mismatch is reported as NETWORK_MISMATCH before prompting', async () => {
  let prompted = false;
  resetStore(
    healthyApi({
      signTransaction: async () => {
        prompted = true;
        return 'SIGNED';
      },
    }),
  );
  markConnected();
  useFreighterStore.setState({ targetNetwork: 'public' });

  await assert.rejects(
    () => useFreighterStore.getState().requestSignature('AAAA'),
    (error: unknown) => error instanceof FreighterError && error.code === 'NETWORK_MISMATCH',
  );

  assert.equal(prompted, false);
  assert.equal(useFreighterStore.getState().errorCode, 'NETWORK_MISMATCH');
});

test('a successful signature returns the signed XDR and clears errors', async () => {
  resetStore(healthyApi());
  markConnected();
  useFreighterStore.setState({ error: 'stale', errorCode: 'TIMEOUT' });

  const signed = await useFreighterStore.getState().requestSignature('AAAA');

  assert.equal(signed, 'SIGNED_XDR');
  assert.equal(useFreighterStore.getState().error, null);
  assert.equal(useFreighterStore.getState().errorCode, null);
  assert.equal(useFreighterStore.getState().isSigning, false);
});

// ---------------------------------------------------------------------------
// hydrate(), switchNetwork(), clearError()
// ---------------------------------------------------------------------------

test('hydrate does not clobber an in-flight connect prompt', async () => {
  let release: (value: { isAllowed: boolean }) => void = () => {};
  resetStore(
    healthyApi({
      setAllowed: () => new Promise((resolve) => { release = resolve; }),
      getAddress: async () => ({ address: '' }),
    }),
  );

  const pending = useFreighterStore.getState().connect();
  await useFreighterStore.getState().hydrate();
  assert.equal(useFreighterStore.getState().status, 'connecting');

  release({ isAllowed: true });
  await pending;
});

test('hydrate classifies a missing extension and records the error code', async () => {
  resetStore(null);
  markConnected();

  await useFreighterStore.getState().hydrate();

  assert.equal(useFreighterStore.getState().status, 'disconnected');
  assert.equal(useFreighterStore.getState().errorCode, 'NOT_INSTALLED');
});

test('switchNetwork always releases the switching flag', async () => {
  resetStore(healthyApi({ getNetwork: async () => Promise.reject(new Error('boom')) }));
  markConnected();

  const result = await useFreighterStore.getState().switchNetwork('public');

  assert.deepEqual(result, { matched: false });
  assert.equal(useFreighterStore.getState().isSwitching, false);
});

test('clearError resets the message and the category together', () => {
  useFreighterStore.setState({ error: 'Declined', errorCode: 'USER_DECLINED' });

  useFreighterStore.getState().clearError();

  assert.equal(useFreighterStore.getState().error, null);
  assert.equal(useFreighterStore.getState().errorCode, null);
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

// -- persistence (issue #516) ------------------------------------------------

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** Runs `run` with a fake `window.localStorage`, restoring the SSR-like global after. */
async function withWindowStorage<T>(storage: StorageLike, run: () => Promise<T> | T): Promise<T> {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  globals.window = { localStorage: storage };
  try {
    return await run();
  } finally {
    if (previous === undefined) delete globals.window;
    else globals.window = previous;
  }
}

const readPersisted = (storage: ReturnType<typeof createMemoryStorage>) => {
  const raw = storage.data.get(FREIGHTER_PERSIST_KEY);
  return raw ? (JSON.parse(raw) as { state: Record<string, unknown>; version: number }) : null;
};

test('partialize keeps only a healthy connection and never the network passphrase', () => {
  assert.deepEqual(partializeFreighterState({ status: 'connected', publicKey: validPublicKey }), {
    status: 'connected',
    publicKey: validPublicKey,
  });
  for (const status of ['disconnected', 'connecting', 'locked'] as const) {
    assert.deepEqual(partializeFreighterState({ status, publicKey: validPublicKey }), {
      status: 'disconnected',
      publicKey: null,
    });
  }
  assert.deepEqual(partializeFreighterState({ status: 'connected', publicKey: 'bogus' }), {
    status: 'disconnected',
    publicKey: null,
  });
});

test('merge ignores malformed persisted snapshots', () => {
  const current = useFreighterStore.getState();

  for (const bad of [null, undefined, 'x', 42, {}, { status: 'connected' }, { status: 'connected', publicKey: 'bogus' }]) {
    assert.equal(mergePersistedFreighterState(bad, current), current);
  }
  assert.equal(
    mergePersistedFreighterState({ status: 'disconnected', publicKey: validPublicKey }, current),
    current,
  );
});

test('connection status and public key are written to storage', async () => {
  const storage = createMemoryStorage();
  await withWindowStorage(storage, () => {
    useFreighterStore.getState().disconnect();
    useFreighterStore.getState().updatePublicKey(validPublicKey);
    useFreighterStore.setState({ networkPassphrase: 'Test SDF Network ; September 2015' });
  });

  const persisted = readPersisted(storage);
  assert.deepEqual(persisted?.state, { status: 'connected', publicKey: validPublicKey });
  assert.ok(!('networkPassphrase' in (persisted?.state ?? {})));
});

test('disconnecting clears the persisted connection', async () => {
  const storage = createMemoryStorage();
  await withWindowStorage(storage, () => {
    useFreighterStore.getState().updatePublicKey(validPublicKey);
    useFreighterStore.getState().disconnect();
  });

  assert.deepEqual(readPersisted(storage)?.state, { status: 'disconnected', publicKey: null });
});

test('rehydrate restores the connection after a simulated reload', async () => {
  const storage = createMemoryStorage();

  await withWindowStorage(storage, async () => {
    useFreighterStore.setState({ status: 'disconnected', publicKey: null, networkPassphrase: null });
    // A reload starts from defaults and finds the previous session's snapshot.
    storage.setItem(
      FREIGHTER_PERSIST_KEY,
      JSON.stringify({ state: { status: 'connected', publicKey: validPublicKey }, version: 1 }),
    );
    await useFreighterStore.persist.rehydrate();
  });

  const state = useFreighterStore.getState();
  assert.equal(state.status, 'connected');
  assert.equal(state.publicKey, validPublicKey);
  assert.equal(state.networkPassphrase, null);
});

test('rehydrate rejects a tampered public key', async () => {
  const storage = createMemoryStorage();

  await withWindowStorage(storage, async () => {
    useFreighterStore.setState({ status: 'disconnected', publicKey: null });
    storage.setItem(
      FREIGHTER_PERSIST_KEY,
      JSON.stringify({ state: { status: 'connected', publicKey: 'not-a-stellar-key' }, version: 1 }),
    );
    await useFreighterStore.persist.rehydrate();
  });

  assert.equal(useFreighterStore.getState().status, 'disconnected');
  assert.equal(useFreighterStore.getState().publicKey, null);
});

test('rehydrate survives corrupt JSON in storage', async () => {
  const storage = createMemoryStorage();

  await withWindowStorage(storage, async () => {
    useFreighterStore.setState({ status: 'disconnected', publicKey: null });
    storage.setItem(FREIGHTER_PERSIST_KEY, '{not json');
    await useFreighterStore.persist.rehydrate();
  });

  assert.equal(useFreighterStore.getState().status, 'disconnected');
});

test('store works without window (SSR) and with a throwing localStorage', async () => {
  assert.equal(typeof window, 'undefined');
  useFreighterStore.getState().updatePublicKey(validPublicKey);
  await useFreighterStore.persist.rehydrate();
  useFreighterStore.getState().disconnect();

  const throwing: StorageLike = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  await withWindowStorage(throwing, async () => {
    useFreighterStore.getState().updatePublicKey(validPublicKey);
    await useFreighterStore.persist.rehydrate();
    useFreighterStore.getState().disconnect();
  });

  assert.equal(useFreighterStore.getState().status, 'disconnected');
});
