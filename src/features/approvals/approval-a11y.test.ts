import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ApprovalStatusLiveRegion } from './components/ApprovalStatusLiveRegion';

/** This repo has no DOM/test-library dependency, so component markup is
 * checked through react-dom/server and source contracts are asserted here. */
const source = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('polite live region is mounted, hidden, and carries the announcement', () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalStatusLiveRegion, { message: 'Your approval was recorded.' }),
  );

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
  assert.match(html, /class="sr-only"/);
  assert.match(html, /Your approval was recorded\./);
});

test('assertive live region uses alert semantics for failures', () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalStatusLiveRegion, {
      message: 'Decision failed: wallet disconnected.',
      assertive: true,
    }),
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /Decision failed: wallet disconnected\./);
});

test('an empty announcement still renders the live region node', () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalStatusLiveRegion, { message: '' }),
  );

  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, />[^<]+</);
});

test('confirm dialog never leaves a dangling aria-describedby reference', () => {
  const dialog = source('src/features/approvals/components/ProposalApprovalConfirmDialog.tsx');

  assert.match(
    dialog,
    /aria-describedby=\{showRiskNote \? 'proposal-confirm-risk-note' : undefined\}/,
  );
  assert.match(dialog, /const showRiskNote = proposal\.riskScore >= 70;/);
  assert.match(dialog, /\{showRiskNote && \(/);
  assert.match(dialog, /id="proposal-confirm-risk-note"/);
});

test('proposal queue sorting is keyboard operable with exposed sort state', () => {
  const queue = source('src/features/approvals/components/ProposalQueue.tsx');

  assert.match(queue, /aria-sort=\{ariaSort\}/);
  assert.match(queue, /<button\s+type="button"\s+onClick=\{header\.column\.getToggleSortingHandler\(\)\}/);
  assert.match(queue, /focus-visible:ring-ring/);
  assert.match(queue, /<caption className="sr-only">/);
});

test('status tabs implement arrow, Home and End keyboard navigation', () => {
  const workflow = source('src/features/proposals/ProposalReviewWorkflow.tsx');

  assert.match(workflow, /onKeyDown=\{\(event\) => handleStatusTabKeyDown\(event, status\)\}/);
  assert.match(workflow, /case 'ArrowRight':/);
  assert.match(workflow, /case 'ArrowLeft':/);
  assert.match(workflow, /case 'Home':/);
  assert.match(workflow, /case 'End':/);
  assert.match(workflow, /tabIndex=\{status === tabStopStatus \? 0 : -1\}/);
});

test('approval decisions are announced from a region mounted outside the dialog', () => {
  const card = source('src/features/approvals/ProposalReviewCard.tsx');
  const detail = source('src/app/(dashboard)/approvals/[id]/page.tsx');

  assert.match(card, /<ApprovalStatusLiveRegion message=\{decisionAnnouncement\} \/>/);
  assert.match(card, /assertive/);
  assert.match(detail, /<ApprovalStatusLiveRegion message=\{decisionAnnouncement\} \/>/);
});

test('modal panels keep a token-based visible focus ring', () => {
  for (const relativePath of [
    'src/components/ui/dialog.tsx',
    'src/components/approval-modal.tsx',
    'src/features/approvals/components/ProposalDetailDrawer.tsx',
  ]) {
    const markup = source(relativePath);
    assert.match(markup, /focus-visible:ring-ring/, relativePath);
  }
});
