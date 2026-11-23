/**
 * CSV export for the department budget matrix (#175).
 *
 * Runs entirely on the client via the shared `@/lib/csv` helpers — no backend
 * dependency. Monetary amounts are written as raw numbers and Stellar asset
 * identifiers (XLM, USDC, EURC, ASTRO) as plain codes so external auditing
 * tools parse them correctly.
 */

import { downloadCsv, type CsvValue, type CsvColumn } from '@/lib/csv';
import {
  BUDGET_LEDGER_STATUS_LABELS,
  agentBudgetStatus,
  agentUtilizationPercent,
} from './budgetLedgerFiltering';
import type { DepartmentBudget } from './types';

const HEADERS = [
  'Department',
  'Department Code',
  'Agent ID',
  'Agent Name',
  'Role',
  'Asset',
  'Allocated Amount',
  'Spent Amount',
  'Remaining Amount',
  'Utilization Percent',
  'Budget Status',
  'Ledger Entry ID',
  'Ledger Date',
  'Description',
  'Counterparty',
  'Entry Amount',
] as const;

/** Flatten filtered departments into ledger-granularity CSV rows. */
export function buildBudgetLedgerRows(departments: DepartmentBudget[]): CsvValue[][] {
  const rows: CsvValue[][] = [];

  for (const dept of departments) {
    for (const agent of dept.agents) {
      const attribution: CsvValue[] = [
        dept.departmentName,
        dept.departmentCode,
        agent.agentId,
        agent.agentName,
        agent.role,
        agent.asset,
        agent.allocatedAmount,
        agent.spentAmount,
        agent.remainingAmount,
        Math.round(agentUtilizationPercent(agent) * 10) / 10,
        BUDGET_LEDGER_STATUS_LABELS[agentBudgetStatus(agent)],
      ];

      if (agent.ledger && agent.ledger.length > 0) {
        for (const entry of agent.ledger) {
          rows.push([...attribution, entry.id, entry.date, entry.description, entry.counterparty, entry.amount]);
        }
      } else {
        // No ledger history: one summary row dated by the last transaction.
        rows.push([...attribution, '', agent.lastTransactionAt, 'No ledger entries recorded', '', '', ]);
      }
    }
  }

  return rows;
}

/** Serialize + download the currently visible (filtered) budget data as CSV. */
export function exportBudgetLedgerCsv(departments: DepartmentBudget[]): void {
  const columns: CsvColumn<CsvValue[]>[] = HEADERS.map((header, index) => ({
    header,
    value: (row) => row[index],
  }));
  downloadCsv(
    buildBudgetLedgerRows(departments),
    columns,
    `astroid-department-budget-${new Date().toISOString().slice(0, 10)}`,
  );
}
