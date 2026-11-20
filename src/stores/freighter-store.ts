'use client';

import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from './safe-storage';

export type FreighterConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'locked';

/**
 * Stellar networks the app can target. Freighter itself owns the extension's
 * active network, so this app-side target acts as the *expected* network:
 * signing fails closed whenever the wallet's live passphrase disagrees with
 * it (see `requestSignature` and `isNetworkMismatch`).
 */
export type StellarNetworkId = 'public' | 'testnet' | 'futurenet';

export interface StellarNetworkDescriptor {
  id: StellarNetworkId;
  label: string;
  passphrase: string;
  horizonUrl: string;
}

export const STELLAR_NETWORKS: Record<StellarNetworkId, StellarNetworkDescriptor> = {
  public: {
    id: 'public',
    label: 'Mainnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: 'https://horizon.stellar.org',
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
  futurenet: {
    id: 'futurenet',
    label: 'Futurenet',
    passphrase: 'Test SDF Future Network ; October 2022',
    horizonUrl: 'https://horizon-futurenet.stellar.org',
  },
};

/** Passphrase for an app-side target network id (never null for known ids). */
export function resolveExpectedPassphrase(target: StellarNetworkId | null): string | null {
  return target ? STELLAR_NETWORKS[target]?.passphrase ?? null : null;
}

/** Reverse map a wallet passphrase back to a known network id, if recognized. */
export function networkIdForPassphrase(passphrase: string | null): StellarNetworkId | null {
  if (!passphrase) return null;
  const entry = (Object.values(STELLAR_NETWORKS) as StellarNetworkDescriptor[]).find(
    (network) => network.passphrase === passphrase,
  );
  return entry?.id ?? null;
}

/**
 * Fail-closed mismatch predicate: once an expected passphrase is set, a
 * missing or different wallet passphrase counts as a mismatch. Unknown wallet
 * state must never be treated as "safe to sign".
 */
export function isNetworkMismatch(
  walletPassphrase: string | null,
  expectedPassphrase: string | null,
): boolean {
  if (!expectedPassphrase) return false;
  return walletPassphrase !== expectedPassphrase;
}

/** Display label for a target id, falling back to "Unknown" for bad input. */
export function networkLabelForId(target: StellarNetworkId | null): string {
  return (target && STELLAR_NETWORKS[target]?.label) || 'Unknown';
}

/**
 * Categories of Freighter failures. UI surfaces (toasts, banners, buttons)
 * key their copy and recovery affordance off this code instead of
 * pattern-matching raw extension messages.
 */
export type FreighterErrorCode =
  /** Extension missing, disabled, or unreachable from this page. */
  | 'NOT_INSTALLED'
  /** User rejected/closed the connection or signing prompt. */
  | 'USER_DECLINED'
  /** Wallet is locked or access to the account was not granted. */
  | 'LOCKED'
  /** The extension did not answer before the request deadline. */
  | 'TIMEOUT'
  /** Wallet network differs from the network the action targets. */
  | 'NETWORK_MISMATCH'
  /** The extension answered with a malformed or empty payload. */
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

/** Typed error thrown by store actions so callers can branch on `code`. */
export class FreighterError extends Error {
  readonly code: FreighterErrorCode;

  constructor(code: FreighterErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'FreighterError';
    this.code = code;
    if (options && 'cause' in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Short toast/banner headline for each error category. */
export const FREIGHTER_ERROR_TITLES: Record<FreighterErrorCode, string> = {
  NOT_INSTALLED: 'Freighter not detected',
  USER_DECLINED: 'Request declined in Freighter',
  LOCKED: 'Freighter wallet locked',
  TIMEOUT: 'Freighter did not respond',
  NETWORK_MISMATCH: 'Wrong Stellar network',
  INVALID_RESPONSE: 'Unexpected Freighter response',
  UNKNOWN: 'Freighter connection unavailable',
};

const DEFAULT_ERROR_MESSAGES: Record<FreighterErrorCode, string> = {
  NOT_INSTALLED: 'Freighter extension is not installed or unavailable. Install it, then reconnect.',
  USER_DECLINED: 'The request was declined in Freighter. Approve the prompt to continue.',
  LOCKED: 'Freighter is locked or wallet access is unavailable. Unlock it and reconnect.',
  TIMEOUT: 'Freighter wallet request timed out. Check that the extension is installed and unlocked.',
  NETWORK_MISMATCH: 'Freighter is on a different Stellar network than this action targets.',
  INVALID_RESPONSE: 'Freighter returned an unexpected response.',
  UNKNOWN: 'Unable to reach the Freighter wallet.',
};

/** Freighter's own API error code for a user-rejected request. */
const FREIGHTER_USER_DECLINED_API_CODE = -4;

const extractRawMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string') return candidate;
  }
  return '';
};

/**
 * Maps any value thrown by (or returned as `error` from) `@stellar/freighter-api`
 * to a typed {@link FreighterError}. Freighter v2+ reports failures as
 * `{ code, message }` objects rather than throwing, and older builds throw plain
 * strings, so classification checks the numeric API code first and then falls
 * back to message heuristics. Already-typed errors pass through unchanged.
 */
export function classifyFreighterError(error: unknown): FreighterError {
  if (error instanceof FreighterError) return error;

  const raw = extractRawMessage(error).trim();
  const text = raw.toLowerCase();
  const apiCode =
    error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;

  let code: FreighterErrorCode = 'UNKNOWN';
  if (apiCode === FREIGHTER_USER_DECLINED_API_CODE || /reject|declin|denied|cancel|dismiss|closed/.test(text)) {
    code = 'USER_DECLINED';
  } else if (/timed? ?out/.test(text)) {
    code = 'TIMEOUT';
  } else if (/not installed|not detected|no freighter|unavailable|not found|failed to fetch dynamically imported module|cannot find module/.test(text)) {
    code = 'NOT_INSTALLED';
  } else if (/locked|unlock|not allowed|access (?:is )?(?:not granted|unavailable)/.test(text)) {
    code = 'LOCKED';
  } else if (/network mismatch/.test(text)) {
    code = 'NETWORK_MISMATCH';
  } else if (/did not return|invalid|malformed|unexpected/.test(text)) {
    code = 'INVALID_RESPONSE';
  }

  return new FreighterError(code, raw || DEFAULT_ERROR_MESSAGES[code], { cause: error });
}

/**
 * Freighter v2+ resolves (instead of rejecting) with `{ error }` when a prompt
 * is rejected or the extension cannot answer. Promote that to a thrown,
 * classified error so every call site handles it through the same path.
 */
const assertNoApiError = <T>(result: T): T => {
  if (result && typeof result === 'object' && 'error' in result) {
    const apiError = (result as { error?: unknown }).error;
    if (apiError) throw classifyFreighterError(apiError);
  }
  return result;
};

export interface FreighterWalletState {
  status: FreighterConnectionStatus;
  isInstalled: boolean;
  publicKey: string | null;
  network: string | null;
  /** Live passphrase reported by the Freighter extension, null when unknown. */
  networkPassphrase: string | null;
  /** Network this app session targets; signing gates against this value. */
  targetNetwork: StellarNetworkId;
  /** True while a network switch request is in flight. */
  isSwitching: boolean;
  /** True while a signature prompt is open in the extension. */
  isSigning: boolean;
  error: string | null;
  /** Category of `error`, null whenever `error` is null. */
  errorCode: FreighterErrorCode | null;
  /** Clears the last error without touching connection state. */
  clearError: () => void;
  checkExtension: () => Promise<boolean>;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  /** Re-reads the extension's active network + passphrase into state. */
  refreshNetwork: () => Promise<void>;
  /** Sets the expected network and re-syncs against the wallet. */
  switchNetwork: (target: StellarNetworkId | 'mainnet') => Promise<{ matched: boolean } | boolean>;
  /** Subscribes to Freighter account/network change events (WatchWalletChanges). */
  startWalletWatch: () => void;
  stopWalletWatch: () => void;
  /**
   * Records a connection that was established or lost outside this store, so
   * every wallet-dependent widget reflects it at once. A valid address marks
   * the wallet connected; `null` (or an invalid address) clears the session
   * exactly like `disconnect()`.
   */
  adoptConnection: (publicKey: string | null) => void;
  /** Compatibility setter retained for consumers of the original wallet API. */
  updatePublicKey: (publicKey: string) => void;
  requestSignature: (xdr: string, options?: { networkPassphrase?: string }) => Promise<string>;
  hydrate: () => Promise<void>;
}

/** Backward-compatible names retained for consumers of the previous wallet store API. */
export type StellarWalletNetwork = StellarNetworkId;
export type WalletState = FreighterWalletState;
export type WalletActions = Pick<
  FreighterWalletState,
  'checkExtension' | 'connect' | 'disconnect' | 'refreshNetwork' | 'switchNetwork' |
    'startWalletWatch' | 'stopWalletWatch' | 'adoptConnection' | 'requestSignature' | 'hydrate' |
    'clearError'
>;

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

const withTimeout = async <T>(promise: Promise<T>, ms = 15000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return await new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new FreighterError('TIMEOUT', DEFAULT_ERROR_MESSAGES.TIMEOUT));
    }, ms);

    promise.then(
      (value) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
};

