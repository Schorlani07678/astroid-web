'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useAssistantStore } from '@/stores/ui-store';
import { useAssistantSeed, useBriefing } from '@/hooks/use-queries';
import { focusTrapStack } from '@/hooks/focusTrapStack';
import { cn } from '@/lib/cn';
import { env, isMockMode } from '@/lib/env';
import type { ChatMessage } from '@/types/domain';
import { FinancialBriefingPanel } from '@/features/ai/FinancialBriefingPanel';
import {
  chunkForSimulatedStream,
  createSseDecoder,
  extractReply,
  isStreamingContentType,
  type AssistantGenerationState,
} from '@/features/ai/assistantStream';

const defaultSuggestions = [
  {
    label: 'Financial summary',
    prompt: 'Summarize treasury health and any anomaly alerts.',
  },
  {
    label: 'Budget check',
    prompt: 'Check budget health and flag any risks before close.',
  },
  {
    label: 'Stellar transfer explainer',
    prompt: 'Explain the most recent high-value Stellar transfer in plain English.',
  },
];

const STORAGE_KEY = 'astroid-assistant-chat';
const AI_UNREACHABLE_MESSAGE = 'Failed to reach the AI service. Check the API connection.';

/** Mock-mode reply, written in Markdown so the preview exercises the renderer. */
const MOCK_REPLY = [
  'I can help with that. This preview is running in **mock mode**, so here is how a live briefing renders:',
  '',
  '- Treasury balances are **healthy** across tracked wallets',
  '- *No* anomaly alerts were raised in the last 24 hours',
  '- Set `NEXT_PUBLIC_API_URL` to connect to the live API',
].join('\n');

const MOCK_FIRST_TOKEN_DELAY_MS = 650;
const MOCK_TOKEN_INTERVAL_MS = 35;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

/** Replays a canned reply through the streaming pipeline (mock mode only). */
async function simulateStream(text: string, emit: (delta: string) => void, signal: AbortSignal) {
  await sleep(MOCK_FIRST_TOKEN_DELAY_MS, signal);
  for (const chunk of chunkForSimulatedStream(text)) {
    emit(chunk);
    await sleep(MOCK_TOKEN_INTERVAL_MS, signal);
  }
}

/**
 * Floating AI assistant (non-modal dialog). Seeds from the mock conversation
 * and the daily briefing's suggested prompts.
 *
 * Replies are streamed: a typing indicator shows while awaiting the first
 * chunk, then tokens render incrementally as Markdown with a caret. The live
 * endpoint may answer with SSE, chunked text, or plain JSON; mock mode replays
 * a canned Markdown reply through the same pipeline.
 */
