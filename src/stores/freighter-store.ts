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
  error: string | null;
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
    'startWalletWatch' | 'stopWalletWatch' | 'adoptConnection' | 'requestSignature' | 'hydrate'
>;

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

const withTimeout = async <T>(promise: Promise<T>, ms = 15000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return await new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Freighter wallet request timed out. Check that the extension is installed and unlocked.'));
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

const getFreighter = async () =>
  (await import('@stellar/freighter-api')) as unknown as {
    isConnected?: () => Promise<boolean | { isConnected?: boolean }>;
    setAllowed?: () => Promise<boolean | { isAllowed?: boolean }>;
    getAddress?: () => Promise<string | { address?: string; publicKey?: string }>;
    getNetwork?: () => Promise<string | FreighterNetworkResult>;
    signTransaction?: (xdr: string, options?: Record<string, unknown>) => Promise<string | { signedTxXdr?: string; signedXDR?: string; xdr?: string }>;
    WatchWalletChanges?: new (timeout?: number) => {
      watch: (
        cb: (params: { address: string; network: string; networkPassphrase: string; error?: unknown }) => void,
      ) => { error?: unknown };
      stop: () => void;
    };
  };

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
  error: null,

  checkExtension: async () => {
    try {
      const freighter = await getFreighter();
      const connectedResult = typeof freighter.isConnected === 'function' ? await withTimeout(freighter.isConnected()) : { isConnected: true };
      const connected = typeof connectedResult === 'boolean' ? connectedResult : Boolean((connectedResult as { isConnected?: boolean } | undefined)?.isConnected);
      set({ isInstalled: true, status: connected ? 'connected' : 'disconnected' });
      return Boolean(connected);
    } catch {
      set({ isInstalled: false, status: 'disconnected', error: 'Freighter extension is not installed or unavailable.' });
      return false;
    }
  },

  connect: async () => {
    set({ status: 'connecting', error: null });

    try {
      const freighter = await getFreighter();
      const installed = typeof window !== 'undefined' && !!(window as typeof window & { freighter?: unknown }).freighter;
      if (!installed && typeof freighter.isConnected !== 'function') {
        set({ isInstalled: false, status: 'disconnected', error: 'Freighter extension is not installed.' });
        return null;
      }

      if (typeof freighter.setAllowed === 'function') {
        const allowed = await withTimeout(freighter.setAllowed());
        const isAllowed = typeof allowed === 'boolean' ? allowed : Boolean((allowed as { isAllowed?: boolean })?.isAllowed);
        if (!isAllowed) {
          throw new Error('Freighter access was rejected. Please approve the connection request.');
        }
      }

      const addressResult = typeof freighter.getAddress === 'function' ? await withTimeout(freighter.getAddress()) : null;
      const publicKey = resolveWalletAddress(addressResult);
      if (!publicKey) {
        throw new Error('Freighter did not return a valid Stellar public key.');
      }

      const networkResult = typeof freighter.getNetwork === 'function' ? await withTimeout(freighter.getNetwork()) : null;
      const network = resolveNetwork(networkResult) ?? 'testnet';
      // Unknown passphrase stays null on purpose: signing gates fail closed.
      const networkPassphrase = resolvePassphrase(networkResult);

      set({
        status: 'connected',
        isInstalled: true,
        publicKey,
        network,
        networkPassphrase,
        error: null,
      });

      return publicKey;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to connect to the Freighter wallet.';
      set({
        status: 'disconnected',
        isInstalled: false,
        publicKey: null,
        network: null,
        networkPassphrase: null,
        error: message,
      });
      return null;
    }
  },

  disconnect: () => {
    set({ status: 'disconnected', publicKey: null, network: null, networkPassphrase: null, error: null });
  },

  refreshNetwork: async () => {
    try {
      const freighter = await getFreighter();
      if (typeof freighter.getNetwork !== 'function') return;
      const result = await withTimeout(freighter.getNetwork());
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
        set({ error: 'Connect a Freighter wallet before switching networks.' });
        return false;
      }
    }

    const networkTarget: StellarNetworkId = legacyMainnet ? 'public' : target;
    set({ targetNetwork: networkTarget, isSwitching: true, error: null });
    await get().refreshNetwork();
    const expected = resolveExpectedPassphrase(networkTarget);
    const matched = get().networkPassphrase === expected;
    set({ isSwitching: false });
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
    set({ status: 'connected', isInstalled: true, publicKey, error: null });
  },

  updatePublicKey: (publicKey) => {
    if (!isValidStellarAddress(publicKey)) {
      throw new Error('Invalid Stellar public key.');
    }
    set({ status: 'connected', isInstalled: true, publicKey, error: null });
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
      const message = `Network mismatch: Freighter is on ${walletLabel}, but this action targets ${expectedLabel}. Switch the wallet to ${expectedLabel} before signing.`;
      set({ error: message });
      throw new Error(message);
    }

    try {
      const freighter = await getFreighter();
      if (typeof freighter.signTransaction !== 'function') {
        throw new Error('Freighter does not expose transaction signing support.');
      }

      const response = await withTimeout(
        freighter.signTransaction(xdr, expectedPassphrase ? { networkPassphrase: expectedPassphrase } : undefined),
      );
      const signedXdr =
        typeof response === 'string'
          ? response
          : (response as { signedTxXdr?: string; signedXDR?: string; xdr?: string })?.signedTxXdr ??
            (response as { signedTxXdr?: string; signedXDR?: string; xdr?: string })?.signedXDR ??
            (response as { signedTxXdr?: string; signedXDR?: string; xdr?: string })?.xdr;

      if (!signedXdr) {
        throw new Error('Freighter did not return a signed transaction payload.');
      }

      return signedXdr;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signature request failed.';
      set({ error: message, status: 'disconnected' });
      throw error;
    }
  },

  hydrate: async () => {
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
        ? await withTimeout(freighter.isConnected())
        : false;
      const connected = typeof connectedResult === 'boolean'
        ? connectedResult
        : Boolean((connectedResult as { isConnected?: boolean } | null)?.isConnected);

      if (!connected) {
        set({ status: 'disconnected', publicKey: null, network: null, networkPassphrase: null, isInstalled: false, error: null });
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
        });
        return;
      }

      // A network lookup failure must not invalidate an otherwise healthy
      // connection: keep the last-known values and let the signing gate fail
      // closed on an unknown passphrase.
      const networkResult =
        typeof freighter.getNetwork === 'function'
          ? await withTimeout(freighter.getNetwork()).catch(() => null)
          : null;

      set({
        isInstalled: true,
        status: 'connected',
        publicKey: walletAddress,
        network: resolveNetwork(networkResult) ?? 'testnet',
        networkPassphrase: resolvePassphrase(networkResult),
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Freighter wallet status is unavailable.';
      const isLocked = /locked|unlock/i.test(message);
      set({
        status: isLocked ? 'locked' : 'disconnected',
        publicKey: null,
        network: null,
        networkPassphrase: null,
        isInstalled: isLocked,
        error: message,
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
