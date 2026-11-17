import assert from 'node:assert/strict';
import test from 'node:test';
import type { AiBriefing, ChatMessage } from '@/types/domain';
import { formatBriefingContent } from './briefingExport';

const MOCK_BRIEFING: AiBriefing = {
  greeting: 'Daily Treasury Briefing',
  summary: 'Fleet spending remained 12% below weekly allocation across 8 active agents.',
  generatedAt: '2026-11-15T08:00:00Z',
  insights: [
    {
      id: 'ins-1',
      title: 'USDC Reserve Healthy',
      detail: 'Treasury vault holds 45,000 USDC with zero policy violations.',
      severity: 'success',
    },
  ],
  suggestedActions: [],
};

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Show top spending agent today.',
    createdAt: '2026-11-15T08:01:00Z',
  },
];

test('formatBriefingContent formats markdown and plaintext reports accurately', () => {
  const markdown = formatBriefingContent(MOCK_BRIEFING, MOCK_MESSAGES, 'markdown');
  assert.ok(markdown.includes('# Daily Treasury Briefing'));
  assert.ok(markdown.includes('## Executive Summary'));
  assert.ok(markdown.includes('USDC Reserve Healthy'));
  assert.ok(markdown.includes('Show top spending agent today.'));

  const plaintext = formatBriefingContent(MOCK_BRIEFING, MOCK_MESSAGES, 'plaintext');
  assert.ok(plaintext.includes('SUMMARY'));
  assert.ok(plaintext.includes('KEY INSIGHTS'));
  assert.ok(!plaintext.includes('## Executive Summary'));
});
