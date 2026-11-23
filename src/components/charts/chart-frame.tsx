'use client';

import { useEffect, useState } from 'react';
import { ResponsiveContainer } from 'recharts';
import { RESPONSIVE_CHART_DEBOUNCE_MS } from '@/components/charts/responsive';
import { ChartIllustration } from '@/components/illustrations';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

/**
 * Recharts re-measures its container on every resize event. Waiting for the
 * resize to settle keeps the chart from redrawing (and jittering) on each
 * pixel of a window drag or a sidebar animation.
 */
export const RESIZE_DEBOUNCE_MS = RESPONSIVE_CHART_DEBOUNCE_MS;

/** True after the first client render. Charts measure the DOM, so they skip server rendering. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

export interface ChartFrameProps {
  /** Accessible name of the chart. */
  label: string;
  /** Height in px or any CSS length. Ignored when `aspect` is set. Default 260. */
  height?: number | string;
  /**
   * Width-to-height ratio. When set the height follows the width, so the chart
   * keeps its proportions instead of overflowing on a narrow viewport.
   */
  aspect?: number;
  /** Never shrink below this height, in px. */
  minHeight?: number;
  /** The data has not arrived yet. */
  loading?: boolean;
  /** There is nothing to plot; shows `emptyTitle` instead of empty axes. */
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  /** A single Recharts chart. */
  children: React.ReactElement;
}

const cssHeight = (height: number | string) => (typeof height === 'number' ? `${height}px` : height);

/**
 * The one wrapper every dashboard chart goes through: a responsive container
 * that fills its parent's width (with a debounced resize), plus the states a
 * chart needs besides the happy path: a skeleton while loading and an empty
 * state when the data set is empty.
 */
export function ChartFrame({
  label,
  height = 260,
  aspect,
  minHeight,
  loading = false,
  empty = false,
  emptyTitle = 'No data to chart yet',
  emptyDescription = 'This chart fills in as soon as there is activity to show.',
  className,
  children,
}: ChartFrameProps) {
  const mounted = useMounted();
  const boxHeight = aspect ? undefined : cssHeight(height);

  if (!mounted || loading) {
    return (
      <div
        className={cn('skeleton w-full rounded-md', className)}
        style={{ height: boxHeight, minHeight, aspectRatio: aspect ? String(aspect) : undefined }}
        aria-hidden
      />
    );
  }

  if (empty) {
    return (
      <div
        className={cn('flex w-full items-center justify-center', className)}
        style={{ minHeight: boxHeight ?? minHeight }}
        role="status"
        aria-label={`${label}: no data`}
      >
        <EmptyState
          compact
          className="w-full"
          illustration={<ChartIllustration />}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>
    );
  }

  return (
    <div
      className={cn('w-full min-w-0', className)}
      style={{ height: boxHeight }}
      role="group"
      aria-label={label}
    >
      <ResponsiveContainer
        width="100%"
        height={aspect ? undefined : '100%'}
        aspect={aspect}
        minHeight={minHeight}
        debounce={RESIZE_DEBOUNCE_MS}
      >
        {children}
      </ResponsiveContainer>
    </div>
  );
}
