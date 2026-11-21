import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  METER_STACK_MAX_WIDTH,
  meterDensityFor,
  meterPercentLabel,
} from './meterLayout';

describe('Budget consumption meter layout (#496)', () => {
  test('narrow meter cards stack the gauge above the details', () => {
    assert.equal(meterDensityFor(200), 'compact');
    assert.equal(meterDensityFor(240), 'compact');
    assert.equal(meterDensityFor(METER_STACK_MAX_WIDTH - 1), 'compact');
  });

  test('measured inline cards keep the side-by-side layout', () => {
    assert.equal(meterDensityFor(METER_STACK_MAX_WIDTH), 'comfortable');
    assert.equal(meterDensityFor(282), 'comfortable');
    assert.equal(meterDensityFor(348), 'comfortable');
    assert.equal(meterDensityFor(480), 'comfortable');
    assert.equal(meterDensityFor(1184), 'comfortable');
  });

  test('unmeasured widths default to the inline layout (no hydration flip)', () => {
    assert.equal(meterDensityFor(null), 'comfortable');
    assert.equal(meterDensityFor(undefined), 'comfortable');
    assert.equal(meterDensityFor(0), 'comfortable');
    assert.equal(meterDensityFor(Number.NaN), 'comfortable');
  });

  test('gauge percentage is clamped and rounded for the SVG label', () => {
    assert.equal(meterPercentLabel(0), '0%');
    assert.equal(meterPercentLabel(71.6), '72%');
    assert.equal(meterPercentLabel(100), '100%');
    assert.equal(meterPercentLabel(142.4), '100%');
    assert.equal(meterPercentLabel(-18), '0%');
    assert.equal(meterPercentLabel(Number.NaN), '0%');
    assert.equal(meterPercentLabel(null), '0%');
    assert.equal(meterPercentLabel(undefined), '0%');
  });
});
