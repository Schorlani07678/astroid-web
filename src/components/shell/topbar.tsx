'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Search, Sparkles, ChevronsUpDown, Check, Menu, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dropdown, type DropdownItem } from '@/components/ui/dropdown';
import { Avatar } from '@/components/ui/avatar';
import { NotificationCenter } from '@/components/NotificationCenter';
import { useOrganizations, useCurrentUser } from '@/hooks/use-queries';
import { useAgentTelemetrySubscription } from '@/hooks/useAgentTelemetrySubscription';
import { usePreferencesStore } from '@/stores/preferences-store';
import { useCommandStore, useAssistantStore } from '@/stores/ui-store';
import { NetworkHealthWidget } from '@/features/network/NetworkHealthWidget';
import { WalletNetworkSwitcher } from '@/features/network/WalletNetworkSwitcher';
import { CircuitBreakerControl } from '@/features/security';
import { TelemetryStatusIndicator } from '@/components/shell/telemetry-status-indicator';
import { FREIGHTER_ERROR_TITLES, useFreighterStore } from '@/stores/freighter-store';
import { cn } from '@/lib/cn';

/** Shared, brand-tinted focus ring for every top-bar control (WCAG AA). */
const TOPBAR_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

interface TopbarProps {
  /** Whether the mobile navigation drawer is currently open. */
  navOpen: boolean;
  /** Opens the mobile navigation drawer. */
  onOpenNav: () => void;
}

/**
 * The workspace utility bar: brand, org switcher, global command trigger, AI
 * assistant, notifications, and the account menu. Primary navigation lives in
 * the floating {@link CommandDock} (desktop) and the {@link MobileNav} drawer.
 */
