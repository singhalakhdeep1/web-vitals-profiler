/** Monitoring, alerting, scoring, A/B comparison, analytics and cohorts over stored samples. */
import { percentile } from "@wvp/wasm";
import { anomalies, summarize, welchTTest } from "./statistics";
import { METRICS, THRESHOLDS, metricScore, rate, type Metric, type Rating } from "./thresholds";

/** A stored sample, as the API keeps them. */
export interface Sample {
  name: Metric;
  value: number;
  timestamp: number;
  url?: string;
  device?: string;
  browser?: string;
  connection?: string;
  country?: string;
  sessionId?: string;
}

const DAY = 86_400_000;

/* ------------------------------------------------------------ monitoring */

export interface Regression {
  metric: Metric;
  previous: number;
  current: number;
  changePercent: number;
  regressed: boolean;
  severity: "none" | "minor" | "major";
}

export class MonitoringService {
  /** p75 of the last `recentDays` against p75 of the `baselineDays` before them. */
  checkForRegressions(samples: Sample[], now = Date.now(), recentDays = 7, baselineDays = 28): Regression[] {
    const out: Regression[] = [];
    for (const metric of METRICS) {
      const of = samples.filter((s) => s.name === metric);
      const recent = of.filter((s) => s.timestamp >= now - recentDays * DAY).map((s) => s.value);
      const base = of.filter((s) => s.timestamp < now - recentDays * DAY && s.timestamp >= now - (recentDays + baselineDays) * DAY).map((s) => s.value);
      if (recent.length < 3 || base.length < 3) continue;
      const current = percentile(recent, 75);
      const previous = percentile(base, 75);
      const changePercent = previous === 0 ? 0 : Math.round(((current - previous) / previous) * 1000) / 10;
      const severity = changePercent >= 25 ? "major" : changePercent >= 10 ? "minor" : "none";
      out.push({ metric, previous, current, changePercent, regressed: severity !== "none", severity });
    }
    return out;
  }

  /** Daily p75 for one metric over the last `days`. */
  dailyTrend(samples: Sample[], metric: Metric, days: number, now = Date.now()): { date: string; value: number; count: number }[] {
    const start = now - days * DAY;
    const byDay = new Map<string, number[]>();
    for (const s of samples) {
      if (s.name !== metric || s.timestamp < start) continue;
      const day = new Date(s.timestamp).toISOString().slice(0, 10);
      (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(s.value);
    }
    return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, value: percentile(values, 75), count: values.length }));
  }

  detectAnomalies(trend: { date: string; value: number }[], zLimit = 2): { date: string; value: number; z: number }[] {
    return anomalies(trend, zLimit);
  }
}

/* ---------------------------------------------------------------- alerts */

export interface AlertRuleDef {
  metric: Metric | "FID";
  condition: "above" | "below";
  threshold: number;
}

export class AlertService {
  evaluateRule(rule: AlertRuleDef, value: number): boolean {
    return rule.condition === "above" ? value > rule.threshold : value < rule.threshold;
  }

  /** The p75 of incoming values for the rule's metric (FID maps to INP, its replacement). */
  observedValue(rule: AlertRuleDef, samples: Sample[]): number | null {
    const metric = rule.metric === "FID" ? "INP" : rule.metric;
    const values = samples.filter((s) => s.name === metric).map((s) => s.value);
    return values.length ? percentile(values, 75) : null;
  }
}

/* --------------------------------------------------------------- scoring */

