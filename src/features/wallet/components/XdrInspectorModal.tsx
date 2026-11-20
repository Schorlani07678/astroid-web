'use client';

import { useCallback, useMemo, useState } from 'react';
import { Clipboard, FileCode2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { parseTransactionXdr } from '@/lib/xdr';

export interface XdrInspectorModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Request to close the modal (Escape and overlay dismissal). */
  onClose: () => void;
  /** Base64-encoded TransactionEnvelope XDR to inspect. Defaults to a sample. */
  xdr?: string;
}

const SAMPLE_XDR = (() => {
  const payload = {
    type: 'TransactionEnvelope',
    sourceAccount: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
    fee: '100',
    sequenceNumber: '2147483649',
    operationCount: 2,
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    operations: [
      {
        type: 'Payment',
        source: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
        destination: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
        amount: '125.50',
        asset: 'USDC',
      },
      { type: 'ManageData', source: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H' },
    ],
    signatures: [
      { publicKey: 'GD2E5MGVZ4XGIVLNCF4YBZV3JR5M2U3A2P6Q4Y4M7P6KOCZQ7W6I3Q4', hint: 'ed25519' },
    ],
  };
  return typeof Buffer !== 'undefined'
    ? Buffer.from(JSON.stringify(payload)).toString('base64')
    : globalThis.btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
})();

function operationIcon(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes('payment')) return <FileCode2 className="h-3.5 w-3.5" aria-hidden />;
  if (normalized.includes('manage') || normalized.includes('data')) return (
    <FileCode2 className="h-3.5 w-3.5 text-gold" aria-hidden />
  );
  return <FileCode2 className="h-3.5 w-3.5" aria-hidden />;
}

/** Escape a string for safe rendering inside a code block. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Minimal syntax-aware highlighting for a JSON envelope without extra deps. */
function highlightJson(text: string): string {
  return text
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/g, '<span class="text-gold-strong">"$1"</span>:')
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, '<span class="text-foreground-muted">"$1"</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="text-danger">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="text-info">$1</span>');
}

export function XdrInspectorModal({ open, onClose, xdr }: XdrInspectorModalProps) {
  const [rawXdr, setRawXdr] = useState<string>(xdr ?? SAMPLE_XDR);
  const [isCopied, setIsCopied] = useState(false);

  const parsed = useMemo(() => parseTransactionXdr(rawXdr), [rawXdr]);

  const handleCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(rawXdr);
      setIsCopied(true);
      toast.success('XDR copied to clipboard', {
        description: 'Paste it into your wallet or signing tool before submitting.',
      });
      setTimeout(() => setIsCopied(false), 1500);
    } catch {
      toast.error('Unable to copy XDR to clipboard');
    }
  }, [rawXdr]);

  const handleReset = useCallback(() => {
    setRawXdr(SAMPLE_XDR);
    setIsCopied(false);
  }, []);

  return (
    <Dialog open={open} onClose={onClose} title="Transaction XDR inspector" size="lg">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-gold" aria-hidden />
              <CardTitle className="text-base">
                Review raw Stellar TransactionEnvelope XDR before signing.
              </CardTitle>
            </div>
            <Badge
              variant={parsed.valid ? 'success' : 'warning'}
              size="sm"
              aria-live="polite"
            >
              {parsed.valid ? 'Envelope valid' : 'Needs review'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Raw XDR — scrollable, monospace, syntax-highlighted view */}
          <Card className="border border-border bg-surface-secondary/40">
            <CardHeader className="px-3 py-2 bg-surface-secondary/30 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-foreground-secondary">
                  Raw XDR (base64)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleCopy}
                    disabled={isCopied}
                    aria-label={isCopied ? 'Copied' : 'Copy XDR to clipboard'}
                  >
                    <Clipboard className={cn('h-4 w-4', isCopied && 'text-success')} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleReset}
                    aria-label="Load sample XDR"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <div
                className="overflow-auto font-mono text-xs text-foreground max-h-96 whitespace-pre"
                // `rawXdr` is run through `escapeHtml` before highlighting; the only
                // unescaped markup inserted here is the author-generated `<span>`
                // tags from `highlightJson`, so this is safe.
                dangerouslySetInnerHTML={{ __html: highlightJson(escapeHtml(rawXdr)) }}
              />
            </CardContent>
          </Card>

          {/* Decoded operations — formatted, scrollable list */}
          <Card className="border border-border bg-surface-secondary/40 flex flex-col">
            <CardHeader className="px-3 py-2 bg-surface-secondary/30 border-b border-border">
              <span className="text-[10px] uppercase tracking-wider text-foreground-secondary">
                Decoded operations ({parsed.operations.length})
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-y-auto max-h-64">
                {parsed.operations.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {parsed.operations.map((operation, index) => (
                      <li key={`${operation.type}-${index}`} className="px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 shrink-0">
                            {operationIcon(operation.type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">
                              {operation.type}
                            </p>
                            <div className="mt-1 space-y-0.5 text-[10px] text-foreground-secondary">
                              {operation.source && (
                                <p className="truncate">
                                  <span className="font-medium">Source:</span>{' '}
                                  {escapeHtml(operation.source)}
                                </p>
                              )}
                              {operation.destination && (
                                <p className="truncate">
                                  <span className="font-medium">Destination:</span>{' '}
                                  {escapeHtml(operation.destination)}
                                </p>
                              )}
                              {operation.amount && (
                                <p>
                                  <span className="font-medium">Amount:</span>{' '}
                                  {escapeHtml(operation.amount)}
                                </p>
                              )}
                              {operation.asset && (
                                <p>
                                  <span className="font-medium">Asset:</span>{' '}
                                  {escapeHtml(String(operation.asset))}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-4 text-xs text-foreground-secondary">
                    No operation metadata was decoded from this XDR.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-foreground-secondary">
            <span>
              Source: {escapeHtml(parsed.sourceAccount)} &bull; Fee:{' '}
              {escapeHtml(parsed.fee)} stroops &bull; Sequence:{' '}
              {escapeHtml(parsed.sequenceNumber)}
            </span>
            <span className="font-mono">{escapeHtml(parsed.networkPassphrase)}</span>
          </div>

          {(!parsed.valid || parsed.warning) && (
            <div className="rounded-md border border-warning/50 bg-warning-soft/25 p-3 text-xs text-warning">
              <p className="font-medium">{parsed.message}</p>
              {parsed.warning && <p className="mt-0.5">{parsed.warning}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </Dialog>
  );
}

export default XdrInspectorModal;
