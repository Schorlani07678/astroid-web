'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Wallet,
  AlertTriangle,
  ShieldAlert,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { focusTrapStack } from '@/hooks/focusTrapStack';
import { cn } from '@/lib/cn';
import { useNotificationStore } from '@/stores/notification-store';
import type { NotificationType, AppNotification } from '@/types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOTIFICATION_ICON: Record<NotificationType, React.ElementType> = {
  budget_exceeded: AlertCircle,
  proposal_created: FileText,
  proposal_approved: CheckCircle2,
  proposal_rejected: XCircle,
  wallet_funded: Wallet,
  payment_failed: XCircle,
  policy_violation: AlertTriangle,
  risk_alert: ShieldAlert,
};

const NOTIFICATION_COLOR: Record<NotificationType, string> = {
  budget_exceeded: 'text-warning',
  proposal_created: 'text-gold',
  proposal_approved: 'text-success',
  proposal_rejected: 'text-danger',
  wallet_funded: 'text-info',
  payment_failed: 'text-danger',
  policy_violation: 'text-warning',
  risk_alert: 'text-danger',
};

const FILTER_OPTIONS: { label: string; value: NotificationType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Budgets', value: 'budget_exceeded' },
  { label: 'Proposals', value: 'proposal_created' },
  { label: 'Approvals', value: 'proposal_approved' },
  { label: 'Rejections', value: 'proposal_rejected' },
  { label: 'Payments', value: 'wallet_funded' },
  { label: 'Alerts', value: 'risk_alert' },
  { label: 'Policy', value: 'policy_violation' },
];

/** Shared, brand-tinted focus ring for notification controls (WCAG AA). */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Notification Item
// ---------------------------------------------------------------------------

interface NotificationItemProps {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

function NotificationItem({ notification, onMarkRead, onDismiss }: NotificationItemProps) {
  const Icon = NOTIFICATION_ICON[notification.type] ?? Bell;
  const colorClass = NOTIFICATION_COLOR[notification.type] ?? 'text-foreground-secondary';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div
        className={cn(
          'group relative flex items-start gap-3 border-b border-border px-4 py-3 transition-colors duration-fast',
          notification.read ? 'bg-transparent' : 'bg-gold-soft/40',
        )}
      >
        {/* Unread dot */}
        {!notification.read && (
          <span className="absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full bg-gold" aria-label="Unread" />
        )}

        {/* Icon */}
        <span className={cn('mt-0.5 shrink-0', colorClass)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className={cn('text-xs font-medium leading-snug', notification.read ? 'text-foreground-secondary' : 'text-foreground')}>
            {notification.title}
          </p>
          <p className="mt-0.5 text-2xs leading-relaxed text-foreground-muted line-clamp-2">
            {notification.body}
          </p>
          <span className="mt-1 inline-block text-2xs text-foreground-muted">
            {timeAgo(notification.createdAt)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {!notification.read && (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              className={cn(
                'grid h-6 w-6 place-items-center rounded-xs text-foreground-muted transition-colors hover:bg-surface-secondary hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                FOCUS_RING,
              )}
              aria-label="Mark as read"
              title="Mark as read"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(notification.id)}
            className={cn(
              'grid h-6 w-6 place-items-center rounded-xs text-foreground-muted transition-colors hover:bg-danger-soft hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              FOCUS_RING,
            )}
            aria-label="Dismiss notification"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// NotificationCenter (popover)
// ---------------------------------------------------------------------------

export function NotificationCenter() {
  const open = useNotificationStore((s) => s.open);
  const setOpen = useNotificationStore((s) => s.setOpen);
  const toggle = useNotificationStore((s) => s.toggle);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const visibleNotifications = useNotificationStore((s) => s.visibleNotifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const filter = useNotificationStore((s) => s.filter);
  const setFilter = useNotificationStore((s) => s.setFilter);
  const setNotifications = useNotificationStore((s) => s.setNotifications);

  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const unread = unreadCount();
  const visible = visibleNotifications();

  // Seed notifications on first render (mirrors query data into the store)
  useEffect(() => {
    import('@/services/resources').then(({ resources }) => {
      resources.getNotifications().then((items) => {
        setNotifications(items);
      });
    });
  }, [setNotifications]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      // A modal stacked above owns Escape; otherwise close and hand focus back
      // to the bell so keyboard users are not dropped at the top of the page.
      if (e.key !== 'Escape' || e.defaultPrevented || focusTrapStack.size() > 0) return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, setOpen]);

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={cn(
          'relative grid h-9 w-9 place-items-center rounded-button text-foreground-secondary transition-colors duration-fast hover:bg-surface-secondary hover:text-foreground',
          FOCUS_RING,
        )}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unread > 0 && (
          <motion.span
            key={unread}
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-xs bg-gold px-1 text-[10px] font-bold text-background-secondary"
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </button>

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            role="dialog"
            aria-label="Notification center"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass absolute right-0 top-full z-50 mt-2 flex w-[380px] max-h-[480px] flex-col overflow-hidden rounded-md shadow-soft-2"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
              <div className="flex items-center gap-1.5">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-xs px-2 py-1 text-2xs font-medium text-gold transition-colors hover:bg-gold-soft',
                      FOCUS_RING,
                    )}
                    aria-label="Mark all as read"
                  >
                    <CheckCheck className="h-3 w-3" aria-hidden />
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={cn(
                    'grid h-6 w-6 place-items-center rounded-xs text-foreground-muted transition-colors hover:bg-surface-secondary hover:text-foreground',
                    FOCUS_RING,
                  )}
                  aria-label="Close notifications"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 scrollbar-none">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-2xs font-medium transition-colors',
                    filter.type === opt.value
                      ? 'bg-gold text-gold-foreground'
                      : 'bg-surface-secondary text-foreground-secondary hover:bg-surface-secondary/80',
                    FOCUS_RING,
                  )}
                  aria-pressed={filter.type === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Bell className="mb-2 h-8 w-8 text-foreground-muted" aria-hidden />
                  <p className="text-xs font-medium text-foreground-secondary">No notifications</p>
                  <p className="mt-0.5 text-2xs text-foreground-muted">
                    {filter.type === 'all' ? "You're all caught up." : 'No notifications in this category.'}
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {visible.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onMarkRead={markRead}
                      onDismiss={dismiss}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-2.5">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-center text-xs font-medium text-gold transition-colors hover:text-gold-strong"
              >
                View all notifications
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
