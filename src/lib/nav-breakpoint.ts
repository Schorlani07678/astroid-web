/**
 * Width at which the sidebar switches between its two layouts:
 * below it the hamburger-triggered drawer, from it up the pinned sidebar.
 *
 * Tailwind's `md` breakpoint is 768px. Keep this value, the `md:` classes in
 * `topbar.tsx`, `desktop-sidebar.tsx` and `mobile-nav.tsx`, and the media query
 * below in step.
 */
export const SIDEBAR_BREAKPOINT_PX = 768;

/** Media query that is true when the pinned sidebar (not the drawer) is shown. */
export const SIDEBAR_DESKTOP_QUERY = `(min-width: ${SIDEBAR_BREAKPOINT_PX}px)`;
