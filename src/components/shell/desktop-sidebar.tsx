'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { navSections } from '@/lib/nav';
import { cn } from '@/lib/cn';
import { useAssistantStore } from '@/stores/ui-store';

const SIDEBAR_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

export function DesktopSidebar() {
  const pathname = usePathname();
  const assistantOpen = useAssistantStore((state) => state.open);
  const setAssistantOpen = useAssistantStore((state) => state.setOpen);

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {navSections.map((section) => (
          <div key={section.heading} className="space-y-1">
            <p className="px-3 pb-1 text-2xs font-semibold uppercase text-foreground-muted">
              {section.heading}
            </p>
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    SIDEBAR_FOCUS,
                    'flex items-center gap-3 rounded-button border-l-2 px-3 py-2 text-sm font-medium transition-colors duration-fast',
                    active
                      ? 'border-gold bg-gold-soft text-gold-strong'
                      : 'border-transparent text-foreground-secondary hover:bg-surface-secondary hover:text-foreground',
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          aria-label="Open AI assistant"
          aria-haspopup="dialog"
          aria-expanded={assistantOpen}
          aria-pressed={assistantOpen}
          className={cn(
            SIDEBAR_FOCUS,
            'flex w-full items-center gap-3 rounded-button border-l-2 px-3 py-2 text-sm font-medium transition-colors duration-fast',
            assistantOpen
              ? 'border-gold bg-gold-soft text-gold-strong'
              : 'border-transparent text-foreground-secondary hover:bg-surface-secondary hover:text-foreground',
          )}
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span>AI assistant</span>
        </button>
      </div>
    </aside>
  );
}