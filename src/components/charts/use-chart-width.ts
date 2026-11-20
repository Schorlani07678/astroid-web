'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Observes the rendered width of a chart's parent box.
 *
 * Recharts only re-measures on container resizes, but axis ticks, legend
 * placement and margins need the measured width too. Reading it through a
 * `ResizeObserver` (with a `resize` fallback) keeps those decisions in sync
 * with the same box the plot is drawn into, so a sidebar animation or device
 * rotation never leaves labels overlapping.
 */
export function useChartWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const next = element.getBoundingClientRect().width;
      setWidth((current) => (next > 0 && next !== current ? next : current));
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width } as const;
}
