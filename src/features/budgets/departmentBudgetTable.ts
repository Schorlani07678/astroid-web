import type { AssetCode, DepartmentBudget } from './types';

/** One row of the department budget allocation table. */
export interface DepartmentAllocationRow {
  id: string;
  department: string;
  asset: AssetCode;
  allocated: number;
  spent: number;
  remaining: number;
  /** Share of the allocation already spent, in percent. 0 when nothing is allocated. */
  consumption: number;
}

/** Columns of the allocation table that hold numbers and sort numerically. */
export type NumericAllocationColumn = 'allocated' | 'spent' | 'consumption';

/**
 * Spent as a percentage of allocated. A department with no allocation has
 * consumed nothing of it, so this returns 0 instead of `Infinity` or `NaN`.
 * Values above 100 are kept so overspending sorts above a full budget.
 */
export function consumptionPercent(allocated: number, spent: number): number {
  if (!Number.isFinite(allocated) || !Number.isFinite(spent) || allocated <= 0)
    return 0;
  return (spent / allocated) * 100;
}

/** Maps a department budget onto the row the allocation table renders. */
export function toAllocationRow(budget: DepartmentBudget): DepartmentAllocationRow {
  return {
    id: budget.id,
    department: budget.departmentName,
    asset: budget.asset,
    allocated: budget.totalLimit,
    spent: budget.totalSpent,
    remaining: budget.totalRemaining,
    consumption: consumptionPercent(budget.totalLimit, budget.totalSpent),
  };
}

export function toAllocationRows(
  budgets: readonly DepartmentBudget[],
): DepartmentAllocationRow[] {
  return budgets.map(toAllocationRow);
}

/**
 * Whether a row matches the filter text: a case-insensitive substring match on
 * the department name or the token asset. Blank text matches every row.
 */
export function matchesAllocationFilter(
  row: DepartmentAllocationRow,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    row.department.toLowerCase().includes(needle) ||
    row.asset.toLowerCase().includes(needle)
  );
}

export function filterAllocationRows(
  rows: readonly DepartmentAllocationRow[],
  query: string,
): DepartmentAllocationRow[] {
  return rows.filter((row) => matchesAllocationFilter(row, query));
}

/**
 * Ascending numeric comparison of one column. TanStack Table reverses it for
 * descending order, so this only defines the ascending direction.
 */
export function compareAllocationRows(
  a: DepartmentAllocationRow,
  b: DepartmentAllocationRow,
  column: NumericAllocationColumn,
): number {
  return a[column] - b[column];
}

/** Sorts a copy of `rows` by one numeric column, leaving `rows` untouched. */
export function sortAllocationRows(
  rows: readonly DepartmentAllocationRow[],
  column: NumericAllocationColumn,
  direction: 'asc' | 'desc' = 'asc',
): DepartmentAllocationRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * compareAllocationRows(a, b, column));
}