interface FreighterNetworkResult {
  network?: string;
  networkPassphrase?: string;
}

/** Freighter API error envelope (v2+ resolves with this instead of throwing). */
interface FreighterApiErrorField {
  error?: unknown;
}

/** Structural subset of `@stellar/freighter-api` the store relies on. */
export interface FreighterApi {
  isConnected?: () => Promise<boolean | ({ isConnected?: boolean } & FreighterApiErrorField)>;
  setAllowed?: () => Promise<boolean | ({ isAllowed?: boolean } & FreighterApiErrorField)>;
  getAddress?: () => Promise<string | ({ address?: string; publicKey?: string } & FreighterApiErrorField)>;
  getNetwork?: () => Promise<string | (FreighterNetworkResult & FreighterApiErrorField)>;
  signTransaction?: (
    xdr: string,
    options?: Record<string, unknown>,
  ) => Promise<string | ({ signedTxXdr?: string; signedXDR?: string; xdr?: string } & FreighterApiErrorField)>;
  WatchWalletChanges?: new (timeout?: number) => {
    watch: (
      cb: (params: { address: string; network: string; networkPassphrase: string; error?: unknown }) => void,
    ) => { error?: unknown };
    stop: () => void;
  };
}

const defaultFreighterLoader = async (): Promise<FreighterApi> =>
  (await import('@stellar/freighter-api')) as unknown as FreighterApi;

