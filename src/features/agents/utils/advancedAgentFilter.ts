import type { Agent, AgentStatus } from '@/types/domain';

export interface AdvancedAgentFilterCriteria {
  query: string;
  provider: string;
  status: string;
}

export const INITIAL_ADVANCED_AGENT_FILTERS: AdvancedAgentFilterCriteria = {
  query: '',
  provider: 'all',
  status: 'all',
};

export const AGENT_STATUS_FILTER_OPTIONS: readonly AgentStatus[] = [
  'active',
  'paused',
  'suspended',
  'archived',
];

/**
 * Filters a fleet of AI agents by name, description, ID, LLM provider, and operational status.
 */
export function filterAgentsByCriteria(
  agents: readonly Agent[],
  criteria: AdvancedAgentFilterCriteria,
): Agent[] {
  const normalizedQuery = criteria.query.trim().toLowerCase();

  return agents.filter((agent) => {
    if (criteria.provider !== 'all' && agent.provider !== criteria.provider) {
      return false;
    }

    if (criteria.status !== 'all' && agent.status !== criteria.status) {
      return false;
    }

    if (normalizedQuery !== '') {
      const matchesName = agent.name.toLowerCase().includes(normalizedQuery);
      const matchesDescription = agent.description.toLowerCase().includes(normalizedQuery);
      const matchesId = agent.id.toLowerCase().includes(normalizedQuery);
      if (!matchesName && !matchesDescription && !matchesId) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Extracts a sorted list of unique LLM providers from an agent fleet.
 */
export function extractAvailableProviders(agents: readonly Agent[]): string[] {
  return Array.from(new Set(agents.map((agent) => agent.provider))).sort();
}