export function AssistantDrawer() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const pendingPrompt = useAssistantStore((s) => s.pendingPrompt);
  const seedQuery = useAssistantSeed();
  const briefingQuery = useBriefing();
  // Keyboard/a11y: focus moves to the composer on open and returns to the
  // trigger on close; Escape defers to stacked modals; when closed the
  // widget is hidden from the tab order and assistive tech.
  // The drawer renders once in the dashboard shell, so a static id is unique.
  const headingId = 'assistant-drawer-title';
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [generationState, setGenerationState] = useState<AssistantGenerationState>('idle');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open && pendingPrompt) setDraft(pendingPrompt);
  }, [open, pendingPrompt]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          setSeeded(true);
        }
      }
    } catch {
      // Ignore malformed local history and fall back to the seed conversation.
    }
  }, []);

  // Seed the transcript once the mock conversation resolves.
  useEffect(() => {
    if (!seeded && seedQuery.data) {
      setMessages(seedQuery.data);
      setSeeded(true);
    }
  }, [seeded, seedQuery.data]);

  // Persist once a reply has settled, not on every streamed token.
  useEffect(() => {
    if (typeof window === 'undefined' || messages.length === 0 || generationState !== 'idle') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Storage full or blocked (private mode): history is best-effort.
    }
  }, [messages, generationState]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [open, messages, generationState]);

  // Cancel any in-flight generation when the drawer unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Focus management: composer on open, trigger on close.
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return undefined;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The wrapper's `visibility` transitions from `hidden`, and browsers refuse
    // to focus an element that is still computed hidden at that instant. Retry
    // each frame (bounded) until focus actually lands in the composer.
    let frame = 0;
    let attempts = 0;
    const focusComposer = () => {
      const composer = panel.querySelector<HTMLElement>('#financial-briefing-prompt');
      composer?.focus({ preventScroll: true });
      attempts += 1;
      if (composer && document.activeElement !== composer && attempts < 30) {
        frame = window.requestAnimationFrame(focusComposer);
      }
    };
    frame = window.requestAnimationFrame(focusComposer);

    return () => {
      window.cancelAnimationFrame(frame);
      const active = document.activeElement;
      const focusWasInDrawer =
        !active || active === document.body || panel.contains(active);
      const target = returnFocusRef.current;
      if (focusWasInDrawer && target && document.contains(target)) {
        target.focus({ preventScroll: true });
      }
    };
  }, [open]);

  // Escape closes the (non-modal) assistant only while it is open, only when
  // focus is in it (or nowhere), and never while a modal dialog is stacked
  // above it — that dialog's focus trap owns Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (focusTrapStack.size() > 0) return;
      const active = document.activeElement;
      if (active && active !== document.body && !panelRef.current?.contains(active)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || abortRef.current) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setDraft('');

      const controller = new AbortController();
      abortRef.current = controller;
      setGenerationState('waiting');

      const replyId = `a-${Date.now()}`;
      let started = false;
      const emit = (delta: string) => {
        if (!delta || controller.signal.aborted) return;
        if (!started) {
          started = true;
          setMessages((prev) => [
            ...prev,
            { id: replyId, role: 'assistant', content: delta, createdAt: new Date().toISOString() },
          ]);
          setStreamingMessageId(replyId);
          setGenerationState('streaming');
          return;
        }
        setMessages((prev) =>
          prev.map((message) =>
            message.id === replyId ? { ...message, content: message.content + delta } : message,
          ),
        );
      };

      try {
        if (isMockMode) {
          await simulateStream(MOCK_REPLY, emit, controller.signal);
          return;
        }

        const res = await fetch(`${env.apiUrl}${env.apiVersion}/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json;q=0.9, text/plain;q=0.8',
          },
          body: JSON.stringify({ message: trimmed }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`AI service responded with ${res.status}`);

        const contentType = res.headers.get('content-type');
        if (res.body && isStreamingContentType(contentType)) {
          const reader = res.body.getReader();
          const textDecoder = new TextDecoder();
          const sse = /event-stream/i.test(contentType ?? '') ? createSseDecoder() : null;

          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = textDecoder.decode(value, { stream: true });
            if (!sse) {
              emit(chunk);
              continue;
            }
            const result = sse.push(chunk);
            result.deltas.forEach(emit);
            if (result.done) {
              await reader.cancel();
              break;
            }
          }

          const tail = textDecoder.decode();
          if (sse) {
            sse.push(tail).deltas.forEach(emit);
            sse.flush().deltas.forEach(emit);
          } else {
            emit(tail);
          }
          if (!started) emit('No response from AI.');
        } else {
          emit(extractReply(await res.json()));
        }
      } catch {
        if (controller.signal.aborted) return;
        // Keep whatever streamed before the failure and flag the interruption.
        emit(started ? `\n\n_${AI_UNREACHABLE_MESSAGE}_` : AI_UNREACHABLE_MESSAGE);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setGenerationState('idle');
          setStreamingMessageId(null);
        }
      }
    },
    [],
  );

  const suggestions = useMemo(
    () =>
      briefingQuery.data?.suggestedActions?.length
        ? briefingQuery.data.suggestedActions
        : defaultSuggestions,
    [briefingQuery.data],
  );

  return (
    <>
      {/* Floating Bottom-Right AI Widget */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-50 flex flex-col items-end justify-end transition-all duration-base ease-astroid sm:bottom-8 sm:right-8',
          open
            ? 'pointer-events-auto visible origin-bottom-right scale-100 opacity-100'
            : // `invisible` removes the closed widget's controls from the tab
              // order (an opacity-0 panel used to keep them focusable).
              'pointer-events-none invisible origin-bottom-right scale-95 opacity-0',
        )}
        aria-hidden={!open}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={headingId}
          aria-modal="false"
          className="shadow-raised relative flex h-[580px] max-h-[calc(100vh-120px)] w-[400px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-card border border-border-strong bg-surface/95 backdrop-blur-xl"
        >
          <header className="h-16 flex shrink-0 items-center justify-between border-b border-border bg-surface-secondary/40 px-5">
            <span className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-button bg-accent-gradient text-background-secondary shadow-sm">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h3 id={headingId} className="font-display text-sm font-semibold leading-tight">
                  Command Terminal
                </h3>
                <p className="text-2xs text-foreground-secondary">
                  Autonomous AI Copilot
                </p>
              </div>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-button text-foreground-secondary transition-colors duration-fast hover:bg-surface-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {messages.length === 0 && (
              <div className="mx-5 mt-5 rounded-card border border-dashed border-border bg-surface-secondary/40 p-4 text-sm leading-relaxed text-foreground-secondary">
                Ask for a treasury summary, a budget-risk review, or a plain-English
                explanation of a Stellar transfer.
              </div>
            )}

            <FinancialBriefingPanel
              messages={messages}
              draft={draft}
              suggestions={suggestions}
              onDraftChange={setDraft}
              onSend={send}
              generationState={generationState}
              streamingMessageId={streamingMessageId}
            />
          </div>
        </div>
      </div>
    </>
  );
}
