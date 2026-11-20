'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useAssistantStore } from '@/stores/ui-store';
import { useAssistantSeed, useBriefing } from '@/hooks/use-queries';
import { focusTrapStack } from '@/hooks/focusTrapStack';
import { cn } from '@/lib/cn';
import { env, isMockMode } from '@/lib/env';
import type { ChatMessage } from '@/types/domain';
import { FinancialBriefingPanel } from '@/features/ai/FinancialBriefingPanel';

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

/** Shared, brand-tinted focus ring for drawer controls (WCAG AA). */
/**
 * Slide-over AI assistant. Seeds from the mock conversation and the daily
 * briefing's suggested prompts. Composer is local-only (no backend in mock
 * mode) — sending appends an optimistic user turn plus a canned acknowledgement
 * so the interaction reads end-to-end.
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

  useEffect(() => {
    if (open && pendingPrompt) setDraft(pendingPrompt);
  }, [open, pendingPrompt]);
  const [seeded, setSeeded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = window.localStorage.getItem('astroid-assistant-chat');
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

  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      window.localStorage.setItem('astroid-assistant-chat', JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [open, messages]);

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

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const stamp = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: stamp,
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft('');

    if (isMockMode) {
      const mockReply: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content:
          'I can help with that. In this preview the assistant is running in mock mode — set NEXT_PUBLIC_API_URL to connect to the live API.',
        createdAt: stamp,
      };
      setMessages((prev) => [...prev, mockReply]);
      return;
    }

    try {
      const res = await fetch(`${env.apiUrl}${env.apiVersion}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const body = await res.json();
      const reply = body?.data?.reply ?? body?.reply ?? 'No response from AI.';
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-err-${Date.now()}`,
          role: 'assistant',
          content: 'Failed to reach the AI service. Check the API connection.',
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

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
            />
          </div>
        </div>
      </div>
    </>
  );
}
