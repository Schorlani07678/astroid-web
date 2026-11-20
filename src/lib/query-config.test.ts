import assert from 'node:assert/strict';
import test from 'node:test';
import {
  POLL_INTERVALS,
  QUERY_CACHE,
  backoffDelay,
  createBackoffRefetchInterval,
} from './query-config';

test('cache presets keep gcTime above staleTime so navigation reuses the cache', () => {
  for (const preset of Object.values(QUERY_CACHE)) {
    assert.ok(preset.staleTime > 0);
    assert.ok(preset.gcTime > preset.staleTime);
  }
  assert.ok(QUERY_CACHE.live.gcTime > POLL_INTERVALS.balances);
  assert.ok(QUERY_CACHE.static.staleTime > QUERY_CACHE.entity.staleTime);
});

test('backoff starts at the base interval and doubles per failure', () => {
  const options = { baseMs: 1_000 };
  assert.equal(backoffDelay(0, options), 1_000);
  assert.equal(backoffDelay(1, options), 2_000);
  assert.equal(backoffDelay(2, options), 4_000);
  assert.equal(backoffDelay(3, options), 8_000);
});

test('backoff is capped at maxMs (default 8x base)', () => {
  assert.equal(backoffDelay(10, { baseMs: 1_000 }), 8_000);
  assert.equal(backoffDelay(10, { baseMs: 1_000, maxMs: 5_000 }), 5_000);
  assert.equal(backoffDelay(1_000_000, { baseMs: 1_000 }), 8_000);
});

test('backoff honours a custom factor and tolerates bad failure counts', () => {
  assert.equal(backoffDelay(2, { baseMs: 100, factor: 3, maxMs: 10_000 }), 900);
  assert.equal(backoffDelay(-4, { baseMs: 100 }), 100);
  assert.equal(backoffDelay(Number.NaN, { baseMs: 100 }), 100);
  assert.equal(backoffDelay(2.9, { baseMs: 100 }), 400);
});

test('refetch interval callback follows the query failure count and resets on success', () => {
  const interval = createBackoffRefetchInterval({ baseMs: 30_000 });

  assert.equal(interval({ state: { fetchFailureCount: 0 } }), 30_000);
  assert.equal(interval({ state: { fetchFailureCount: 2 } }), 120_000);
  assert.equal(interval({ state: { fetchFailureCount: 9 } }), 240_000);
  assert.equal(interval({ state: { fetchFailureCount: 0 } }), 30_000);
});
