'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronRight, ShieldCheck, X, XCircle } from 'lucide-react';
import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { PolicyRuleEvaluation, PolicySimulationResponse } from './policyTypes';

export interface PolicySimulationViewProps {
  open: boolean;
  onClose: () => void;
  result: PolicySimulationResponse | null;
  loading?: boolean;
  error?: string | null;
}

const labels: Record<PolicyRuleEvaluation['kind'], string> = {
  daily_limit: 'Daily spending limit',
  recipient_whitelist: 'Recipient whitelist',
  multi_sig: 'Multi-signature approval',
  custom: 'Custom policy',
};

function StatusBadge({ status }: { status: PolicyRuleEvaluation['status'] }) {
  const styles = {
    pass: 'bg-success-soft text-success',
    fail: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold capitalize ${styles[status]}`}>
      {status === 'pass' ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : status === 'fail' ? <XCircle className="h-3 w-3" aria-hidden /> : <AlertTriangle className="h-3 w-3" aria-hidden />}
      {status === 'pass' ? 'Passed' : status === 'fail' ? 'Failed' : 'Warning'}
    </span>
  );
}

/** Read-only policy preview. A passing preview never signs or broadcasts a transaction. */
export function PolicySimulationView({ open, onClose, result, loading = false, error = null }: PolicySimulationViewProps) {
  const headingId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  // Shared WCAG AA modal behaviour: Escape closes, Tab/Shift+Tab stay inside
  // the panel (including inputs/selects, and pulling drifted focus back),
  // body scroll is locked, and focus returns to the trigger on close.
  useFocusTrap({ active: open, containerRef: panelRef, onEscape: onClose });

  const hasFailures = result?.rules.some((rule) => rule.status === 'fail') ?? false;
  const passed = result?.status === 'pass' && !hasFailures;
  const visible = open && typeof document !== 'undefined';
  return typeof document === 'undefined' ? null : createPortal(
    <AnimatePresence>
      {visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div className="absolute inset-0 bg-foreground/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }} onClick={onClose} aria-hidden />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            initial={reducedMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: reducedMotion ? 0 : 0.22 }}
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-2xl outline-none"
          >
            <header className="flex items-start justify-between gap-4 border-b border-border p-6">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-foreground-muted">Transaction safety</p>
                <h2 id={headingId} className="font-display text-xl font-semibold">Policy simulation</h2>
                <p id={descriptionId} className="mt-1 text-sm text-foreground-secondary">Review the evaluated policies before signing on-chain.</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close simulation"><X className="h-5 w-5" aria-hidden /></Button>
            </header>
            <div className="overflow-y-auto p-6">
              <div aria-live="polite" aria-atomic="true" role="status">
                {loading ? <p className="rounded-lg bg-background-secondary p-4 text-sm">Evaluating transaction policies…</p> :
                  error ? <p className="rounded-lg bg-danger-soft p-4 text-sm text-danger">Simulation unavailable: {error}</p> :
                  result ? (
                    <div className={`rounded-lg border p-4 ${passed ? 'border-success/30 bg-success-soft' : 'border-danger/30 bg-danger-soft'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {passed ? <ShieldCheck className="h-6 w-6 text-success" aria-hidden /> : <XCircle className="h-6 w-6 text-danger" aria-hidden />}
                          <div>
                            <p className="font-semibold">{passed ? 'All required policies passed' : 'Transaction violates policy'}</p>
                            <p className="text-xs text-foreground-secondary">{result.rules.filter((r) => r.status === 'pass').length} of {result.rules.length} checks passed</p>
                          </div>
                        </div>
                        <StatusBadge status={passed ? 'pass' : 'fail'} />
                      </div>
                    </div>
                  ) : <p className="text-sm text-foreground-secondary">No simulation result available.</p>}
              </div>
              {!loading && !error && result && (
                <section aria-label="Evaluated policy rules" className="mt-6">
                  <h3 className="mb-3 text-sm font-semibold">Rule breakdown</h3>
                  {result.rules.length === 0 ? <p className="rounded-lg border border-border p-4 text-sm text-foreground-secondary">No rules were evaluated. Verify the policy configuration before proceeding.</p> :
                    <ul className="space-y-3">
                      {result.rules.map((rule) => (
                        <li key={rule.id} className="rounded-lg border border-border bg-background p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{rule.name || labels[rule.kind]}</p>
                              {rule.description && <p className="mt-1 text-xs text-foreground-secondary">{rule.description}</p>}
                            </div>
                            <StatusBadge status={rule.status} />
                          </div>
                          {rule.reason && <p className="mt-3 text-sm text-foreground-secondary">{rule.reason}</p>}
                          {rule.conditions.length > 0 && <ul className="mt-3 divide-y divide-border border-t border-border">
                            {rule.conditions.map((condition, index) => (
                              <li key={index} className="flex flex-wrap items-start gap-2 py-3 text-xs">
                                {condition.matched ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Matched" /> : <XCircle className="h-4 w-4 shrink-0 text-danger" aria-label="Not matched" />}
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium">{condition.label}</p>
                                  <p className="mt-1 text-foreground-secondary">Required: {condition.expected}</p>
                                  <p className="text-foreground-secondary">Proposed: {condition.actual}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-foreground-muted" aria-hidden />
                              </li>
                            ))}
                          </ul>}
                        </li>
                      ))}
                    </ul>}
                  <p className="mt-4 text-xs text-foreground-muted">Simulation ID: {result.simulationId} · Evaluated: {result.evaluatedAt}</p>
                </section>
              )}
            </div>
            <footer className="flex justify-end border-t border-border p-4"><Button variant="secondary" onClick={onClose}>Close preview</Button></footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
