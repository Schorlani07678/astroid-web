import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SIDEBAR_BREAKPOINT_PX, SIDEBAR_DESKTOP_QUERY } from './nav-breakpoint';

const shell = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), 'src/components/shell', file), 'utf8');

test('the sidebar collapses into the drawer below 768px', () => {
  assert.equal(SIDEBAR_BREAKPOINT_PX, 768);
  assert.equal(SIDEBAR_DESKTOP_QUERY, '(min-width: 768px)');
});

test('the hamburger, the drawer and the pinned sidebar all switch at the same breakpoint', () => {
  // Tailwind's `md` is 768px, so these must all use `md:` and never `lg:`.
  assert.match(shell('topbar.tsx'), /hover:text-foreground md:hidden/);
  assert.match(shell('mobile-nav.tsx'), /<div className="md:hidden">/);
  assert.match(shell('desktop-sidebar.tsx'), /bg-surface md:flex/);
  assert.doesNotMatch(shell('mobile-nav.tsx'), /lg:hidden/);
  assert.doesNotMatch(shell('desktop-sidebar.tsx'), /lg:flex/);
});

test('the drawer reads its auto-close query from the shared constant', () => {
  const source = shell('mobile-nav.tsx');
  assert.match(source, /SIDEBAR_DESKTOP_QUERY/);
  assert.doesNotMatch(source, /1024px/);
});
