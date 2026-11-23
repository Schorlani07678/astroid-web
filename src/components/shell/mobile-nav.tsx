'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { PanelLeftClose, PanelLeftOpen, X, Sparkles } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { navSections } from '@/lib/nav';
import { SIDEBAR_DESKTOP_QUERY } from '@/lib/nav-breakpoint';
import { cn } from '@/lib/cn';
import { usePreferencesStore } from '@/stores/preferences-store';
import { useHydrated } from '@/hooks/use-hydrated';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

/** Shared, brand-tinted focus ring for drawer controls (WCAG AA). */
const DRAWER_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Matches the `md` breakpoint, from which the pinned sidebar replaces the drawer. */
const DESKTOP_QUERY = SIDEBAR_DESKTOP_QUERY;

/**
 * Slide-in navigation for narrow viewports (mirrors the desktop command dock).
 *
 * Framer Motion drives the open and close animation, and `AnimatePresence`
 * keeps the panel out of the DOM entirely while closed — so an off-screen
 * drawer can never put its links in the keyboard tab order. While open the
 * drawer traps focus, closes on Escape, on backdrop click, and on selecting a
 * link (including a link to the current route), locks body scroll, and returns
 * focus to whatever opened it. Animation collapses to an instant state change
 * when the viewer prefers reduced motion.
 */
export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hydrated = useHydrated();
  const sidebarCollapsed = usePreferencesStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = usePreferencesStore((state) => state.setSidebarCollapsed);
  const compactNavigation = hydrated && sidebarCollapsed;
  const shouldReduceMotion = useReducedMotion();

  // Dismiss on route change — but not on first mount, where there is no
  // navigation to react to.
  const lastPathRef = useRef(pathname);
  useEffect(() => {
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  // Growing past `lg` swaps the drawer for the dock; leaving it open there
  // would trap focus in a panel the viewport no longer shows.
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia(DESKTOP_QUERY);
    if (query.matches) {
      onClose();
      return undefined;
    }
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) onClose();
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [open, onClose]);

  // Escape dismissal, focus trap, scroll lock, and trigger focus restoration.
  useFocusTrap({
    active: open,
    containerRef: panelRef,
    onEscape: onClose,
    initialFocusRef: closeButtonRef,
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
        id="mobile-nav-drawer"
        ref={panelRef}
        role="dialog"
        aria-label="Navigation"
        aria-modal="true"
        initial={{ x: shouldReduceMotion ? 0 : '-100%', opacity: shouldReduceMotion ? 0 : 1 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: shouldReduceMotion ? 0 : '-100%', opacity: shouldReduceMotion ? 0 : 1 }}
        transition={{ type: shouldReduceMotion ? 'tween' : 'spring', damping: 25, stiffness: 250 }}
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full flex-col border-r border-border bg-surface shadow-soft-3',
          compactNavigation ? 'w-[76px]' : 'w-[264px]',
        )}
      >
        <div className={cn('flex h-16 items-center justify-between', compactNavigation ? 'px-3' : 'px-5')}>
          <span className="gap-2.5 flex items-center">
            <span className="grid h-8 w-8 place-items-center rounded-button bg-accent-gradient text-white shadow-gold">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <span className={cn('font-display text-lg font-semibold tracking-tight', compactNavigation && 'sr-only')}>
              Astroid
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-button text-foreground-secondary transition-colors duration-fast hover:bg-surface-secondary hover:text-foreground',
                DRAWER_FOCUS,
              )}
              aria-label={compactNavigation ? 'Expand navigation' : 'Collapse navigation'}
              title={compactNavigation ? 'Expand navigation' : 'Collapse navigation'}
            >
              {compactNavigation
                ? <PanelLeftOpen className="h-4 w-4" aria-hidden />
                : <PanelLeftClose className="h-4 w-4" aria-hidden />}
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-button text-foreground-secondary transition-colors duration-fast hover:bg-surface-secondary hover:text-foreground',
                DRAWER_FOCUS,
              )}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <nav className={cn('flex-1 space-y-6 overflow-y-auto py-4', compactNavigation ? 'px-2' : 'px-3')}>
          {navSections.map((section) => (
            <div key={section.heading} className="space-y-1">
              {!compactNavigation && (
                <p className="px-3 pb-1 text-2xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
                  {section.heading}
                </p>
              )}
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    title={item.label}
                    className={cn(
                      DRAWER_FOCUS,
                      'flex items-center rounded-button py-2 text-sm font-medium transition-colors duration-fast',
                      compactNavigation ? 'justify-center px-2' : 'gap-3 px-3',
                      active
                        ? 'bg-surface-secondary text-foreground'
                        : 'text-foreground-secondary hover:bg-surface-secondary/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className={cn('truncate', compactNavigation && 'sr-only')}>{item.label}</span>
                    {item.signature && !compactNavigation && (
                      <span
                        className="h-1.5 w-1.5 ml-auto rounded-xs bg-gold"
                        aria-hidden
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
