'use client';

import type { ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';

import { RESPONSIVE_CHART_DEBOUNCE_MS } from '@/components/charts/responsive';
import { cn } from '@/lib/cn';

interface BudgetChartWrapperProps {
  children: ReactElement;
  className?: string;
  height?: number | string;
  aspectRatio?: number;
  minHeight?: number;
}

/** Constrains chart sizing and lets Recharts observe responsive parent changes. */
export function BudgetChartWrapper({
  children,
  className,
  height,
  aspectRatio = 1.6,
  minHeight = 160,
}: BudgetChartWrapperProps) {
  return (
    <div
      className={cn('w-full min-w-0', className)}
      style={
        height !== undefined
          ? { height }
          : { aspectRatio, minHeight }
      }
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minHeight={minHeight}
        minWidth={0}
        debounce={RESPONSIVE_CHART_DEBOUNCE_MS}
      >
        {children}
      </ResponsiveContainer>
    </div>
  );
}