let freighterLoader: () => Promise<FreighterApi> = defaultFreighterLoader;

/**
 * Test seam: swaps the module loader so unit tests can simulate a missing
 * extension, rejected prompts, or malformed payloads without a browser.
 * Pass `null` to restore the real `@stellar/freighter-api` import.
 */
export function __setFreighterLoaderForTests(loader: (() => Promise<FreighterApi>) | null): void {
  freighterLoader = loader ?? defaultFreighterLoader;
}

const getFreighter = async (): Promise<FreighterApi> => {
  try {
    return await freighterLoader();
  } catch (error) {
    // A failed module import means the integration itself is unavailable;
    // never leak raw bundler/module-resolution text into the UI.
    throw new FreighterError('NOT_INSTALLED', DEFAULT_ERROR_MESSAGES.NOT_INSTALLED, { cause: error });
  }
};

/** Store patch describing a failure: message + category kept in lockstep. */
const errorPatch = (error: FreighterError): Pick<FreighterWalletState, 'error' | 'errorCode'> => ({
  error: error.message,
  errorCode: error.code,
});

const isValidStellarAddress = (value: string | null | undefined): value is string =>
  typeof value === 'string' && STELLAR_ADDRESS_RE.test(value);

const resolveWalletAddress = (value: unknown): string | null => {
  if (typeof value === 'string') return isValidStellarAddress(value) ? value : null;
  if (value && typeof value === 'object') {
    const candidate = (value as { address?: string; publicKey?: string }).address ?? (value as { address?: string; publicKey?: string }).publicKey;
    return isValidStellarAddress(candidate) ? candidate : null;
  }
  return null;
};

const resolveNetwork = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return (value as { network?: string }).network ?? null;
  }
  return null;
};

const resolvePassphrase = (value: unknown): string | null => {
  if (value && typeof value === 'object') {
    const passphrase = (value as { networkPassphrase?: string }).networkPassphrase;
    return passphrase && passphrase.trim() ? passphrase : null;
  }
  return null;
};

