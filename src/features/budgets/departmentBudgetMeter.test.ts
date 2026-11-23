import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateDepartmentBudgets,
  getBudgetThresholdStatus,
} from './departmentBudgetMeter';
import type { DepartmentBudget } from './types';

const TEST_DEPARTMENTS: DepartmentBudget[] = [
  {
    id: 'dept-1',
    departmentName: 'Engineering',
    departmentCode: 'ENG',
    managerName: 'Alice',
    totalLimit: 100_000,
    totalSpent: 50_000,
    totalRemaining: 50_000,
    asset: 'USDC',
    period: 'monthly',
    updatedAt: new Date().toISOString(),
    agents: [],
  },
  {
    id: 'dept-2',
    departmentName: 'Marketing',
    departmentCode: 'MKT',
    managerName: 'Bob',
    totalLimit: 100_000,
    totalSpent: 75_000,
    totalRemaining: 25_000,
    asset: 'USDC',
    period: 'monthly',
    updatedAt: new Date().toISOString(),
    agents: [],
  },
  {
    id: 'dept-3',
    departmentName: 'Operations',
    departmentCode: 'OPS',
    managerName: 'Charlie',
    totalLimit: 100_000,
    totalSpent: 95_000,
    totalRemaining: 5_000,
    asset: 'USDC',
    period: 'monthly',
    updatedAt: new Date().toISOString(),
    agents: [],
  },
];

test('getBudgetThresholdStatus assigns status based on utilization thresholds', () => {
  assert.equal(getBudgetThresholdStatus(0), 'normal');
  assert.equal(getBudgetThresholdStatus(69.9), 'normal');
  assert.equal(getBudgetThresholdStatus(70), 'warning');
  assert.equal(getBudgetThresholdStatus(89.9), 'warning');
  assert.equal(getBudgetThresholdStatus(90), 'critical');
  assert.equal(getBudgetThresholdStatus(105), 'critical');
});

test('aggregateDepartmentBudgets computes correct sums and percentages', () => {
  const result = aggregateDepartmentBudgets(TEST_DEPARTMENTS);

  assert.equal(result.totalAllocated, 300_000);
  assert.equal(result.totalSpent, 220_000);
  assert.equal(result.totalRemaining, 80_000);
  assert.equal(Math.round(result.orgUtilization), 73);
  assert.equal(result.status, 'warning');

  assert.equal(result.counts.total, 3);
  assert.equal(result.counts.normal, 1);
  assert.equal(result.counts.warning, 1);
  assert.equal(result.counts.critical, 1);

  assert.equal(result.departments[0]?.status, 'normal');
  assert.equal(result.departments[1]?.status, 'warning');
  assert.equal(result.departments[2]?.status, 'critical');
});

test('aggregateDepartmentBudgets handles zero allocation safely', () => {
  const zeroDept: DepartmentBudget[] = [
    {
      id: 'dept-zero',
      departmentName: 'Zero Dept',
      departmentCode: 'ZERO',
      managerName: 'Dan',
      totalLimit: 0,
      totalSpent: 0,
      totalRemaining: 0,
      asset: 'USDC',
      period: 'monthly',
      updatedAt: new Date().toISOString(),
      agents: [],
    },
  ];

  const result = aggregateDepartmentBudgets(zeroDept);
  assert.equal(result.totalAllocated, 0);
  assert.equal(result.orgUtilization, 0);
  assert.equal(result.departments[0]?.utilization, 0);
  assert.equal(result.departments[0]?.status, 'normal');
});
