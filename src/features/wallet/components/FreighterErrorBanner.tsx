'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ExternalLink, Lock, RefreshCw, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useFreighterStore, type FreighterErrorCode } from '@/stores/freighter-store';
import {
  FREIGHTER_INSTALL_URL,
  getFreighterRecovery,
} from '../freighterErrorRecovery';

const ICONS: Record<FreighterErrorCode, typeof AlertTriangle> = {
  NOT_INSTALLED: WifiOff,
  USER_DECLINED: AlertTriangle,
  TIMEOUT: RefreshCw,
  LOCKED: Lock,
  NETWORK_MISMATCH: AlertTriangle,
  INVALID_RESPONSE: AlertTriangle,
  UNKNOWN: AlertTriangle,
};

export interface FreighterErrorBannerProps {
  className?: string;
  /**
   * Called after a successful retry with the connected public key. Lets the
   * auth screen continue its login flow without duplicating the retry logic.
   */
  onRecovered?: (publicKey: string) => void;
}

/**
 * Store-driven recovery banner for Freighter failures. Each error code gets its
 * own copy and primary action (install, retry, unlock-and-retry, reload), so an
 * operator is never left on a spinner with no way forward.
 */
export function FreighterErrorBanner({ className, onRecovered }: FreighterErrorBannerProps) {
  const error = useFreighterStore((s) => s.error);
  const errorCode = useFreighterStore((s) => s.errorCode);
  const retryCount = useFreighterStore((s) => s.retryCount);
  const status = useFreighterStore((s) => s.status);
  const retryConnection = useFreighterStore((s) => s.retryConnection);
  const clearError = useFreighterStore((s) => s.clearError);

  const visible = Boolean(error);
  const code: FreighterErrorCode = errorCode ?? 'UNKNOWN';
  const recovery = getFreighterRecovery(code, retryCount);
  const Icon = ICONS[code];
  const retrying = status === 'connecting';

  const handleAction = async () => {
    if (recovery.action === 'install') {
      window.open(FREIGHTER_INSTALL_URL, '_blank', 'noopener,noreferrer');
      return;
    }
    if (recovery.action === 'reload') {
      window.location.reload();
      return;
    }
    const publicKey = await retryConnection();
    if (publicKey) onRecovered?.(publicKey);
  };

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key={code}
          role="alert"
          data-error-code={code}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className={cn(
            'rounded-lg border p-4 text-left',
            recovery.tone === 'danger'
              ? 'border-danger/40 bg-danger-soft'
              : 'border-warning/40 bg-warning-soft',
            className,
          )}
        >
          <div className="flex items-start gap-3">
            <Icon
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                recovery.tone === 'danger' ? 'text-danger' : 'text-warning',
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold text-foreground">{recovery.title}</p>
              <p className="text-xs text-foreground-secondary">{recovery.description}</p>
              {error && error !== recovery.description && (
                <p className="break-words text-2xs text-foreground-muted">Details: {error}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant={recovery.tone === 'danger' ? 'primary' : 'secondary'}
                  loading={retrying}
                  disabled={retrying}
                  onClick={() => void handleAction()}
                  rightIcon={
                    recovery.action === 'install' ? (
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    ) : undefined
                  }
                >
                  {recovery.actionLabel}
                </Button>
                {retryCount > 0 && recovery.action !== 'install' && (
                  <span className="text-2xs text-foreground-muted">
                    Attempt {retryCount + 1}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Dismiss wallet error"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
