'use client';

import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { parseMarkdown, type BlockNode, type InlineNode } from '@/lib/markdown';
import { cn } from '@/lib/cn';

export interface MarkdownMessageProps {
  /** Raw Markdown from the assistant (may be a partial, still-streaming reply). */
  content: string;
  /** Appends a blinking caret after the last block while chunks are arriving. */
  streaming?: boolean;
  className?: string;
}

function renderInline(nodes: InlineNode[], keyPrefix = 'i'): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.value}</Fragment>;
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-foreground">
            {renderInline(node.children, key)}
          </strong>
        );
      case 'em':
        return (
          <em key={key} className="italic">
            {renderInline(node.children, key)}
          </em>
        );
      case 'code':
        return (
          <code
            key={key}
            className="rounded-xs border border-border bg-background-secondary px-1 py-px font-mono text-[0.85em] text-foreground"
          >
            {node.value}
          </code>
        );
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-medium text-gold underline underline-offset-2 hover:text-gold-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {renderInline(node.children, key)}
          </a>
        );
      default:
        return null;
    }
  });
}

const headingClass = {
  1: 'text-base font-semibold',
  2: 'text-sm font-semibold',
  3: 'text-sm font-semibold text-foreground-secondary',
} as const;

function StreamingCaret() {
  return (
    <span
      aria-hidden
      className="ml-[2px] inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse rounded-full bg-gold align-baseline"
    />
  );
}

function renderBlock(block: BlockNode, key: string, caret: ReactNode): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return (
        <p key={key} className="whitespace-pre-wrap break-words">
          {renderInline(block.children, key)}
          {caret}
        </p>
      );
    case 'heading': {
      const Tag = (`h${Math.min(block.level + 3, 6)}`) as 'h4' | 'h5' | 'h6';
      return (
        <Tag key={key} className={cn('font-display leading-snug text-foreground', headingClass[block.level])}>
          {renderInline(block.children, key)}
          {caret}
        </Tag>
      );
    }
    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag
          key={key}
          start={block.ordered && block.start !== 1 ? block.start : undefined}
          className={cn('space-y-1 pl-5 marker:text-foreground-muted', block.ordered ? 'list-decimal' : 'list-disc')}
        >
          {block.items.map((item, index) => (
            <li key={`${key}-${index}`} className="break-words pl-[2px]">
              {renderInline(item, `${key}-${index}`)}
              {index === block.items.length - 1 ? caret : null}
            </li>
          ))}
        </ListTag>
      );
    }
    case 'code':
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-button border border-border bg-background-secondary p-3 font-mono text-2xs leading-relaxed text-foreground"
          aria-label={block.language ? `${block.language} code` : 'Code'}
        >
          <code>
            {block.value}
            {caret}
          </code>
        </pre>
      );
    default:
      return null;
  }
}

/**
 * Renders assistant Markdown safely: the reply is parsed into a typed AST and
 * emitted as React elements, so model output can never inject HTML. Supports
 * bold, italic, inline code, links (http/https/mailto only), lists, headings
 * and fenced code blocks, and stays readable while a reply is mid-stream.
 */
export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  streaming = false,
  className,
}: MarkdownMessageProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const caret = streaming ? <StreamingCaret /> : null;

  return (
    <div className={cn('space-y-2', className)}>
      {blocks.length === 0
        ? caret
        : blocks.map((block, index) =>
            renderBlock(block, `b-${index}`, index === blocks.length - 1 ? caret : null),
          )}
    </div>
  );
});

export default MarkdownMessage;
