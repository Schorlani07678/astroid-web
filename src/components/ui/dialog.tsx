'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';
import { Button } from './button';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /**
   * Element that receives focus when the dialog opens. Defaults to the panel
   * itself; pass a ref to a safe control (e.g. Cancel) for destructive flows.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const sizeClass = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

/**
 * Accessible modal dialog: portal, focus trap, Escape + overlay dismissal.
 * The panel is exposed as `role="dialog" aria-modal="true"` with
 * `aria-labelledby`/`aria-describedby` pointing at the title/description.
 *
 * Keyboard behaviour (WCAG 2.1 AA):
 * - Tab/Shift+Tab cycle only through enabled, visible focusables inside the
 *   panel; if focus has drifted outside (e.g. after clicking static text),
 *   the next Tab is pulled back into the dialog instead of leaking to the
 *   background page.
 * - Escape dismisses; the overlay click dismisses; body scrolling is locked.
 * - On open, focus moves to the dialog panel; on close, focus is restored to
 *   the element that was focused before opening (the trigger), if it is still
 *   in the document.
 * The trap effect depends only on `open` — an unstable `onClose` callback no
 * longer tears down and re-establishes the listener (which used to re-capture
 * the trigger and steal focus back to the panel on every parent re-render).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  initialFocusRef,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Track mount separately from `open` so the portal target exists before the
  // first render that needs it (React portals require an existing DOM node).
  // Making this state (rather than a ref) also re-runs the focus trap once the
  // panel is in the DOM, which matters when a dialog mounts already open.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useFocusTrap({
    active: open && mounted,
    containerRef: panelRef,
    onEscape: onClose,
    initialFocusRef,
  });

  // `isClient` guards the SSR pass; `mounted` must already be true when `open`
  // is first set because the component is rendered inside a client tree.
  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        className={cn(
          'relative z-10 w-full animate-fade-up rounded-dialog border border-border bg-surface shadow-soft-3 focus:outline-none',
          sizeClass[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-2">
          <div className="flex flex-col gap-1">
            {title && (
              <h2
                id={titleId}
                className="font-display text-xl font-semibold tracking-tight"
              >
                {title}
              </h2>
            )}
            {description && (
              <p id={descriptionId} className="text-xs text-foreground-secondary">
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <div className="p-6 pt-2">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-border p-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
