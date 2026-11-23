import type { StateStorage } from 'zustand/middleware';

/**
 * `localStorage` wrapper for persisted zustand stores. Every call resolves
 * `window.localStorage` lazily and swallows failures, so a store can be
 * created during SSR (no `window`) or in browsers that block storage (private
 * mode, disabled cookies, quota exceeded) without ever throwing.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(name, value);
    } catch {
      return;
    }
  },
  removeItem: (name) => {
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(name);
    } catch {
      return;
    }
  },
};