export interface ScoreWeights {
  speed: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

export interface ScoreBreakdown {
  category: string;
  weight: number;
  score: number;
  /** Points this category takes off the overall score (weight * (100 - score) / 100). */
  impact: number;
  details: string[];
}

export interface LabScores {
  performance: number;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  opportunities?: { title: string; savingsMs: number }[];
}

/**
 * Overall score from lab categories (Lighthouse) and field data (p75 of real visits). The speed category blends the
 * Lighthouse performance score with the field Core Web Vitals scores when field data exists.
 */
export function calculateScore(weights: ScoreWeights, lab: LabScores | null, fieldP75: Partial<Record<Metric, number>>): { overallScore: number; breakdown: ScoreBreakdown[] } {
  const fieldMetrics = (["LCP", "CLS", "INP"] as Metric[]).filter((m) => fieldP75[m] !== undefined);
  const fieldScore = fieldMetrics.length ? Math.round(fieldMetrics.reduce((s, m) => s + metricScore(m, fieldP75[m]!), 0) / fieldMetrics.length) : null;
  const speedDetails = fieldMetrics.map((m) => `${m} p75 ${m === "CLS" ? fieldP75[m]!.toFixed(3) : `${Math.round(fieldP75[m]!)} ms`} (${rate(m, fieldP75[m]!)})`);
  if (lab) speedDetails.unshift(`Lighthouse performance ${lab.performance}`);
  for (const o of lab?.opportunities?.slice(0, 3) ?? []) speedDetails.push(`${o.title} (save ~${Math.round(o.savingsMs)} ms)`);
  const speed = lab && fieldScore !== null ? Math.round(lab.performance * 0.5 + fieldScore * 0.5) : (lab?.performance ?? fieldScore ?? 0);
  const rows: [string, number, number | null, string[]][] = [
    ["Speed", weights.speed, speed, speedDetails],
    ["Accessibility", weights.accessibility, lab?.accessibility ?? null, lab?.accessibility !== null && lab ? [`Lighthouse accessibility ${lab.accessibility}`] : ["No Lighthouse run yet"]],
    ["Best practices", weights.bestPractices, lab?.bestPractices ?? null, lab?.bestPractices !== null && lab ? [`Lighthouse best practices ${lab.bestPractices}`] : ["No Lighthouse run yet"]],
    ["SEO", weights.seo, lab?.seo ?? null, lab?.seo !== null && lab ? [`Lighthouse SEO ${lab.seo}`] : ["No Lighthouse run yet"]],
  ];
  // categories without data do not count, and the remaining weights are renormalized
  const counted = rows.filter(([, w, s]) => s !== null && w > 0);
  const totalWeight = counted.reduce((s, [, w]) => s + w, 0) || 1;
  const overallScore = Math.round(counted.reduce((s, [, w, sc]) => s + (w / totalWeight) * (sc as number), 0));
  return {
    overallScore,
    breakdown: rows.map(([category, weight, score, details]) => ({ category, weight, score: score ?? 0, impact: score === null ? 0 : Math.round(((weight / totalWeight) * (100 - score)) * 10) / 10, details })),
  };
}

/* ------------------------------------------------------------- A/B tests */

export interface ComparisonRow {
  metric: Metric;
  variantAValue: number;
  variantBValue: number;
  /** Percent change from A to B (negative = B is faster / better). */
  difference: number;
  /** Confidence that the difference is real, 0-100 (1 - p of Welch's t-test). */
  significance: number;
  winner: "A" | "B" | "tie" | "inconclusive";
  samplesA: number;
  samplesB: number;
}

/** Lower is better for every Core Web Vital. A winner needs p < 0.05 and at least 5 samples per variant. */
export function compareVariants(a: Sample[], b: Sample[]): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (const metric of METRICS) {
    const va = a.filter((s) => s.name === metric).map((s) => s.value);
    const vb = b.filter((s) => s.name === metric).map((s) => s.value);
    if (!va.length && !vb.length) continue;
    const w = welchTTest(va, vb);
    const significance = Math.round((1 - w.pValue) * 1000) / 10;
    const enough = va.length >= 5 && vb.length >= 5;
    const difference = w.meanA ? Math.round(((w.meanB - w.meanA) / w.meanA) * 1000) / 10 : 0;
    const winner = !enough ? "inconclusive" : w.pValue >= 0.05 ? "tie" : w.meanA < w.meanB ? "A" : "B";
    rows.push({ metric, variantAValue: round(w.meanA, metric), variantBValue: round(w.meanB, metric), difference, significance: enough ? significance : 0, winner, samplesA: va.length, samplesB: vb.length });
  }
  return rows;
}

