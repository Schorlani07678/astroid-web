'use client';

import { LogExportMenu } from './LogExportMenu';
import { planAuditExport } from './export-utils';
import type { AuditEvent } from './types';

export interface AuditExportMenuProps {
  /** The currently visible (filtered) audit events to export. */
  events: readonly AuditEvent[];
  className?: string;
  label?: string;
}

/**
 * Export dropdown for the agent-activity audit-log header.
 *
 * Exports exactly the rows the table is showing (filters, search, and time
 * range applied) as a CSV download with proper escaping or a self-describing
 * JSON file, both stamped with a timestamped filename.
 */
export function AuditExportMenu({
  events,
  className,
  label = 'Export audit log',
}: AuditExportMenuProps) {
  return (
    <LogExportMenu
      count={events.length}
      noun="event"
      aria-label={label}
      className={className}
      createPlan={(format) => planAuditExport(events, format)}
    />
  );
}

export default AuditExportMenu;
