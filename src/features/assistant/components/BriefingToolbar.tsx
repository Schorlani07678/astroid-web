'use client';

import { useState } from 'react';
import { Check, Copy, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AiBriefing, ChatMessage } from '@/types/domain';
import {
  copyBriefingToClipboard,
  downloadBriefingReport,
  formatBriefingContent,
} from '../utils/briefingExport';

export interface BriefingToolbarProps {
  briefing: AiBriefing;
  messages?: readonly ChatMessage[];
  filename?: string;
}

/**
 * Toolbar for the AI financial briefing assistant drawer enabling operators
 * to copy Markdown or plain-text summaries to clipboard or download `.md` reports.
 */
export function BriefingToolbar({
  briefing,
  messages = [],
  filename = 'astroid-financial-briefing.md',
}: BriefingToolbarProps) {
  const [copiedMode, setCopiedMode] = useState<'markdown' | 'plaintext' | null>(null);

  const handleCopy = async (mode: 'markdown' | 'plaintext') => {
    const formatted = formatBriefingContent(briefing, messages, mode);
    const ok = await copyBriefingToClipboard(formatted);
    if (ok) {
      setCopiedMode(mode);
      window.setTimeout(() => {
        setCopiedMode((current) => (current === mode ? null : current));
      }, 2000);
    }
  };

  const handleDownload = () => {
    const markdown = formatBriefingContent(briefing, messages, 'markdown');
    downloadBriefingReport(markdown, filename);
  };

  return (
    <div
      role="toolbar"
      aria-label="Financial briefing export and share actions"
      className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-2.5"
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leftIcon={
          copiedMode === 'markdown' ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )
        }
        onClick={() => {
          void handleCopy('markdown');
        }}
      >
        {copiedMode === 'markdown' ? 'Copied Markdown' : 'Copy Markdown'}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        leftIcon={
          copiedMode === 'plaintext' ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          ) : (
            <FileText className="h-3.5 w-3.5" aria-hidden />
          )
        }
        onClick={() => {
          void handleCopy('plaintext');
        }}
      >
        {copiedMode === 'plaintext' ? 'Copied Text' : 'Copy Plain Text'}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto"
        leftIcon={<Download className="h-3.5 w-3.5" aria-hidden />}
        onClick={handleDownload}
      >
        Download .md
      </Button>
    </div>
  );
}
