import type { AiBriefing, ChatMessage } from '@/types/domain';

export type BriefingExportFormat = 'markdown' | 'plaintext';

/**
 * Formats an AI financial briefing and optional conversation transcript into
 * Markdown or plain text for clipboard copying or report downloading.
 */
export function formatBriefingContent(
  briefing: AiBriefing,
  messages: readonly ChatMessage[] = [],
  format: BriefingExportFormat = 'markdown',
): string {
  if (format === 'plaintext') {
    const lines: string[] = [
      briefing.greeting,
      `Generated: ${briefing.generatedAt}`,
      '',
      'SUMMARY',
      briefing.summary,
    ];

    if (briefing.insights.length > 0) {
      lines.push('', 'KEY INSIGHTS');
      for (const insight of briefing.insights) {
        lines.push(`- [${insight.severity.toUpperCase()}] ${insight.title}: ${insight.detail}`);
      }
    }

    if (messages.length > 0) {
      lines.push('', 'CONVERSATION LOG');
      for (const msg of messages) {
        lines.push(`${msg.role.toUpperCase()}: ${msg.content}`);
      }
    }

    return lines.join('\n');
  }

  const mdLines: string[] = [
    `# ${briefing.greeting}`,
    `_Generated at ${briefing.generatedAt}_`,
    '',
    '## Executive Summary',
    briefing.summary,
  ];

  if (briefing.insights.length > 0) {
    mdLines.push('', '## Key Insights');
    for (const insight of briefing.insights) {
      mdLines.push(`- **[${insight.severity.toUpperCase()}] ${insight.title}**: ${insight.detail}`);
    }
  }

  if (messages.length > 0) {
    mdLines.push('', '## Assistant Transcript');
    for (const msg of messages) {
      mdLines.push(`- **${msg.role === 'assistant' ? 'Astroid AI' : 'Operator'}**: ${msg.content}`);
    }
  }

  return mdLines.join('\n');
}

/**
 * Copies text to the clipboard with a fallback for restricted browser environments.
 */
export async function copyBriefingToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to textarea selection copy below
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

/**
 * Triggers a browser download of the formatted briefing as a `.md` or `.txt` file.
 */
export function downloadBriefingReport(
  content: string,
  filename = 'astroid-financial-briefing.md',
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}
