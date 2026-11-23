'use client';

import { FileJson, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Transaction } from '@/types/domain';

interface TransactionExportActionsProps {
  /** Rows that will be written to the file (already filtered by the caller). */
  rows: readonly Transaction[];
  onExportCSV?: (transactions: Transaction[]) => void;
  onExportJSON?: (transactions: Transaction[]) => void;
}

/**
 * CSV/JSON triggers for the transaction header bar. Button variants resolve to
 * `src/styles/tokens.css` through Tailwind (`bg-gold`, `bg-surface`,
 * `border-border`, `shadow-soft-1`), so both themes and high-contrast mode are
 * respected. Empty results disable both triggers rather than downloading a
 * header-only file.
 */
export function TransactionExportActions({
  rows,
  onExportCSV,
  onExportJSON,
}: TransactionExportActionsProps) {
  if (!onExportCSV && !onExportJSON) return null;

  return (
    <div className="flex items-center gap-2">
      {onExportJSON && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="border-border bg-surface text-foreground shadow-soft-1 hover:bg-surface-secondary"
          disabled={rows.length === 0}
          aria-label="Export filtered transactions as JSON"
          title={
            rows.length === 0 ? 'No transactions match the active filters' : undefined
          }
          onClick={() => onExportJSON([...rows])}
        >
          <FileJson className="mr-1.5 h-4 w-4" aria-hidden />
          Export JSON
        </Button>
      )}
      {onExportCSV && (
        <Button
          type="button"
          variant="gold"
          size="sm"
          className="bg-gold text-accent-foreground shadow-soft-1 hover:bg-gold-strong"
          disabled={rows.length === 0}
          aria-label="Export filtered transactions as CSV"
          title={
            rows.length === 0 ? 'No transactions match the active filters' : undefined
          }
          onClick={() => onExportCSV([...rows])}
        >
          <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden />
          Export CSV
        </Button>
      )}
    </div>
  );
}
