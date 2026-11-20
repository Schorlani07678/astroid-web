import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  COMPACT_CHART_MAX_WIDTH,
  RESPONSIVE_CHART_DEBOUNCE_MS,
  chartLegendMetrics,
  chartMarginsFor,
  chartTickFontSize,
  chartYAxisWidth,
  isCompactChartWidth,
  responsiveContainerProps,
  shortenAxisLabel,
} from './responsive';

describe('Recharts responsive helpers (#544)', () => {
  test('containers fill their sized parent with a debounced resize', () => {
    const props = responsiveContainerProps();
    assert.equal(props.width, '100%');
    assert.equal(props.height, '100%');
    assert.equal(props.minWidth, 0);
    assert.equal(props.debounce, RESPONSIVE_CHART_DEBOUNCE_MS);
    assert.ok(props.debounce >= 80, 'debounce prevents resize thrash');
    assert.equal(responsiveContainerProps(80).debounce, 80);
  });

  test('compact detection ignores unmeasured and wide containers', () => {
    assert.equal(isCompactChartWidth(null), false);
    assert.equal(isCompactChartWidth(undefined), false);
    assert.equal(isCompactChartWidth(0), false);
    assert.equal(isCompactChartWidth(Number.NaN), false);
    assert.equal(isCompactChartWidth(COMPACT_CHART_MAX_WIDTH - 1), true);
    assert.equal(isCompactChartWidth(COMPACT_CHART_MAX_WIDTH), false);
    assert.equal(isCompactChartWidth(1280), false);
  });

  test('compact margins tighten the right edge and keep the axes visible', () => {
    const desktop = chartMarginsFor(1280);
    assert.deepEqual(desktop, { top: 8, right: 12, left: 0, bottom: 0 });

    const mobile = chartMarginsFor(320);
    assert.equal(mobile.right, 8);
    assert.equal(mobile.left, 0);
    assert.ok(mobile.bottom >= 4);
    assert.ok(mobile.right < desktop.right);
    assert.equal(mobile.top, desktop.top);
  });

  test('axis tick font and value-axis width shrink on mobile', () => {
    assert.equal(chartTickFontSize(null), 11);
    assert.equal(chartTickFontSize(1024), 11);
    assert.equal(chartTickFontSize(360), 10);

    assert.equal(chartYAxisWidth(1024, 56), 56);
    assert.equal(chartYAxisWidth(null, 56), 56);
    const compactYAxis = chartYAxisWidth(360, 56);
    assert.ok(compactYAxis < 56);
    assert.ok(compactYAxis >= 36);
  });

  test('legend metrics stay small enough for a phone card', () => {
    const wide = chartLegendMetrics(900);
    const narrow = chartLegendMetrics(375);
    assert.ok(narrow.fontSize < wide.fontSize);
    assert.ok(narrow.paddingTop <= wide.paddingTop);
    assert.ok(narrow.iconSize <= wide.iconSize);
  });

  test('long axis labels are shortened but short ones are preserved', () => {
    assert.equal(shortenAxisLabel('R&D AI Cluster'), 'R&D AI Cluster');
    assert.equal(shortenAxisLabel('Treasury & Operations', 12), 'Treasury & …');
    assert.equal(shortenAxisLabel('Any label', 0), 'Any label');
    assert.ok(shortenAxisLabel('A very long department name', 10).length <= 10);
  });
});