/**
 * Module-level singleton for the WatchWalletChanges subscription so multiple
 * consumers mounting/unmounting never leak duplicate polling watchers.
 */
let walletWatcher: { stop: () => void } | null = null;

/**
 * In-flight connect request. A second click while the Freighter approval
 * popup is still open reuses the pending request instead of stacking a second
 * prompt (and a second, racing state transition).
 */
let connectInFlight: Promise<string | null> | null = null;

/**
 * Whether the extension answered at all for this failure category. Only a
 * missing extension flips `isInstalled` off; ambiguous failures (timeouts,
 * unknown errors) keep the last known value instead of guessing.
 */
const installedAfterFailure = (failure: FreighterError, previous: boolean): boolean => {
  switch (failure.code) {
    case 'NOT_INSTALLED':
      return false;
    case 'USER_DECLINED':
    case 'LOCKED':
    case 'INVALID_RESPONSE':
    case 'NETWORK_MISMATCH':
      return true;
    default:
      return previous;
  }
};

/** True once the persisted snapshot has been merged into the live store. */
let persistedStateRestored = false;

/** localStorage key for the persisted Freighter connection snapshot. */
export const FREIGHTER_PERSIST_KEY = 'astroid-freighter-wallet';

/**
 * The only slice of wallet state that survives a reload. The live network
 * passphrase is deliberately excluded: the signing gate must always re-read it
 * from the extension and fail closed, never trust a stored value.
 */
export interface PersistedFreighterState {
  status: 'connected' | 'disconnected';
  publicKey: string | null;
}

/** Persist the connection only while it is healthy and its key is valid. */
export const partializeFreighterState = (
  state: Pick<FreighterWalletState, 'status' | 'publicKey'>,
): PersistedFreighterState =>
  state.status === 'connected' && isValidStellarAddress(state.publicKey)
    ? { status: 'connected', publicKey: state.publicKey }
    : { status: 'disconnected', publicKey: null };

/**
 * Validates whatever came out of storage (it may be stale, hand-edited or from
 * another version) before it is merged into the live store. Anything malformed
 * leaves the default disconnected state untouched.
 */
export const mergePersistedFreighterState = (
  persisted: unknown,
  current: FreighterWalletState,
): FreighterWalletState => {
  if (!persisted || typeof persisted !== 'object') return current;
  const { status, publicKey } = persisted as Partial<PersistedFreighterState>;
  if (status !== 'connected' || !isValidStellarAddress(publicKey)) return current;
  // Optimistic until `hydrate()` confirms the extension still agrees.
  return { ...current, status: 'connected', publicKey };
};

