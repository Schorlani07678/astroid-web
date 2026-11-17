import assert from 'node:assert/strict';
import test from 'node:test';
import type { Budget } from '@/types/domain';
import { buildDepartmentBudgetBreakdown } from './departmentBudgetUtils';

test('buildDepartmentBudgetBreakdown filters department scope and computes utilization', () => {
  const budgets: Budget[] = [
    {
      id: 'b-1',
      organizationId: 'org-1',
      name: 'AI Research Lab',
      scope: 'department',
      limit: 10000,
      currency: 'USDC',
      spent: 4500,
      remaining: 5500,
      period: 'monthly',
      resetsAt: '2026-12-01T00:00:00Z',
      createdAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'b-2',
      organizationId: 'org-1',
      name: 'Agent Runtime',
      scope: 'agent',
      limit: 1000,
      currency: 'USDC',
      spent: 250,
      remaining: 750,
      period: 'monthly',
      resetsAt: '2026-12-01T00:00:00Z',
      createdAt: '2026-10-01T00:00:00Z',
    },
  ];

  const breakdown = buildDepartmentBudgetBreakdown(budgets);
  assert.equal(breakdown.length, 1);
  assert.equal(breakdown[0]?.department, 'AI Research Lab');
  assert.equal(breakdown[0]?.allocated, 10000);
  assert.equal(breakdown[0]?.spent, 4500);
  assert.equal(breakdown[0]?.remaining, 5500);
  assert.equal(breakdown[0]?.utilizationPercent, 45);
});
