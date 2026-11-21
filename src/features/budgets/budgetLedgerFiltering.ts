/**
 * Filter + derived-status logic for the department budget matrix (#175).
 *
 * The budget table itself owns department-level filtering; these helpers add
 * the advanced agent-level controls (date range, agent attribution, budget
 * status) on top of the same filtered dataset so sorting keeps working while
 * filters are active.
 */

import type { AgentAllocation, DepartmentBudget } from './types';

/** Derived budget health for an agent allocation. */
export type BudgetLedgerStatus = 'on_track' | 'near_limit' | 'over_limit';

export const BUDGET_LEDGER_STATUS_LABELS: Record<BudgetLedgerStatus, string> = {
  on_track: 'On track',
  near_limit: 'Near limit',
  over_limit: 'Over limit',
};

export type BudgetLedgerStatusFilter = BudgetLedgerStatus | 'all';

export interface BudgetLedgerFilterState {
  /** ISO date (`yyyy-mm-dd`) or empty string for "any". */
  dateFrom: string;
  /** ISO date (`yyyy-mm-dd`) or empty string for "any". */
  dateTo: string;
  /** Agent id (`agt-…`) or `'all'`. */
  agentId: string;
  status: BudgetLedgerStatusFilter;
}

export const EMPTY_BUDGET_LEDGER_FILTERS: BudgetLedgerFilterState = {
  dateFrom: '',
  dateTo: '',
  agentId: 'all',
  status: 'all',
};

export function isBudgetLedgerFilterActive(filters: BudgetLedgerFilterState): boolean {
  return (
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.agentId !== 'all' ||
    filters.status !== 'all'
  );
}

/** Utilization tier: >100% spent is over limit, >=85% is approaching the cap. */
export function agentBudgetStatus(agent: AgentAllocation): BudgetLedgerStatus {
  const utilization =
    agent.allocatedAmount > 0 ? (agent.spentAmount / agent.allocatedAmount) * 100 : 0;
  if (utilization > 100) return 'over_limit';
  if (utilization >= 85) return 'near_limit';
  return 'on_track';
}

export function agentUtilizationPercent(agent: AgentAllocation): number {
  return agent.allocatedAmount > 0 ? (agent.spentAmount / agent.allocatedAmount) * 100 : 0;
}

function isWithinDateRange(iso: string, from: string, to: string): boolean {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

/** True when an allocation matches the active agent/date/status constraints. */
export function matchesBudgetLedgerFilters(
  agent: AgentAllocation,
  filters: BudgetLedgerFilterState,
): boolean {
  if (filters.agentId !== 'all' && agent.agentId !== filters.agentId) return false;
  if (filters.status !== 'all' && agentBudgetStatus(agent) !== filters.status) return false;

  const hasDateBounds = filters.dateFrom !== '' || filters.dateTo !== '';
  if (!hasDateBounds) return true;

  const ledgerInRange = (agent.ledger ?? []).some((entry) =>
    isWithinDateRange(entry.date, filters.dateFrom, filters.dateTo),
  );
  return ledgerInRange || isWithinDateRange(agent.lastTransactionAt, filters.dateFrom, filters.dateTo);
}

/**
 * Apply the advanced filters to already department-filtered rows. Departments
 * keep their full agent list while no advanced filter is active; once one is,
 * only matching agents remain and departments without any are dropped.
 */
export function applyBudgetLedgerFilters(
  departments: DepartmentBudget[],
  filters: BudgetLedgerFilterState,
): DepartmentBudget[] {
  if (!isBudgetLedgerFilterActive(filters)) return departments;

  return departments
    .map((dept) => ({
      ...dept,
      agents: dept.agents.filter((agent) => matchesBudgetLedgerFilters(agent, filters)),
    }))
    .filter((dept) => dept.agents.length > 0);
}
