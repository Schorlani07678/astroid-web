/**
 * Shared responsive sizing for the Recharts widgets.
 *
 * Recharts measures its parent element, so every chart needs (a) a parent with
 * an explicit height, (b) a debounced resize pass so a window drag or sidebar
 * animation does not re-render the plot on every pixel, and (c) smaller
 * axis/legend metrics once the container is narrower than a phone. These pure
 * helpers keep that contract identical across the budget and analytics widgets
 * and make it unit-testable without a DOM.
 */

/** Containers narrower than this are treated as compact (mobile) charts. */
export const COMPACT_CHART_MAX_WIDTH = 480;

/** Recharts resize debounce shared by every chart wrapper. */
export const RESPONSIVE_CHART_DEBOUNCE_MS = 120;

export interface ChartMargins {
  top: number;
  right: number;
  left: number;
  bottom: number;
}

export const DEFAULT_CHART_MARGINS: ChartMargins = {
  top: 8,
  right: 12,
  left: 0,
  bottom: 0,
};

export interface ResponsiveContainerProps {
  width: '100%';
  height: '100%';
  debounce: number;
  minWidth: number;
}

/**
 * Props that make a `ResponsiveContainer` fill an explicitly sized parent
 * without overflowing its grid column (`minWidth: 0`) or re-measuring on every
 * resize frame (`debounce`).
 */
export function responsiveContainerProps(
  debounce: number = RESPONSIVE_CHART_DEBOUNCE_MS,
): ResponsiveContainerProps {
  return { width: '100%', height: '100%', debounce, minWidth: 0 };
}

/** True when a measured container is narrow enough to need compact chart metrics. */
export function isCompactChartWidth(width: number | null | undefined): boolean {
  return (
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width > 0 &&
    width < COMPACT_CHART_MAX_WIDTH
  );
}

/** Tighter plot margins on mobile so the axes keep their room. */
export function chartMarginsFor(
  width: number | null | undefined,
  base: ChartMargins = DEFAULT_CHART_MARGINS,
): ChartMargins {
  if (!isCompactChartWidth(width)) return { ...base };
  return {
    top: base.top,
    right: Math.min(base.right, 8),
    left: base.left,
    bottom: Math.max(base.bottom, 4),
  };
}

/** Axis tick font size — one step smaller on compact charts. */
export function chartTickFontSize(width: number | null | undefined): number {
  return isCompactChartWidth(width) ? 10 : 11;
}

/** Reserve less horizontal space for the value axis on compact charts. */
export function chartYAxisWidth(
  width: number | null | undefined,
  fullWidth: number,
): number {
  return isCompactChartWidth(width)
    ? Math.max(36, Math.round(fullWidth * 0.68))
    : fullWidth;
}

/** Shorten category labels so they never overlap on a narrow axis. */
export function shortenAxisLabel(value: string, maxChars = 14): string {
  if (maxChars <= 0 || value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 1))}…`;
}

export interface ChartLegendMetrics {
  fontSize: number;
  paddingTop: number;
  iconSize: number;
}

/** Legend metrics that fit under the plot without pushing it out of the card. */
export function chartLegendMetrics(
  width: number | null | undefined,
): ChartLegendMetrics {
  const compact = isCompactChartWidth(width);
  return {
    fontSize: compact ? 10 : 11,
    paddingTop: compact ? 8 : 10,
    iconSize: compact ? 8 : 10,
  };
}
