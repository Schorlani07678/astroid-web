'use client';

import React from 'react';

export interface ApprovalStatusLiveRegionProps {
  /**
   * Text to announce. Keep the node mounted and change this string: screen
   * readers do not reliably announce a region that is inserted on the same
   * render as the update.
   */
  message: string;
  /** Use `alert` semantics for failures; decisions use polite `status`. */
  assertive?: boolean;
}

/**
 * Visually hidden approval announcement.
 *
 * The element is always rendered by its parent so the accessibility tree has
 * the live region before a decision, signing state or error changes. Render
 * one polite region for progress/decisions and one assertive region for errors.
 */
export function ApprovalStatusLiveRegion({
  message,
  assertive = false,
}: ApprovalStatusLiveRegionProps) {
  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}

export default ApprovalStatusLiveRegion;
