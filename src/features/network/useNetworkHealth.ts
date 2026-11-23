import { useQuery } from '@tanstack/react-query';
import { QUERY_CACHE, createBackoffRefetchInterval } from '@/lib/query-config';
import type { NetworkHealthData, NetworkHealthStatus } from './types';

// Mock generator for RPC latency & ledger sequence polling
export function fetchNetworkHealth(): Promise<NetworkHealthData> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate real-time RPC ping variation around ~42ms - ~110ms
      const randomLatency = Math.floor(35 + Math.random() * 80);
      const baseLedger = 14820500;
      const currentLedger = baseLedger + Math.floor(Date.now() / 5000) % 10000;

      let status: NetworkHealthStatus = 'healthy';
      if (randomLatency > 300) status = 'degraded';
      if (randomLatency > 600) status = 'outage';

      resolve({
        status,
        ledgerSequence: currentLedger,
        rpcLatencyMs: randomLatency,
        sorobanStatus: 'operational',
        horizonStatus: 'operational',
        networkName: 'Stellar Testnet',
        lastCheckedAt: new Date().toISOString(),
      });
    }, 150);
  });
}

export function useNetworkHealth(pollingIntervalMs: number = 5000) {
  return useQuery({
    queryKey: ['stellar-network-health'],
    queryFn: fetchNetworkHealth,
    refetchInterval: createBackoffRefetchInterval({ baseMs: pollingIntervalMs }),
    refetchIntervalInBackground: false,
    staleTime: pollingIntervalMs,
    gcTime: QUERY_CACHE.live.gcTime,
  });
}
