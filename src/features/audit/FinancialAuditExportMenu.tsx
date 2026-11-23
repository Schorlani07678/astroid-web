'use client';

import type { MemoryRecord } from '@/types/domain';
import { LogExportMenu } from './LogExportMenu';
import { planFinancialAuditExport } from './financial-export';

export interface FinancialAuditExportMenuProps {
  /** The governed decisions currently shown in the audit table. */
  records: readonly MemoryRecord[];
  className?: string;
  label?: string;
}

/**
 * Export dropdown for the financial audit log (governed decisions).
 *
 * Sits in the audit page header so compliance officers can download the
 * decision trail as CSV (flattened columns) or JSON (full records with the
 * decision-step chain intact), stamped with a timestamped filename.
 */
export function FinancialAuditExportMenu({
  records,
  className,
  label = 'Export financial audit log',
}: FinancialAuditExportMenuProps) {
  return (
    <LogExportMenu
      count={records.length}
      noun="record"
      aria-label={label}
      className={className}
      createPlan={(format) => planFinancialAuditExport(records, format)}
    />
  );
}

export default FinancialAuditExportMenu;