export function Topbar({ navOpen, onOpenNav }: TopbarProps) {
  const orgsQuery = useOrganizations();
  const userQuery = useCurrentUser();
  const telemetry = useAgentTelemetrySubscription();

  const activeOrgId = usePreferencesStore((s) => s.activeOrgId);
  const setActiveOrg = usePreferencesStore((s) => s.setActiveOrg);
  const commandOpen = useCommandStore((s) => s.open);
  const openCommand = useCommandStore((s) => s.setOpen);
  const openAssistant = useAssistantStore((s) => s.setOpen);
  const walletStatus = useFreighterStore((state) => state.status);
  const walletAddress = useFreighterStore((state) => state.publicKey);
  const walletNetwork = useFreighterStore((state) => state.network);
  const reconnectWallet = useFreighterStore((state) => state.connect);

  useEffect(() => {
    const walletStore = useFreighterStore;
    const refreshWallet = () => void walletStore.getState().hydrate();
    refreshWallet();

    const interval = window.setInterval(refreshWallet, 5000);
    window.addEventListener('focus', refreshWallet);
    const unsubscribe = walletStore.subscribe((state, previousState) => {
      if (previousState.status === 'connected' && state.status === 'locked') {
        toast.warning('Freighter wallet locked', {
          description: 'Unlock Freighter and reconnect to continue using Stellar features.',
        });
      } else if (previousState.status === 'connected' && state.status === 'disconnected') {
        toast.warning('Freighter disconnected', {
          description: 'Reconnect your wallet to continue using Stellar features.',
        });
      }

      if (state.error && state.error !== previousState.error && state.status !== 'locked') {
        const code = state.errorCode ?? 'UNKNOWN';
        const title = FREIGHTER_ERROR_TITLES[code];
        // A dismissed prompt is a user choice, not a failure: warn instead of
        // raising an error toast. Everything else stays an error.
        if (code === 'USER_DECLINED') {
          toast.warning(title, { id: 'freighter-error', description: state.error });
        } else {
          toast.error(title, { id: 'freighter-error', description: state.error });
        }
      }

      if (
        previousState.status === 'connected' &&
        state.status === 'connected' &&
        previousState.network &&
        state.network &&
        previousState.network !== state.network
      ) {
        toast.info('Stellar network changed', {
          description: `Freighter is now connected to ${state.network}.`,
        });
      }
    });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWallet);
      unsubscribe();
    };
  }, []);

  const orgs = orgsQuery.data ?? [];
  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];
  const user = userQuery.data;

  const orgItems: DropdownItem[] = orgs.map((org) => ({
    label: org.name,
    icon:
      org.id === (activeOrg?.id ?? '') ? (
        <Check className="h-3.5 w-3.5 text-gold" />
      ) : undefined,
    onSelect: () => setActiveOrg(org.id),
  }));

  const accountItems: (DropdownItem | 'separator')[] = [
    { label: 'Settings', href: '/settings' },
    { label: 'Developers', href: '/developers' },
    'separator',
    { label: 'Sign out', href: '/', destructive: true },
  ];

  return (
    <header className="sticky top-0 z-30 flex flex-col border-b border-border bg-background-primary/95 backdrop-blur-xl">
      {/* Top Tier: Brand & Global Actions */}
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <Link
          href="/overview"
          className={cn(
            'gap-2.5 mr-2 flex items-center rounded-button',
            TOPBAR_FOCUS,
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-button bg-accent-gradient text-accent-foreground shadow-gold">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <span className="sr-only">Astroid home</span>
          <span className="hidden font-display text-lg font-semibold tracking-tight sm:inline-block">
            Astroid
          </span>
        </Link>

        {/* Mobile nav trigger */}
        <button
          type="button"
          onClick={onOpenNav}
          className={cn(
            'grid h-9 w-9 place-items-center rounded-button text-foreground-secondary transition-colors duration-fast hover:bg-surface-secondary hover:text-foreground lg:hidden',
            TOPBAR_FOCUS,
          )}
          aria-label="Open navigation menu"
          aria-expanded={navOpen}
          aria-controls="mobile-nav-drawer"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        {/* Org switcher */}
        <Dropdown
          align="start"
          triggerClassName={TOPBAR_FOCUS}
          aria-label="Switch organization"
          trigger={
            <span className="px-2.5 py-1.5 flex items-center gap-2 rounded-button text-sm font-medium transition-colors duration-fast hover:bg-surface-secondary">
              <span className="grid h-6 w-6 place-items-center rounded-xs bg-accent-gradient text-2xs font-bold text-accent-foreground">
                {(activeOrg?.name ?? 'A').charAt(0)}
              </span>
              <span className="hidden max-w-[140px] truncate sm:inline-block">
                {activeOrg?.name ?? 'Astroid'}
              </span>
              <ChevronsUpDown
                className="h-3.5 w-3.5 text-foreground-muted"
                aria-hidden
              />
            </span>
          }
          items={orgItems}
        />

        <div className="flex-1" />

        {/* Command palette trigger */}
        <button
          type="button"
          onClick={() => openCommand(true)}
          className={cn(
            'py-1.5 hidden items-center gap-2 rounded-button border border-border bg-surface px-3 text-xs text-foreground-muted transition-colors duration-fast hover:border-border-strong hover:text-foreground-secondary md:flex',
            TOPBAR_FOCUS,
          )}
          aria-label="Open command palette"
          aria-haspopup="dialog"
          aria-expanded={commandOpen}
          aria-controls="command-palette"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <span>Search command…</span>
          <kbd className="px-1.5 py-0.5 rounded-xs border border-border bg-surface-secondary font-mono text-2xs">
            ⌘K
          </kbd>
        </button>

        {/* Live agent telemetry connection status */}
        <TelemetryStatusIndicator status={telemetry.status} />

        {/* Freighter wallet status + Stellar network switcher */}
        <WalletNetworkSwitcher />

        {/* Freighter wallet connection and active Stellar network */}
        <div
          className="flex items-center gap-1.5 rounded-button border border-border bg-surface px-2 py-1.5 text-2xs sm:gap-2 sm:px-2.5"
          aria-live="polite"
          aria-label="Stellar wallet status"
        >
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              walletStatus === 'connected'
                ? 'bg-success'
                : walletStatus === 'connecting'
                  ? 'bg-warning'
                  : 'bg-danger',
            )}
            aria-hidden
          />
          <span className="max-w-24 truncate font-medium text-foreground">
            {walletStatus === 'connected' && walletAddress
              ? `${walletAddress.slice(0, 5)}…${walletAddress.slice(-4)}`
              : walletStatus === 'locked'
                ? 'Wallet locked'
                : walletStatus === 'connecting'
                  ? 'Connecting'
                  : 'Disconnected'}
          </span>
          <span className="max-w-16 truncate border-l border-border pl-2 text-foreground-muted sm:max-w-20">
            {walletNetwork ?? 'No network'}
          </span>
          {walletStatus !== 'connected' && (
            <button
              type="button"
              onClick={() => void reconnectWallet()}
              disabled={walletStatus === 'connecting'}
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-button text-foreground-secondary transition-colors duration-fast hover:bg-surface-secondary hover:text-foreground disabled:cursor-wait disabled:opacity-50',
                TOPBAR_FOCUS,
              )}
              aria-label="Reconnect Stellar wallet"
              title="Reconnect Stellar wallet"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>

        {/* Stellar Network Health & RPC Latency Widget */}
        <NetworkHealthWidget />

        {/* Emergency Circuit Breaker */}
        <CircuitBreakerControl currentUser={user?.name ?? 'operator'} />

        {/* Assistant */}
        <button
          type="button"
          onClick={() => openAssistant(true)}
          className={cn(
            'grid h-9 w-9 place-items-center rounded-button text-gold transition-colors duration-fast hover:bg-gold-soft',
            TOPBAR_FOCUS,
          )}
          aria-label="Open AI assistant"
          aria-haspopup="dialog"
        >
          <Sparkles className="h-[18px] w-[18px]" aria-hidden />
        </button>

        {/* Notifications */}
        <NotificationCenter />

        {/* Account */}
        <Dropdown
          triggerClassName={TOPBAR_FOCUS}
          aria-label="Account menu"
          trigger={
            <span className="ml-1 flex items-center gap-2 rounded-md transition-opacity duration-fast hover:opacity-80">
              <Avatar name={user?.name ?? 'User'} src={user?.avatar} size="sm" />
            </span>
          }
          items={accountItems}
        />
        <div className="flex items-center gap-3 sm:hidden">
          <button
            type="button"
            onClick={() => openAssistant(true)}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-button text-gold transition-colors duration-fast hover:bg-gold-soft',
              TOPBAR_FOCUS,
            )}
            aria-label="Open AI assistant"
            aria-haspopup="dialog"
          >
            <Sparkles className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => openCommand(true)}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-button text-foreground-secondary transition-colors duration-fast hover:bg-surface-secondary hover:text-foreground',
              TOPBAR_FOCUS,
            )}
            aria-label="Open command palette"
            aria-haspopup="dialog"
            aria-expanded={commandOpen}
            aria-controls="command-palette"
          >
            <Search className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
