import type { Budget } from '@/types/domain';

export interface DepartmentBudgetBreakdownItem {
  id: string;
  department: string;
  allocated: number;
  spent: number;
  remaining: number;
  utilizationPercent: number;
  currency: string;
}

/**
 * Transforms department budgets into chart-ready breakdown series with utilization metrics.
 */
export function buildDepartmentBudgetBreakdown(
  budgets: readonly Budget[],
): DepartmentBudgetBreakdownItem[] {
  return budgets
    .filter((budget) => budget.scope === 'department')
    .map((budget) => {
      const allocated = Math.max(0, budget.limit);
      const spent = Math.max(0, budget.spent);
      const remaining = Math.max(0, allocated - spent);
      const utilizationPercent =
        allocated > 0 ? Number(((spent / allocated) * 100).toFixed(1)) : 0;

      return {
        id: budget.id,
        department: budget.name,
        allocated,
        spent,
        remaining,
        utilizationPercent,
        currency: budget.currency,
      };
    });
}
