'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import type { Agent } from '@/types/domain';
import {
  type AdvancedAgentFilterCriteria,
  AGENT_STATUS_FILTER_OPTIONS,
  INITIAL_ADVANCED_AGENT_FILTERS,
  extractAvailableProviders,
  filterAgentsByCriteria,
} from '../utils/advancedAgentFilter';

export interface AdvancedAgentSearchBarProps {
  agents: readonly Agent[];
  criteria: AdvancedAgentFilterCriteria;
  onCriteriaChange: (next: AdvancedAgentFilterCriteria) => void;
  showEmptyState?: boolean;
}

function formatStatusLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

/**
 * Advanced AI agent search and multi-criteria filter bar with keyboard shortcut
 * focus (`/` or `Ctrl+K` / `Cmd+K`) and built-in empty state display.
 */
export function AdvancedAgentSearchBar({
  agents,
  criteria,
  onCriteriaChange,
  showEmptyState = true,
}: AdvancedAgentSearchBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const providers = useMemo(() => extractAvailableProviders(agents), [agents]);
  const filteredAgents = useMemo(
    () => filterAgentsByCriteria(agents, criteria),
    [agents, criteria],
  );

  const hasActiveFilters =
    criteria.query.trim() !== '' ||
    criteria.provider !== 'all' ||
    criteria.status !== 'all';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (event.key === '/' && !isEditable) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-[2] flex-col gap-1.5 text-xs font-medium text-foreground">
          <span>Search agents (press / to focus)</span>
          <Input
            ref={searchInputRef}
            type="search"
            placeholder="Filter by agent name, description, or ID..."
            aria-label="Search agents by name, description, or ID"
            leftIcon={<Search className="h-3.5 w-3.5" aria-hidden />}
            value={criteria.query}
            onChange={(event) =>
              onCriteriaChange({ ...criteria, query: event.target.value })
            }
          />
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-foreground">
          <span>LLM Provider</span>
          <Select
            aria-label="Filter agents by LLM provider"
            value={criteria.provider}
            onChange={(event) =>
              onCriteriaChange({ ...criteria, provider: event.target.value })
            }
          >
            <option value="all">All providers</option>
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-foreground">
          <span>Operational Status</span>
          <Select
            aria-label="Filter agents by operational status"
            value={criteria.status}
            onChange={(event) =>
              onCriteriaChange({ ...criteria, status: event.target.value })
            }
          >
            <option value="all">All statuses</option>
            {AGENT_STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatStatusLabel(status)}
              </option>
            ))}
          </Select>
        </label>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start sm:mb-0.5 sm:self-auto"
            leftIcon={<X className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => onCriteriaChange(INITIAL_ADVANCED_AGENT_FILTERS)}
          >
            Reset
          </Button>
        )}

        <p
          role="status"
          aria-live="polite"
          className="self-start text-2xs tabular text-foreground-secondary sm:mb-1 sm:ml-auto sm:self-auto"
        >
          {filteredAgents.length} of {agents.length} agents
        </p>
      </div>

      {showEmptyState && filteredAgents.length === 0 && (
        <div
          role="region"
          aria-label="No matching agents"
          className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface/50 p-8 text-center"
        >
          <p className="text-sm font-medium text-foreground">
            No AI agents match your current filter criteria
          </p>
          <p className="text-xs text-foreground-secondary">
            Try clearing the search query or selecting a different provider or status.
          </p>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onCriteriaChange(INITIAL_ADVANCED_AGENT_FILTERS)}
            >
              Clear all filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
