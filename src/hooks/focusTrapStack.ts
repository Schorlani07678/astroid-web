/**
 * Stack of currently active focus traps, innermost last.
 *
 * Every modal registers its own `keydown` listener on `document`. Without
 * coordination, opening a dialog from inside a drawer means one Escape closes
 * *both* overlays, and the outer trap's Tab handler sees focus "outside" its
 * panel and yanks it back out of the inner dialog. Only the top-most trap may
 * react to keyboard input; the others stay dormant until it is released.
 *
 * Kept framework-free so the ordering rules can be unit-tested in Node.
 */
export interface FocusTrapStack {
  /** Registers a trap as the new top-most layer and returns its token. */
  push: () => symbol;
  /** Removes a trap wherever it sits (traps can close out of order). */
  release: (token: symbol) => void;
  /** True when the given trap is the innermost active layer. */
  isTop: (token: symbol) => boolean;
  /** Number of active traps (exposed for tests and debugging). */
  size: () => number;
}

export function createFocusTrapStack(): FocusTrapStack {
  const layers: symbol[] = [];

  return {
    push: () => {
      const token = Symbol('focus-trap');
      layers.push(token);
      return token;
    },
    release: (token) => {
      const index = layers.lastIndexOf(token);
      if (index !== -1) layers.splice(index, 1);
    },
    isTop: (token) => layers.length > 0 && layers[layers.length - 1] === token,
    size: () => layers.length,
  };
}

/** App-wide stack shared by every `useFocusTrap` consumer. */
export const focusTrapStack = createFocusTrapStack();