const storeCreator: StateCreator<FreighterWalletState, [], [['zustand/persist', unknown]]> = (set, get) => ({
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

  clearError: () => {
    set({ error: null, errorCode: null });
  },

  checkExtension: async () => {
    try {
      const freighter = await getFreighter();
      const connectedResult =
        typeof freighter.isConnected === 'function'
          ? assertNoApiError(await withTimeout(freighter.isConnected()))
          : { isConnected: true };
      const connected =
        typeof connectedResult === 'boolean'
          ? connectedResult
          : Boolean((connectedResult as { isConnected?: boolean } | undefined)?.isConnected);
      set({ isInstalled: true, status: connected ? 'connected' : 'disconnected' });
      return Boolean(connected);
    } catch (error) {
      const failure = classifyFreighterError(error);
      set({
        isInstalled: installedAfterFailure(failure, false),
        status: failure.code === 'LOCKED' ? 'locked' : 'disconnected',
        ...errorPatch(failure),
      });
      return false;
    }
  },

  connect: () => {
    if (connectInFlight) return connectInFlight;

    const previous = get();
    set({ status: 'connecting', error: null, errorCode: null });

    const run = async (): Promise<string | null> => {
      try {
        const freighter = await getFreighter();
        const installed =
          typeof window !== 'undefined' && !!(window as typeof window & { freighter?: unknown }).freighter;
        if (!installed && typeof freighter.isConnected !== 'function') {
          throw new FreighterError('NOT_INSTALLED', 'Freighter extension is not installed.');
        }

        if (typeof freighter.setAllowed === 'function') {
          const allowed = assertNoApiError(await withTimeout(freighter.setAllowed()));
          const isAllowed =
            typeof allowed === 'boolean' ? allowed : Boolean((allowed as { isAllowed?: boolean })?.isAllowed);
          if (!isAllowed) {
            throw new FreighterError(
              'USER_DECLINED',
              'Freighter access was rejected. Please approve the connection request.',
            );
          }
        }

        const addressResult =
          typeof freighter.getAddress === 'function'
            ? assertNoApiError(await withTimeout(freighter.getAddress()))
            : null;
        const publicKey = resolveWalletAddress(addressResult);
        if (!publicKey) {
          throw new FreighterError('INVALID_RESPONSE', 'Freighter did not return a valid Stellar public key.');
        }

        // A network lookup failure must not abort an approved connection: the
        // passphrase stays null and the signing gate fails closed on it.
        const networkResult =
          typeof freighter.getNetwork === 'function'
            ? await withTimeout(freighter.getNetwork())
                .then(assertNoApiError)
                .catch(() => null)
            : null;
        const network = resolveNetwork(networkResult) ?? 'testnet';
        const networkPassphrase = resolvePassphrase(networkResult);

        set({
          status: 'connected',
          isInstalled: true,
          publicKey,
          network,
          networkPassphrase,
          error: null,
          errorCode: null,
        });

        return publicKey;
      } catch (error) {
        const failure = classifyFreighterError(error);

        // Dismissing a re-connect prompt must not tear down a session that was
        // already healthy: restore it and only surface the decline.
        if (failure.code === 'USER_DECLINED' && previous.status === 'connected' && previous.publicKey) {
          set({
            status: 'connected',
            publicKey: previous.publicKey,
            network: previous.network,
            networkPassphrase: previous.networkPassphrase,
            isInstalled: true,
            ...errorPatch(failure),
          });
          return null;
        }

        set({
          status: failure.code === 'LOCKED' ? 'locked' : 'disconnected',
          isInstalled: installedAfterFailure(failure, previous.isInstalled),
          publicKey: null,
          network: null,
          networkPassphrase: null,
          ...errorPatch(failure),
        });
        return null;
      }
    };

    connectInFlight = run().finally(() => {
      connectInFlight = null;
    });
    return connectInFlight;
  },

  disconnect: () => {
    set({
      status: 'disconnected',
      publicKey: null,
      network: null,
      networkPassphrase: null,
      isSigning: false,
      error: null,
      errorCode: null,
    });
  },

  refreshNetwork: async () => {
    try {
      const freighter = await getFreighter();
      if (typeof freighter.getNetwork !== 'function') return;
      const result = assertNoApiError(await withTimeout(freighter.getNetwork()));
      const network = resolveNetwork(result);
      const networkPassphrase = resolvePassphrase(result);
      set({
        network: network ?? get().network,
        networkPassphrase,
      });
    } catch {
      // Leave the last known values untouched; the signing gate treats an
      // unknown/unverifiable wallet network as a mismatch (fail closed).
    }
  },

  switchNetwork: async (target) => {
    const legacyMainnet = target === 'mainnet';
    if (legacyMainnet) {
      if (get().status !== 'connected' || !get().publicKey) {
        set({ error: 'Connect a Freighter wallet before switching networks.', errorCode: 'UNKNOWN' });
        return false;
      }
    }

    const networkTarget: StellarNetworkId = legacyMainnet ? 'public' : target;
    set({ targetNetwork: networkTarget, isSwitching: true, error: null, errorCode: null });
    try {
      await get().refreshNetwork();
    } finally {
      // Always release the switching spinner, even if the refresh throws.
      set({ isSwitching: false });
    }
    const expected = resolveExpectedPassphrase(networkTarget);
    const matched = get().networkPassphrase === expected;
    return legacyMainnet ? matched : { matched };
  },

  startWalletWatch: () => {
    if (typeof window === 'undefined') return;
    walletWatcher?.stop();
    walletWatcher = null;

    void (async () => {
      try {
        const freighter = await getFreighter();
        const Watcher = freighter.WatchWalletChanges;
        if (typeof Watcher !== 'function') return;

        const watcher = new Watcher(4000);
        walletWatcher = watcher;
        watcher.watch(({ address, network, networkPassphrase, error }) => {
          if (error || !isValidStellarAddress(address)) {
            // Wallet locked, switched to an unsupported account, or lost the
            // connection: reflect a clean disconnected state rather than
            // keeping stale signing context around.
            set({ status: 'disconnected', publicKey: null, networkPassphrase: null });
            return;
          }

          const state = get();
          const patch: Partial<Pick<FreighterWalletState, 'status' | 'isInstalled' | 'publicKey' | 'network' | 'networkPassphrase'>> = {};
          if (state.publicKey !== address) {
            patch.publicKey = address;
            patch.status = 'connected';
            patch.isInstalled = true;
          }
          if (network && state.network !== network) patch.network = network;
          const nextPassphrase = networkPassphrase && networkPassphrase.trim() ? networkPassphrase : null;
          if (state.networkPassphrase !== nextPassphrase) patch.networkPassphrase = nextPassphrase;
          if (Object.keys(patch).length > 0) set(patch);
        });
      } catch {
        // Extension unavailable — watching is simply a no-op until connect().
      }
    })();
  },

  stopWalletWatch: () => {
    walletWatcher?.stop();
    walletWatcher = null;
  },

  adoptConnection: (publicKey) => {
    if (!isValidStellarAddress(publicKey)) {
      get().disconnect();
      return;
    }
    if (get().status === 'connected' && get().publicKey === publicKey) return;
    set({ status: 'connected', isInstalled: true, publicKey, error: null, errorCode: null });
  },

  updatePublicKey: (publicKey) => {
    if (!isValidStellarAddress(publicKey)) {
      throw new Error('Invalid Stellar public key.');
    }
    set({ status: 'connected', isInstalled: true, publicKey, error: null, errorCode: null });
  },

  requestSignature: async (xdr: string, options?: { networkPassphrase?: string }) => {
    if (!xdr || !xdr.trim()) {
      throw new Error('Transaction XDR is required to request a signature.');
    }

    // Fail-closed network gate: never sign against a wallet network that
    // differs from the expected one, and never sign when the wallet's
    // network cannot be verified at all.
    const expectedPassphrase = options?.networkPassphrase ?? resolveExpectedPassphrase(get().targetNetwork);
    let walletPassphrase = get().networkPassphrase;
    if (!walletPassphrase) {
      await get().refreshNetwork();
      walletPassphrase = get().networkPassphrase;
    }
    if (isNetworkMismatch(walletPassphrase, expectedPassphrase)) {
      const walletLabel = networkLabelForId(networkIdForPassphrase(walletPassphrase));
      const expectedLabel = networkLabelForId(networkIdForPassphrase(expectedPassphrase));
      const mismatch = new FreighterError(
        'NETWORK_MISMATCH',
        `Network mismatch: Freighter is on ${walletLabel}, but this action targets ${expectedLabel}. Switch the wallet to ${expectedLabel} before signing.`,
      );
      set(errorPatch(mismatch));
      throw mismatch;
    }

    set({ isSigning: true, error: null, errorCode: null });
    try {
      const freighter = await getFreighter();
      if (typeof freighter.signTransaction !== 'function') {
        throw new FreighterError('NOT_INSTALLED', 'Freighter does not expose transaction signing support.');
      }

      const response = assertNoApiError(
        await withTimeout(
          freighter.signTransaction(xdr, expectedPassphrase ? { networkPassphrase: expectedPassphrase } : undefined),
        ),
      );
      const signedXdr =
        typeof response === 'string'
          ? response
          : (response as { signedTxXdr?: string; signedXDR?: string; xdr?: string })?.signedTxXdr ??
            (response as { signedTxXdr?: string; signedXDR?: string; xdr?: string })?.signedXDR ??
            (response as { signedTxXdr?: string; signedXDR?: string; xdr?: string })?.xdr;

      if (!signedXdr) {
        throw new FreighterError('INVALID_RESPONSE', 'Freighter did not return a signed transaction payload.');
      }

      return signedXdr;
    } catch (error) {
      const failure = classifyFreighterError(error);
      // Declining, timing out, or a malformed payload are per-request failures:
      // the wallet session itself is still valid, so keep it connected. Only a
      // vanished extension or a locked wallet invalidates the session.
      if (failure.code === 'NOT_INSTALLED') {
        set({
          status: 'disconnected',
          isInstalled: false,
          publicKey: null,
          network: null,
          networkPassphrase: null,
          ...errorPatch(failure),
        });
      } else if (failure.code === 'LOCKED') {
        set({ status: 'locked', publicKey: null, networkPassphrase: null, ...errorPatch(failure) });
      } else {
        set(errorPatch(failure));
      }
      throw failure;
    } finally {
      set({ isSigning: false });
    }
  },

  hydrate: async () => {
    // Never re-sync while a user-facing prompt is open: the background poll
    // would otherwise flip the `connecting` spinner to `locked`/`disconnected`
    // while the user is still looking at the Freighter popup.
    if (connectInFlight || get().isSigning) {
      // State produced by the open prompt is fresher than any stored
      // snapshot, so never merge the snapshot over it on a later poll.
      persistedStateRestored = true;
      return;
    }

    // Restore the persisted snapshot first (client only; see skipHydration
    // below) so a reload keeps the last connection while the extension is
    // re-verified.
    // Only once: `hydrate()` also runs on a poll, and later runs must not
    // re-merge a stored snapshot over fresher in-memory state.
    if (!persistedStateRestored) {
      persistedStateRestored = true;
      await useFreighterStore.persist.rehydrate();
    }
    try {
      const freighter = await getFreighter();
      const connectedResult = typeof freighter.isConnected === 'function'
        ? assertNoApiError(await withTimeout(freighter.isConnected()))
        : false;
      const connected = typeof connectedResult === 'boolean'
        ? connectedResult
        : Boolean((connectedResult as { isConnected?: boolean } | null)?.isConnected);

      if (!connected) {
        set({
          status: 'disconnected',
          publicKey: null,
          network: null,
          networkPassphrase: null,
          isInstalled: false,
          error: null,
          errorCode: null,
        });
        return;
      }

      const addressResult = typeof freighter.getAddress === 'function'
        ? await withTimeout(freighter.getAddress())
        : null;
      const walletAddress = resolveWalletAddress(addressResult);

      if (!walletAddress) {
        // The extension answered but exposed no address: the wallet is locked
        // or access was not granted. Surface a dedicated `locked` state so the
        // top bar can alert and offer a reconnect instead of silently showing
        // a generic disconnect.
        set({
          status: 'locked',
          publicKey: null,
          network: null,
          networkPassphrase: null,
          isInstalled: true,
          error: 'Freighter is locked or wallet access is unavailable.',
          errorCode: 'LOCKED',
        });
        return;
      }

      // A network lookup failure must not invalidate an otherwise healthy
      // connection: keep the last-known values and let the signing gate fail
      // closed on an unknown passphrase.
      const networkResult =
        typeof freighter.getNetwork === 'function'
          ? await withTimeout(freighter.getNetwork())
              .then(assertNoApiError)
              .catch(() => null)
          : null;

      set({
        isInstalled: true,
        status: 'connected',
        publicKey: walletAddress,
        network: resolveNetwork(networkResult) ?? 'testnet',
        networkPassphrase: resolvePassphrase(networkResult),
        error: null,
        errorCode: null,
      });
    } catch (error) {
      const failure = classifyFreighterError(error);
      const isLocked = failure.code === 'LOCKED';
      set({
        status: isLocked ? 'locked' : 'disconnected',
        publicKey: null,
        network: null,
        networkPassphrase: null,
        isInstalled: isLocked,
        ...errorPatch(failure),
      });
    }
  },
});

export const useFreighterStore = create<FreighterWalletState>()(
  persist(storeCreator, {
    name: FREIGHTER_PERSIST_KEY,
    version: 1,
    storage: createJSONStorage(() => safeLocalStorage),
    partialize: partializeFreighterState,
    merge: mergePersistedFreighterState,
    // Rehydrating during store creation would make the first client render
    // differ from the server HTML. `hydrate()` rehydrates from an effect.
    skipHydration: true,
  }),
);
export const isValidStellarPublicKey = isValidStellarAddress;
