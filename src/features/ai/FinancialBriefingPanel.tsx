'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Send, Sparkles } from 'lucide-react';
import { MarkdownMessage } from '@/components/chat/MarkdownMessage';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import type { ChatMessage } from '@/types/domain';
import type { AssistantGenerationState } from './assistantStream';

export interface FinancialBriefingPrompt {
  label: string;
  prompt: string;
}

export interface FinancialBriefingPanelProps {
  messages: ChatMessage[];
  draft: string;
  suggestions: FinancialBriefingPrompt[];
  onDraftChange: (draft: string) => void;
  onSend: (message: string) => void | Promise<void>;
  /**
   * `waiting` — request sent, no tokens yet (typing indicator);
   * `streaming` — tokens arriving into `streamingMessageId` (caret).
   */
  generationState?: AssistantGenerationState;
  /** Assistant message currently receiving streamed chunks, if any. */
  streamingMessageId?: string | null;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function AssistantAvatar() {
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gold-soft font-mono text-xs text-gold"
      aria-hidden="true"
    >
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * Animated "assistant is thinking" bubble shown between sending a prompt and
 * the first streamed chunk. Subtle Framer Motion pulse; static dots when the
 * user prefers reduced motion.
 */
function TypingIndicator() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex gap-3" role="status" aria-live="polite">
      <AssistantAvatar />
      {/* Spacing scale is custom (1 = 4px, 2 = 8px…; no half steps), hence the explicit dot size. */}
      <div className="flex h-8 items-center gap-1 rounded-card border border-border bg-surface-secondary/60 px-4">

        <span className="sr-only">Assistant is generating a response…</span>
        {[0, 1, 2].map((dot) => (
          <motion.span
            key={dot}
            aria-hidden
            className="h-[7px] w-[7px] rounded-full bg-gold"
            animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: dot * 0.18 }
            }
          />
        ))}
      </div>
    </div>
  );
}

export function FinancialBriefingPanel({
  messages,
  draft,
  suggestions,
  onDraftChange,
  onSend,
  generationState = 'idle',
  streamingMessageId = null,
}: FinancialBriefingPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isGenerating = generationState !== 'idle';

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [draft]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-4 p-5">
        <div
          role="log"
          aria-label="Financial briefing conversation"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={isGenerating}
          className="space-y-4"
        >
          {messages.map((message) => {
            const isStreaming = generationState === 'streaming' && message.id === streamingMessageId;
            return (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' && 'flex-row-reverse',
                )}
              >
                {message.role === 'assistant' ? <AssistantAvatar /> : <Avatar name="You" size="xs" />}
                <div
                  className={cn(
                    'p-3.5 max-w-[85%] break-words rounded-card text-sm leading-relaxed',
                    message.role === 'user'
                      ? 'whitespace-pre-wrap bg-accent-gradient font-medium text-background-secondary shadow-sm'
                      : 'border border-border bg-surface-secondary/60 text-foreground',
                  )}
                >
                  {message.role === 'assistant' ? (
                    <MarkdownMessage content={message.content} streaming={isStreaming} />
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {generationState === 'waiting' && <TypingIndicator />}

        {suggestions.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <p className="text-2xs font-semibold uppercase text-foreground-muted">
              Suggested Actions
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  onClick={() => {
                    onDraftChange(suggestion.prompt);
                    textareaRef.current?.focus();
                  }}
                  className={cn(
                    'group flex items-center justify-between gap-2 rounded-button border border-border bg-surface p-3 text-left text-xs text-foreground-secondary transition-colors duration-fast hover:border-gold hover:text-foreground',
                    FOCUS_RING,
                  )}
                >
                  <span>{suggestion.label}</span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        className="sticky bottom-0 shrink-0 border-t border-border bg-surface-secondary/90 p-4 backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isGenerating) void onSend(draft);
        }}
        aria-label="Send a financial briefing question"
      >
        <div className="flex items-end gap-2 rounded-button border border-border bg-surface px-3 py-2 transition-colors focus-within:border-gold focus-within:ring-1 focus-within:ring-gold">
          <label className="sr-only" htmlFor="financial-briefing-prompt">
            Ask about treasury health, agent spending, or Stellar activity
          </label>
          <textarea
            ref={textareaRef}
            id="financial-briefing-prompt"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!isGenerating) void onSend(draft);
              }
            }}
            rows={1}
            placeholder="Ask about spend, policies..."
            className="max-h-32 py-1.5 min-h-8 flex-1 resize-none overflow-y-auto bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isGenerating}
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-button bg-accent-gradient font-semibold text-background-secondary transition-opacity duration-fast disabled:opacity-40',
              FOCUS_RING,
            )}
            aria-label={isGenerating ? 'Waiting for the assistant to finish' : 'Send message'}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}

export default FinancialBriefingPanel;