const round = (v: number, m: Metric): number => (Number.isFinite(v) ? (m === "CLS" ? Math.round(v * 1000) / 1000 : Math.round(v)) : 0);

/* -------------------------------------------------------------- analytics */

export interface SegmentRow {
  segment: string;
  samples: number;
  p75: Partial<Record<Metric, number>>;
  rating: Rating;
}

export class AnalyticsService {
  /** p75 per metric for each value of a dimension (device, browser, connection, country). */
  segment(samples: Sample[], dimension: "device" | "browser" | "connection" | "country"): SegmentRow[] {
    const groups = new Map<string, Sample[]>();
    for (const s of samples) {
      const key = s[dimension] ?? "unknown";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
    }
    return [...groups].map(([segment, rows]) => {
      const p75 = p75ByMetric(rows);
      return { segment, samples: rows.length, p75, rating: overallRating(p75) };
    }).sort((a, b) => b.samples - a.samples);
  }

  /** Share of good / needs-improvement / poor samples per metric (the CrUX-style distribution). */
  distribution(samples: Sample[]): Record<string, { good: number; needsImprovement: number; poor: number }> {
    const out: Record<string, { good: number; needsImprovement: number; poor: number }> = {};
    for (const metric of METRICS) {
      const of = samples.filter((s) => s.name === metric);
      if (!of.length) continue;
      const counts = { good: 0, needsImprovement: 0, poor: 0 };
      for (const s of of) {
        const r = rate(metric, s.value);
        if (r === "good") counts.good++;
        else if (r === "needs-improvement") counts.needsImprovement++;
        else counts.poor++;
      }
      out[metric] = { good: pct(counts.good, of.length), needsImprovement: pct(counts.needsImprovement, of.length), poor: pct(counts.poor, of.length) };
    }
    return out;
  }
}

const pct = (n: number, d: number): number => Math.round((n / d) * 1000) / 10;

export function p75ByMetric(samples: Sample[]): Partial<Record<Metric, number>> {
  const out: Partial<Record<Metric, number>> = {};
  for (const metric of METRICS) {
    const values = samples.filter((s) => s.name === metric).map((s) => s.value);
    if (values.length) out[metric] = percentile(values, 75);
  }
  return out;
}

/** The worst rating among LCP, CLS and INP (how Core Web Vitals "pass" is assessed). */
export function overallRating(p75: Partial<Record<Metric, number>>): Rating {
  const ratings = (["LCP", "CLS", "INP"] as Metric[]).filter((m) => p75[m] !== undefined).map((m) => rate(m, p75[m]!));
  if (!ratings.length) return "needs-improvement";
  return ratings.includes("poor") ? "poor" : ratings.includes("needs-improvement") ? "needs-improvement" : "good";
}

/* ---------------------------------------------------------------- cohorts */

export interface Cohort {
  /** ISO week start (Monday). */
  week: string;
  samples: number;
  p75: Partial<Record<Metric, number>>;
  rating: Rating;
  goodShare: number;
}

export class CohortService {
  /** Weekly cohorts: what visits in each week experienced, so changes over releases are visible. */
  analyzePerformanceCohorts(samples: Sample[]): Cohort[] {
    const byWeek = new Map<string, Sample[]>();
    for (const s of samples) {
      const d = new Date(s.timestamp);
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
      const key = monday.toISOString().slice(0, 10);
      (byWeek.get(key) ?? byWeek.set(key, []).get(key)!).push(s);
    }
    return [...byWeek].sort(([a], [b]) => a.localeCompare(b)).map(([week, rows]) => {
      const p75 = p75ByMetric(rows);
      const lcp = rows.filter((r) => r.name === "LCP");
      return { week, samples: rows.length, p75, rating: overallRating(p75), goodShare: lcp.length ? pct(lcp.filter((r) => r.value <= THRESHOLDS.LCP.good).length, lcp.length) : 0 };
    });
  }
}

export { summarize };
