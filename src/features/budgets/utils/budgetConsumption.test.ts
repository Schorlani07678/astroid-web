import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeBudgetConsumption,
  getConsumptionLevel,
  normalizeThresholds,
} from './budgetConsumption';

test('consumption stays healthy below the 80% warning threshold', () => {
  const result = computeBudgetConsumption(1000, 799);
  assert.equal(result.level, 'healthy');
  assert.equal(result.remaining, 201);
});

test('consumption switches to warning at exactly 80%', () => {
  assert.equal(computeBudgetConsumption(1000, 800).level, 'warning');
  assert.equal(computeBudgetConsumption(1000, 949).level, 'warning');
});

test('consumption switches to critical at exactly 95%', () => {
  assert.equal(computeBudgetConsumption(1000, 950).level, 'critical');
  assert.equal(computeBudgetConsumption(1000, 1000).level, 'critical');
});

test('overspend is reported as exceeded with a clamped display percent', () => {
  const result = computeBudgetConsumption(1000, 1250);
  assert.equal(result.level, 'exceeded');
  assert.equal(result.percent, 125);
  assert.equal(result.displayPercent, 100);
  assert.equal(result.remaining, 0);
  assert.equal(result.overspend, 250);
});

test('custom thresholds move the state boundaries', () => {
  assert.equal(computeBudgetConsumption(100, 60, { warning: 50, critical: 75 }).level, 'warning');
  assert.equal(computeBudgetConsumption(100, 75, { warning: 50, critical: 75 }).level, 'critical');
});

test('invalid thresholds are clamped and reordered', () => {
  assert.deepEqual(normalizeThresholds({ warning: 97, critical: 85 }), { warning: 85, critical: 97 });
  assert.deepEqual(normalizeThresholds({ warning: -10, critical: 400 }), { warning: 0, critical: 100 });
  assert.deepEqual(normalizeThresholds({ warning: Number.NaN }), { warning: 80, critical: 95 });
});

test('zero, negative and non-finite inputs never produce NaN', () => {
  const empty = computeBudgetConsumption(0, 0);
  assert.equal(empty.displayPercent, 0);
  assert.equal(empty.level, 'healthy');

  const zeroBudgetSpend = computeBudgetConsumption(0, 10);
  assert.equal(zeroBudgetSpend.level, 'exceeded');
  assert.equal(zeroBudgetSpend.displayPercent, 100);

  const garbage = computeBudgetConsumption(Number.NaN, -50);
  assert.equal(garbage.displayPercent, 0);
  assert.equal(garbage.level, 'healthy');
});

test('getConsumptionLevel uses default thresholds when none are given', () => {
  assert.equal(getConsumptionLevel(79.9), 'healthy');
  assert.equal(getConsumptionLevel(80), 'warning');
  assert.equal(getConsumptionLevel(95), 'critical');
  assert.equal(getConsumptionLevel(100.1), 'exceeded');
});
