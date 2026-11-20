'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/env';
import { queryKeys } from '@/services/query-keys';

/** Realtime connection lifecycle surfaced to the UI. */
export type TelemetryConnectionStatus = 'connected' | 'connecting' | 'offline';

export interface UseAgentTelemetrySubscriptionResult {
  /** Current connection state: live socket, negotiating, or simulated fallback. */
  status: TelemetryConnectionStatus;
  /** True when running against a real Supabase project rather than the mock fallback. */
  isLive: boolean;
}

/** How often the mock fallback re-triggers refetches when Supabase isn't configured. */
const MOCK_POLL_INTERVAL_MS = 15_000;

/**
 * Subscribes to Postgres changes on the tables that back agent telemetry,
 * wallet balances, and approval proposals, invalidating the matching
 * TanStack Query caches so the dashboard updates without a manual refresh.
 *
 * Falls back to a simulated polling mode — status `offline` — when Supabase
 * environment variables are omitted, so the dashboard keeps behaving
 * predictably in mock mode. Channels are always cleaned up on unmount.
 */
export function useAgentTelemetrySubscription(): UseAgentTelemetrySubscriptionResult {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TelemetryConnectionStatus>(
    isSupabaseConfigured ? 'connecting' : 'offline',
  );
  const channelsRef = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    const client = getSupabaseClient();

    // No Supabase project configured — simulate a live stream by polling the
    // existing mock/API resources at a relaxed interval instead of opening a
    // socket. This keeps the dashboard responsive without unhandled errors.
    if (!client) {
      setStatus('offline');
      const interval = setInterval(() => {
        // Hidden tabs skip the tick; focus/mount refetch handles catch-up.
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        queryClient.invalidateQueries({ queryKey: queryKeys.agents });
        queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
        queryClient.invalidateQueries({ queryKey: queryKeys.proposals });
      }, MOCK_POLL_INTERVAL_MS);

      return () => clearInterval(interval);
    }

    setStatus('connecting');

    const telemetryChannel = client
      .channel('agent-telemetry')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.agents });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallets' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proposals' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.proposals });
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        },
      )
      .subscribe((subscriptionStatus: `${REALTIME_SUBSCRIBE_STATES}`) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('connected');
        } else if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT' || subscriptionStatus === 'CLOSED') {
          setStatus('offline');
        } else {
          setStatus('connecting');
        }
      });

    channelsRef.current = [telemetryChannel];

    return () => {
      channelsRef.current.forEach((channel) => {
        client.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [queryClient]);

  return { status, isLive: isSupabaseConfigured };
}
