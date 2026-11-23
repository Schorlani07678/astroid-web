import assert from 'node:assert/strict';
import test from 'node:test';
import { AstroidApiError } from '../services/errors';
import {
  formatQueryKey,
  getQueryErrorMessage,
  isRetryableQueryError,
} from './query-error-handling';

test('isRetryableQueryError never retries in mock mode to prevent refetch loops', () => {
  // In default mock mode (NEXT_PUBLIC_API_URL unset), errors must fail fast
  assert.equal(
    isRetryableQueryError(new AstroidApiError('SERVER_ERROR', 'Internal error'), true),
    false,
  );
  assert.equal(isRetryableQueryError(new TypeError('Failed to fetch'), true), false);
});

test('isRetryableQueryError ignores client-side 4xx errors in live mode', () => {
  assert.equal(
    isRetryableQueryError(new AstroidApiError('NOT_FOUND', 'Record not found'), false),
    false,
  );
  assert.equal(
    isRetryableQueryError(
      new AstroidApiError('BAD_REQUEST', 'Invalid parameters'),
      false,
    ),
    false,
  );
  assert.equal(
    isRetryableQueryError(new AstroidApiError('UNAUTHORIZED', 'Missing token'), false),
    false,
  );
  assert.equal(
    isRetryableQueryError(new AstroidApiError('FORBIDDEN', 'Access denied'), false),
    false,
  );
  assert.equal(
    isRetryableQueryError({ status: 404, message: 'Not found' }, false),
    false,
  );
  assert.equal(
    isRetryableQueryError({ statusCode: 400, message: 'Bad request' }, false),
    false,
  );
});

test('isRetryableQueryError retries transient 5xx, network, and rate limit errors in live mode', () => {
  assert.equal(
    isRetryableQueryError(new AstroidApiError('SERVER_ERROR', 'Internal error'), false),
    true,
  );
  assert.equal(
    isRetryableQueryError(
      new AstroidApiError('RATE_LIMIT', 'Too many requests'),
      false,
    ),
    true,
  );
  assert.equal(
    isRetryableQueryError(
      new AstroidApiError('BAD_GATEWAY', 'Upstream timeout'),
      false,
    ),
    true,
  );
  assert.equal(isRetryableQueryError(new TypeError('Failed to fetch'), false), true);
  assert.equal(
    isRetryableQueryError({ status: 503, message: 'Service Unavailable' }, false),
    true,
  );
  assert.equal(
    isRetryableQueryError({ status: 429, message: 'Too Many Requests' }, false),
    true,
  );
});

test('getQueryErrorMessage extracts readable user message', () => {
  assert.equal(
    getQueryErrorMessage(new AstroidApiError('SERVER_ERROR', 'Database unavailable')),
    'Database unavailable',
  );
  assert.equal(
    getQueryErrorMessage(new TypeError('Failed to fetch')),
    'Cannot reach the Astroid API. Check your connection and try again.',
  );
  assert.equal(
    getQueryErrorMessage(new Error('Custom error message')),
    'Custom error message',
  );
  assert.equal(
    getQueryErrorMessage(null),
    'Something went wrong while loading this data.',
  );
});

test('formatQueryKey creates slash-separated key strings', () => {
  assert.equal(formatQueryKey(['agents', '123']), 'agents/123');
  assert.equal(formatQueryKey(['wallets', 'w1', 'balances']), 'wallets/w1/balances');
});
