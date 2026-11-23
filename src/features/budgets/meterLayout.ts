/**
 * Pure layout decisions for the budget consumption meters (#496).
 *
 * The meters sit in a responsive grid, so the same card can be ~300px wide
 * (single column on a phone), ~320px (two columns on a small tablet) or the
 * full row on a large screen. Below {@link METER_STACK_MAX_WIDTH} the gauge
 * and the figures cannot share a row without squeezing the labels and badges,
 * so the card stacks them and the details take the full width.
 */

/** Measured card widths below this stack the gauge above the details. */
export const METER_STACK_MAX_WIDTH = 260;

export type MeterDensity = 'comfortable' | 'compact';

/** `compact` for narrow cards, `comfortable` once the gauge can sit inline. */
export function meterDensityFor(width: number | null | undefined): MeterDensity {
  if (
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width > 0 &&
    width < METER_STACK_MAX_WIDTH
  ) {
    return 'compact';
  }
  return 'comfortable';
}

/** Gauge label: an integer 0–100%, or `0%` for missing/non-finite input. */
export function meterPercentLabel(percent: number | null | undefined): string {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return '0%';
  return `${Math.min(100, Math.max(0, Math.round(percent)))}%`;
}
