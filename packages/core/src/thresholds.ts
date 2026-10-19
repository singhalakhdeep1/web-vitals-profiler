/** Core Web Vitals thresholds (web.dev) and rating helpers shared by the API, the extension and reports. */

export type Metric = "LCP" | "CLS" | "INP" | "FCP" | "TTFB" | "TBT";
export type Rating = "good" | "needs-improvement" | "poor";

export const METRICS: Metric[] = ["LCP", "CLS", "INP", "FCP", "TTFB", "TBT"];

/** [good upper bound, needs-improvement upper bound]. CLS is unitless; the rest are milliseconds. */
export const THRESHOLDS: Record<Metric, { good: number; needsImprovement: number }> = {
  LCP: { good: 2500, needsImprovement: 4000 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  INP: { good: 200, needsImprovement: 500 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
  TBT: { good: 200, needsImprovement: 600 },
};

export const isMetric = (v: unknown): v is Metric => typeof v === "string" && (METRICS as string[]).includes(v);

export function rate(metric: Metric, value: number): Rating {
  const t = THRESHOLDS[metric];
  return value <= t.good ? "good" : value <= t.needsImprovement ? "needs-improvement" : "poor";
}

export function formatMetric(metric: Metric, value: number): string {
  if (!Number.isFinite(value)) return "—";
  return metric === "CLS" ? value.toFixed(3) : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

/** 0-100 score for one metric on Lighthouse's log-normal-ish curve: 90 at "good", 50 at "needs improvement". */
export function metricScore(metric: Metric, value: number): number {
  const { good, needsImprovement } = THRESHOLDS[metric];
  if (value <= 0) return 100;
  // piecewise linear in log space between the anchors (good -> 90, ni -> 50), clamped
  const lg = Math.log(good);
  const ln = Math.log(needsImprovement);
  const lv = Math.log(value);
  const s = 90 - ((lv - lg) / (ln - lg)) * 40;
  return Math.round(Math.max(0, Math.min(100, s)));
}
