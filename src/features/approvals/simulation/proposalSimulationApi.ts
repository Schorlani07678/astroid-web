import { isMockMode } from '@/lib/env';
import { apiClient } from '@/services/client';
import type { Proposal } from '@/types/domain';
import { buildMockProposalSimulation, type ProposalSimulation } from './proposalSimulation';

export const simulationQueryKeys = {
  all: ['proposal-simulation'] as const,
  proposal: (proposalId: string) => ['proposal-simulation', proposalId] as const,
};

const MOCK_LATENCY_MS = 450;

/**
 * Runs (or, in mock mode, fabricates) a dry-run simulation of the proposal's
 * transaction. Live mode posts to the policy engine's simulate endpoint.
 */
export async function fetchProposalSimulation(proposal: Proposal): Promise<ProposalSimulation> {
  if (isMockMode) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
    return buildMockProposalSimulation(proposal);
  }

  const response = await apiClient.request<ProposalSimulation>(
    `/proposals/${encodeURIComponent(proposal.id)}/simulate`,
    { method: 'POST', body: JSON.stringify({ xdr: proposal.xdr }) },
  );
  return response.data;
}
