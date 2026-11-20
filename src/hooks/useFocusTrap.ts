'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { focusTrapStack } from './focusTrapStack';

/**
 * Elements that can receive focus through sequential keyboard navigation.
 * Disabled controls, hidden inputs and `tabindex="-1"` elements are filtered
 * out again at runtime because they are either not focusable or intentionally
 * removed from the tab order.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** True when an element can actually receive keyboard focus right now. */
export function isKeyboardFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (element.closest('[aria-hidden="true"]')) return false;
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  return (
    element.offsetWidth > 0 ||
    element.offsetHeight > 0 ||
    element.getClientRects().length > 0
  );
}

export interface UseFocusTrapOptions {
  /** Whether the modal/drawer is currently open. */
  active: boolean;
  /** The dialog or drawer panel that should contain keyboard focus. */
  containerRef: RefObject<HTMLElement | null>;
  /** Called when Escape is pressed while the trap is active. */
  onEscape?: () => void;
  /** Optional element to focus when the trap activates (defaults to the container). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Restore focus to the previously focused element on close. Defaults to true. */
  restoreFocus?: boolean;
  /** Prevent the background page from scrolling while open. Defaults to true. */
  lockScroll?: boolean;
}

/**
 * Reusable focus management for modal dialogs and drawers.
 *
 * While active it:
 * - Moves focus into the panel (or a provided initial-focus element).
 * - Cycles Tab / Shift+Tab only through visible, enabled focusables inside it.
 * - Pulls focus back inside if it has drifted to the background.
 * - Calls `onEscape` when Escape is pressed.
 * - Locks body scrolling.
 * - Restores focus to the trigger when closed.
 * - Participates in a shared trap stack: when overlays are nested, only the
 *   innermost one handles Tab/Escape (see `focusTrapStack`).
 *
 * The effect depends only on `active` and the container ref. Callbacks are
 * stored in refs so unstable inline handlers do not re-capture the trigger and
 * steal focus on every parent render.
 */
export function useFocusTrap({
  active,
  containerRef,
  onEscape,
  initialFocusRef,
  restoreFocus = true,
  lockScroll = true,
}: UseFocusTrapOptions): void {
  const onEscapeRef = useRef(onEscape);
  const initialFocusRefRef = useRef(initialFocusRef);
  const optionsRef = useRef({ restoreFocus, lockScroll });

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    initialFocusRefRef.current = initialFocusRef;
  }, [initialFocusRef]);

  useEffect(() => {
    optionsRef.current = { restoreFocus, lockScroll };
  }, [restoreFocus, lockScroll]);

  useEffect(() => {
    if (!active) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusables = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(isKeyboardFocusable);

    const focusInitial = () => {
      const target = initialFocusRefRef.current?.current ?? container;
      target.focus({ preventScroll: true });
    };

    const layer = focusTrapStack.push();

    const handleKeyDown = (event: KeyboardEvent) => {
      // Nested overlays: only the innermost trap reacts, so one Escape closes
      // one layer and an outer trap never pulls focus out of an inner dialog.
      if (!focusTrapStack.isTop(layer)) return;

      if (event.key === 'Escape') {
        if (onEscapeRef.current) {
          event.preventDefault();
          event.stopPropagation();
          onEscapeRef.current();
        }
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = getFocusables();
      if (focusables.length === 0) {
        // Nothing focusable inside: pin focus to the panel itself so Tab
        // cannot escape to the page behind the overlay.
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const activeElement = document.activeElement;

      if (!container.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (activeElement === first || activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    if (optionsRef.current.lockScroll) {
      document.body.style.overflow = 'hidden';
    }

    focusInitial();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      focusTrapStack.release(layer);

      if (optionsRef.current.lockScroll) {
        document.body.style.overflow = previousOverflow;
      }

      if (
        optionsRef.current.restoreFocus &&
        previouslyFocused &&
        previouslyFocused !== document.body &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef]);
}
