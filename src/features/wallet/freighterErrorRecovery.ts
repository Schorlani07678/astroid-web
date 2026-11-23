import {
  FREIGHTER_MAX_RETRIES,
  type FreighterErrorCode,
} from '../../stores/freighter-store';

/** Primary action the recovery UI offers for a failed Freighter interaction. */
export type FreighterRecoveryAction = 'install' | 'retry' | 'unlock_and_retry' | 'switch_network' | 'reload';

export interface FreighterRecovery {
  /** Short banner heading. */
  title: string;
  /** One-sentence explanation of what to do next. */
  description: string;
  action: FreighterRecoveryAction;
  /** Label for the primary action button. */
  actionLabel: string;
  /** Visual severity: a rejection is the operator's own choice, not a fault. */
  tone: 'warning' | 'danger';
}

export const FREIGHTER_INSTALL_URL = 'https://www.freighter.app/';

const RECOVERY: Record<FreighterErrorCode, FreighterRecovery> = {
  NOT_INSTALLED: {
    title: 'Freighter extension not found',
    description:
      'Install the Freighter browser extension, then reload this page and connect again.',
    action: 'install',
    actionLabel: 'Install Freighter',
    tone: 'danger',
  },
  USER_DECLINED: {
    title: 'Connection request declined',
    description:
      'Freighter reported that the request was rejected. Try again and approve the prompt in the extension.',
    action: 'retry',
    actionLabel: 'Try again',
    tone: 'warning',
  },
  TIMEOUT: {
    title: 'Freighter did not respond',
    description:
      'The extension took too long to answer. Make sure it is enabled and unlocked, then retry.',
    action: 'retry',
    actionLabel: 'Retry connection',
    tone: 'warning',
  },
  LOCKED: {
    title: 'Freighter is locked',
    description: 'Open the Freighter extension, unlock it with your password, then reconnect.',
    action: 'unlock_and_retry',
    actionLabel: 'I unlocked it — reconnect',
    tone: 'warning',
  },
  NETWORK_MISMATCH: {
    title: 'Wrong Stellar network',
    description:
      'Switch Freighter to the network this workspace targets, then retry the action.',
    action: 'switch_network',
    actionLabel: 'Retry',
    tone: 'warning',
  },
  INVALID_RESPONSE: {
    title: 'Unexpected wallet response',
    description:
      'Freighter answered without a usable account. Select an account in the extension and retry.',
    action: 'retry',
    actionLabel: 'Retry connection',
    tone: 'danger',
  },
  UNKNOWN: {
    title: 'Wallet connection failed',
    description: 'Something went wrong while talking to Freighter. Retry the connection.',
    action: 'retry',
    actionLabel: 'Retry connection',
    tone: 'danger',
  },
};

/**
 * Recovery copy and action for an error code. After repeated failed retries a
 * retryable error escalates to a reload suggestion, since a stale extension
 * bridge is the usual culprit and another click will not help.
 */
export function getFreighterRecovery(
  code: FreighterErrorCode | null | undefined,
  retryCount = 0,
): FreighterRecovery {
  const recovery = RECOVERY[code ?? 'UNKNOWN'] ?? RECOVERY.UNKNOWN;
  const retryable = recovery.action === 'retry' || recovery.action === 'unlock_and_retry';
  if (retryable && retryCount >= FREIGHTER_MAX_RETRIES) {
    return {
      ...recovery,
      description: `${recovery.description} If it keeps failing, reload the page to reset the extension connection.`,
      action: 'reload',
      actionLabel: 'Reload page',
    };
  }
  return recovery;
}
