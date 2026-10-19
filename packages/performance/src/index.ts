import type { VitalMetric, VitalName } from "@wvp/types";
import { generateId } from "@wvp/utils";

/** Thresholds for Core Web Vitals ratings. */
export const VITAL_THRESHOLDS: Record<
  VitalName,
  { good: number; poor: number; unit: string }
> = {
  LCP: { good: 2500, poor: 4000, unit: "ms" },
  CLS: { good: 0.1, poor: 0.25, unit: "" },
  INP: { good: 200, poor: 500, unit: "ms" },
  TTFB: { good: 800, poor: 1800, unit: "ms" },
  FCP: { good: 1800, poor: 3000, unit: "ms" },
  TBT: { good: 200, poor: 600, unit: "ms" },
};

/** Determines the rating bucket for a given vital metric value. */
export function getVitalRating(
  name: VitalName,
  value: number,
): "good" | "needs-improvement" | "poor" {
  const threshold = VITAL_THRESHOLDS[name];
  if (value <= threshold.good) return "good";
  if (value <= threshold.poor) return "needs-improvement";
  return "poor";
}

/** Creates a VitalMetric object from raw measurement data. */
export function createVitalMetric(
  name: VitalName,
  value: number,
  url: string,
  navigationType = "navigate",
): VitalMetric {
  return {
    name,
    value,
    rating: getVitalRating(name, value),
    delta: value,
    id: generateId(),
    navigationType,
    timestamp: Date.now(),
    url,
  };
}

/** Formats a vital value for display. */
export function formatVitalValue(name: VitalName, value: number): string {
  if (name === "CLS") return value.toFixed(3);
  return `${Math.round(value)}ms`;
}

/** Maps web-vitals metric name to our VitalName type. */
export function mapWebVitalName(name: string): VitalName | null {
  const map: Record<string, VitalName> = {
    LCP: "LCP",
    CLS: "CLS",
    INP: "INP",
    TTFB: "TTFB",
    FCP: "FCP",
  };
  return map[name] ?? null;
}

/** Converts a web-vitals Metric to our VitalMetric format. */
export function fromWebVitalMetric(
  metric: { name: string; value: number; delta: number; id: string; navigationType: string; rating?: string },
  url: string,
): VitalMetric | null {
  const name = mapWebVitalName(metric.name);
  if (!name) return null;
  return {
    name,
    value: metric.value,
    rating: (metric.rating as VitalMetric["rating"]) ?? getVitalRating(name, metric.value),
    delta: metric.delta,
    id: metric.id || generateId(),
    navigationType: metric.navigationType,
    timestamp: Date.now(),
    url,
  };
}

/** Initializes TBT measurement via PerformanceObserver for long tasks. */
export function initTBTObserver(onMetric: (metric: VitalMetric) => void, url: string): () => void {
  if (!("PerformanceObserver" in window)) return () => {};

  let totalBlockingTime = 0;
  // one id per page load: every update replaces the previous TBT value instead of adding a sample
  const id = `tbt-${Math.round(performance.timeOrigin)}-${Math.random().toString(36).slice(2, 8)}`;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > 50) {
        totalBlockingTime += entry.duration - 50;
      }
    }
    onMetric({ ...createVitalMetric("TBT", totalBlockingTime, url), id });
  });

  try {
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    return () => {};
  }

  return () => observer.disconnect();
}
