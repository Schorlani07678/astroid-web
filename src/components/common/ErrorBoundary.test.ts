import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import * as React from 'react';
import { createElement, type ErrorInfo, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorBoundary, redactSensitive } from './ErrorBoundary';

// The test runner compiles the component's JSX with the classic runtime
// (`React.createElement`), so React has to be in scope while rendering.
(globalThis as { React?: typeof React }).React = React;

/**
 * React's server renderer never runs error boundaries, so these tests drive the
 * boundary through the same lifecycle React uses on the client:
 * `getDerivedStateFromError` -> `componentDidCatch` -> `render`.
 */

const boom = new Error('Widget exploded');

/** A boundary that has already caught `error`, as React leaves it after a throw. */
function caught(error: Error, retryToken = 0) {
  return class Caught extends ErrorBoundary {
    override state = { error, retryToken };
  };
}

function render(element: ReactNode): string {
  return renderToStaticMarkup(createElement('div', null, element));
}

describe('ErrorBoundary', () => {
  test('renders its children untouched while nothing has thrown', () => {
    const html = render(
      createElement(ErrorBoundary, { section: 'Cashflow' }, createElement('p', null, 'all good')),
    );

    assert.match(html, /all good/);
    assert.doesNotMatch(html, /failed to render/);
  });

  test('getDerivedStateFromError stores the thrown error', () => {
    assert.deepEqual(ErrorBoundary.getDerivedStateFromError(boom), { error: boom });
  });

  test('renders the fallback card with a retry button after a child throws', () => {
    const Boundary = caught(boom);
    const html = render(createElement(Boundary, { section: 'Agent monitor' }, createElement('p', null, 'child')));

    assert.match(html, /role="alert"/);
    assert.match(html, /This section failed to render/);
    assert.match(html, /Try again/);
    assert.match(html, /<button/);
    assert.doesNotMatch(html, />child</);
  });

  test('the fallback shows the error message outside production', () => {
    const Boundary = caught(boom);
    const html = render(createElement(Boundary, null, createElement('p', null, 'child')));

    assert.match(html, /Widget exploded/);
  });

  test('the fallback never prints credential-shaped text from the error', () => {
    const secret = `S${'A'.repeat(55)}`;
    const Boundary = caught(new Error(`signing with ${secret} failed`));
    const html = render(createElement(Boundary, null, createElement('p', null, 'child')));

    assert.doesNotMatch(html, new RegExp(secret));
    assert.match(html, /\[redacted stellar secret\]/);
  });

  test('compact mode uses the tighter card styling', () => {
    const Boundary = caught(boom);
    const compact = render(createElement(Boundary, { compact: true }, null));
    const full = render(createElement(Boundary, null, null));

    assert.match(compact, /gap-3 p-5/);
    assert.match(full, /gap-4 p-10/);
  });

  test('a custom fallback receives the error and a retry callback', () => {
    const Boundary = caught(boom);
    let received: { error: Error; retry: () => void } | null = null;
    const html = render(
      createElement(
        Boundary,
        {
          fallback: (error: Error, retry: () => void) => {
            received = { error, retry };
            return createElement('p', null, `custom: ${error.message}`);
          },
        },
        null,
      ),
    );

    assert.match(html, /custom: Widget exploded/);
    assert.ok(received);
    const { error, retry } = received as { error: Error; retry: () => void };
    assert.equal(error, boom);
    assert.equal(typeof retry, 'function');
  });

  test('componentDidCatch reports a redacted message and calls onError', () => {
    const calls: Array<{ error: Error; info: ErrorInfo }> = [];
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    };

    try {
      const boundary = new ErrorBoundary({
        children: null,
        section: 'Wallet feed',
        onError: (error, info) => calls.push({ error, info }),
      });
      const info = { componentStack: '\n at Feed' } as ErrorInfo;
      boundary.componentDidCatch(new Error('apiKey=sk-live-abcdef123456'), info);

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.info, info);
    } finally {
      console.error = original;
    }

    assert.equal(logged.length, 1);
    assert.match(logged[0] ?? '', /\[ErrorBoundary: Wallet feed\]/);
    assert.doesNotMatch(logged[0] ?? '', /sk-live-abcdef123456/);
  });

  test('retry clears the error, remounts the subtree and runs onReset', () => {
    let resets = 0;
    const boundary = new ErrorBoundary({ children: null, onReset: () => (resets += 1) });
    let updater: ((prev: { error: Error | null; retryToken: number }) => unknown) | undefined;
    boundary.setState = ((next: unknown) => {
      updater = next as typeof updater;
    }) as typeof boundary.setState;

    (boundary as unknown as { retry: () => void }).retry();

    assert.equal(resets, 1);
    assert.deepEqual(updater?.({ error: boom, retryToken: 2 }), { error: null, retryToken: 3 });
  });

  test('changing resetKey while errored triggers a retry', () => {
    let resets = 0;
    const boundary = new ErrorBoundary({ children: null, resetKey: 1, onReset: () => (resets += 1) });
    boundary.setState = (() => undefined) as typeof boundary.setState;
    boundary.state = { error: boom, retryToken: 0 };

    boundary.componentDidUpdate({ children: null, resetKey: 1 });
    assert.equal(resets, 0);

    boundary.props = { children: null, resetKey: 2, onReset: () => (resets += 1) };
    boundary.componentDidUpdate({ children: null, resetKey: 1 });
    assert.equal(resets, 1);
  });

  test('changing resetKey while healthy does nothing', () => {
    let resets = 0;
    const boundary = new ErrorBoundary({ children: null, resetKey: 2, onReset: () => (resets += 1) });
    boundary.setState = (() => undefined) as typeof boundary.setState;

    boundary.componentDidUpdate({ children: null, resetKey: 1 });

    assert.equal(resets, 0);
  });
});

describe('redactSensitive', () => {
  test('masks stellar secrets, bearer tokens and key=value payloads', () => {
    assert.equal(redactSensitive(`key ${'S'}${'B'.repeat(55)}`), 'key [redacted stellar secret]');
    assert.equal(redactSensitive('Authorization: Bearer abc.def-123'), 'Authorization: Bearer [redacted]');
    assert.equal(redactSensitive('password=hunter2 ok'), 'password=[redacted] ok');
    assert.equal(redactSensitive('GET /x?token=abc123&page=2'), 'GET /x?token=[redacted]&page=2');
  });

  test('leaves ordinary text alone', () => {
    assert.equal(redactSensitive('Network request failed (503)'), 'Network request failed (503)');
  });
});
