'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Dropdown, type DropdownItem } from '@/components/ui/dropdown';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  downloadLogExportAsync,
  type ExportFormat,
  type LogExportPlan,
} from '@/lib/exportSerialization';

export interface LogExportMenuProps {
  /** Rows currently in the dataset; 0 renders the empty state. */
  count: number;
  /** Singular noun used in labels and toasts, e.g. `event` or `record`. */
  noun?: string;
  /** Builds the (lazily streamed) export plan for the requested format. */
  createPlan: (format: ExportFormat) => LogExportPlan;
  /** Accessible name for the trigger button. */
  'aria-label'?: string;
  className?: string;
  triggerLabel?: string;
}

/**
 * CSV/JSON export dropdown shared by the audit/history views.
 *
 * Keyboard accessible per the WAI-ARIA menu pattern (Arrow/Home/End, Escape,
 * Enter/Space) with a visible focus ring on the trigger, an explicit empty
 * state when there is nothing to export, an "Exporting…" busy state while a
 * large file streams, and `sonner` toasts confirming the downloaded filename.
 */
export function LogExportMenu({
  count,
  noun = 'entry',
  createPlan,
  'aria-label': ariaLabel = 'Export log data',
  className,
  triggerLabel = 'Export',
}: LogExportMenuProps) {
  const [busy, setBusy] = useState(false);
  const empty = count === 0;
  const countLabel = `${count} ${count === 1 ? noun : `${noun}s`}`;

  const run = async (format: ExportFormat) => {
    if (busy) return;
    setBusy(true);
    try {
      const plan = createPlan(format);
      await downloadLogExportAsync(plan);
      toast.success(`${format.toUpperCase()} exported`, {
        description: `${countLabel} saved as ${plan.filename}`,
      });
    } catch (error) {
      toast.error('Export failed', {
        description:
          error instanceof Error
            ? error.message
            : 'Unexpected error while generating the file.',
      });
    } finally {
      setBusy(false);
    }
  };

  const items: (DropdownItem | 'separator')[] = empty
    ? [
        {
          label: 'Download CSV',
          icon: <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />,
          disabled: true,
        },
        {
          label: 'Download JSON',
          icon: <FileJson className="h-3.5 w-3.5" aria-hidden />,
          disabled: true,
        },
        'separator',
        {
          label: `No ${noun}s to export yet`,
          description: 'CSV and JSON downloads become available once entries exist.',
          disabled: true,
        },
      ]
    : [
        {
          label: `Download CSV (${countLabel})`,
          icon: <FileSpreadsheet className="h-3.5 w-3.5 text-success" aria-hidden />,
          disabled: busy,
          onSelect: () => void run('csv'),
        },
        {
          label: `Download JSON (${countLabel})`,
          icon: <FileJson className="h-3.5 w-3.5 text-gold" aria-hidden />,
          disabled: busy,
          onSelect: () => void run('json'),
        },
      ];

  return (
    <Dropdown
      align="end"
      aria-label={ariaLabel}
      className={cn('min-w-[240px]', className)}
      triggerClassName={cn(
        buttonVariants({ variant: 'outline', size: 'sm' }),
        'gap-1.5',
      )}
      trigger={
        <>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Download className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy ? 'Exporting…' : triggerLabel}
        </>
      }
      items={items}
    />
  );
}

export default LogExportMenu;
