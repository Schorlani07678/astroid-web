import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareAllocationRows,
  consumptionPercent,
  filterAllocationRows,
  matchesAllocationFilter,
  sortAllocationRows,
  toAllocationRow,
  toAllocationRows,
  type DepartmentAllocationRow,
} from './departmentBudgetTable';
import type { DepartmentBudget } from './types';

function department(
  overrides: Partial<DepartmentBudget> &
    Pick<DepartmentBudget, 'id' | 'departmentName'>,
): DepartmentBudget {
  return {
    departmentCode: 'DEP',
    managerName: 'Manager',
    totalLimit: 100,
    totalSpent: 0,
    totalRemaining: 100,
    asset: 'USDC',
    period: 'monthly',
    updatedAt: '2026-01-01T00:00:00.000Z',
    agents: [],
    ...overrides,
  };
}

const ROWS: DepartmentAllocationRow[] = toAllocationRows([
  department({
    id: 'eng',
    departmentName: 'Engineering',
    totalLimit: 1000,
    totalSpent: 750,
    totalRemaining: 250,
  }),
  department({
    id: 'mkt',
    departmentName: 'Marketing',
    totalLimit: 200,
    totalSpent: 190,
    totalRemaining: 10,
    asset: 'XLM',
  }),
  department({
    id: 'ops',
    departmentName: 'Operations',
    totalLimit: 4000,
    totalSpent: 400,
    totalRemaining: 3600,
    asset: 'EURC',
  }),
]);

const ids = (rows: DepartmentAllocationRow[]) => rows.map((row) => row.id);

test('consumptionPercent is spent over allocated, in percent', () => {
  assert.equal(consumptionPercent(1000, 750), 75);
  assert.equal(consumptionPercent(200, 300), 150);
});

test('consumptionPercent is 0, not Infinity or NaN, when nothing is allocated', () => {
  assert.equal(consumptionPercent(0, 50), 0);
  assert.equal(consumptionPercent(0, 0), 0);
  assert.equal(consumptionPercent(Number.NaN, 10), 0);
});

test('toAllocationRow maps name, asset, amounts and consumption', () => {
  assert.deepEqual(
    toAllocationRow(
      department({
        id: 'eng',
        departmentName: 'Engineering',
        totalLimit: 1000,
        totalSpent: 750,
        totalRemaining: 250,
      }),
    ),
    {
      id: 'eng',
      department: 'Engineering',
      asset: 'USDC',
      allocated: 1000,
      spent: 750,
      remaining: 250,
      consumption: 75,
    },
  );
});

test('sorting by spent amount orders rows numerically in both directions', () => {
  assert.deepEqual(ids(sortAllocationRows(ROWS, 'spent', 'asc')), [
    'mkt',
    'ops',
    'eng',
  ]);
  assert.deepEqual(ids(sortAllocationRows(ROWS, 'spent', 'desc')), [
    'eng',
    'ops',
    'mkt',
  ]);
});

test('sorting by consumption orders by percentage, not by raw amount', () => {
  // Operations spent more than Marketing but consumed far less of its budget.
  assert.deepEqual(ids(sortAllocationRows(ROWS, 'consumption', 'asc')), [
    'ops',
    'eng',
    'mkt',
  ]);
  assert.deepEqual(ids(sortAllocationRows(ROWS, 'consumption', 'desc')), [
    'mkt',
    'eng',
    'ops',
  ]);
});

test('numeric sorting compares values, not their string form', () => {
  const rows = toAllocationRows([
    department({ id: 'nine', departmentName: 'Nine', totalSpent: 9 }),
    department({ id: 'hundred', departmentName: 'Hundred', totalSpent: 100 }),
  ]);
  assert.deepEqual(ids(sortAllocationRows(rows, 'spent', 'asc')), ['nine', 'hundred']);
});

test('compareAllocationRows is negative, zero or positive for less, equal or greater', () => {
  const [eng, mkt] = ROWS as [DepartmentAllocationRow, DepartmentAllocationRow];
  assert.ok(compareAllocationRows(mkt, eng, 'spent') < 0);
  assert.equal(compareAllocationRows(eng, eng, 'spent'), 0);
  assert.ok(compareAllocationRows(eng, mkt, 'spent') > 0);
});

test('sortAllocationRows does not mutate its input', () => {
  const before = ids(ROWS);
  sortAllocationRows(ROWS, 'spent', 'desc');
  assert.deepEqual(ids(ROWS), before);
});

test('filtering matches department names case-insensitively as a substring', () => {
  assert.deepEqual(ids(filterAllocationRows(ROWS, 'eng')), ['eng']);
  assert.deepEqual(ids(filterAllocationRows(ROWS, 'MARK')), ['mkt']);
  assert.deepEqual(ids(filterAllocationRows(ROWS, 'tion')), ['ops']);
});

test('filtering also matches the token asset', () => {
  assert.deepEqual(ids(filterAllocationRows(ROWS, 'xlm')), ['mkt']);
  assert.deepEqual(ids(filterAllocationRows(ROWS, 'EURC')), ['ops']);
});

test('blank or whitespace filter text keeps every row', () => {
  assert.deepEqual(ids(filterAllocationRows(ROWS, '')), ['eng', 'mkt', 'ops']);
  assert.deepEqual(ids(filterAllocationRows(ROWS, '   ')), ['eng', 'mkt', 'ops']);
});

test('filter text that matches nothing leaves no rows', () => {
  assert.equal(filterAllocationRows(ROWS, 'treasury').length, 0);
  assert.equal(matchesAllocationFilter(ROWS[0]!, 'treasury'), false);
});
