/** Report generation: a report model built from samples, rendered with a template to JSON, CSV or HTML. */
import { summarize } from "@wvp/wasm";
import type { Recommendation } from "./analysis";
import { AnalyticsService, CohortService, MonitoringService, overallRating, p75ByMetric, type Cohort, type Regression, type Sample, type SegmentRow } from "./monitoring";
import { METRICS, THRESHOLDS, formatMetric, rate, type Metric, type Rating } from "./thresholds";

export type SectionId = "summary" | "scorecard" | "metrics" | "regressions" | "trends" | "segments" | "cohorts" | "recommendations" | "lighthouse";

export interface ReportTemplate {
  id: string;
  name: string;
  /** Sections in display order. */
  sections: SectionId[];
  /** Branding for white-label reports. */
  brand?: { name?: string; color?: string };
}

export const BUILT_IN_TEMPLATES: ReportTemplate[] = [
  { id: "executive", name: "Executive summary", sections: ["summary", "scorecard", "regressions", "recommendations"] },
  { id: "technical", name: "Technical report", sections: ["summary", "metrics", "regressions", "trends", "segments", "cohorts", "recommendations", "lighthouse"] },
];

export interface MetricRow {
  metric: Metric;
  samples: number;
  p50: number;
  p75: number;
  p95: number;
  rating: Rating;
  good: number;
  needsImprovement: number;
}

export interface Report {
  title: string;
  url: string;
  template: string;
  range: { from: string; to: string; days: number };
  generatedAt: string;
  totalSamples: number;
  rating: Rating;
  summary: string;
  metrics: MetricRow[];
  regressions: Regression[];
  trends: Partial<Record<Metric, { date: string; value: number }[]>>;
  segments: { device: SegmentRow[]; browser: SegmentRow[] };
  cohorts: Cohort[];
  recommendations: Recommendation[];
  lighthouse?: { performance: number; accessibility: number | null; bestPractices: number | null; seo: number | null; fetchedAt: string };
  sections: SectionId[];
  brand?: ReportTemplate["brand"];
}

export class ReportService {
  private readonly monitoring = new MonitoringService();
  private readonly analytics = new AnalyticsService();
  private readonly cohorts = new CohortService();

  generatePerformanceReport(input: { url: string; samples: Sample[]; days: number; template: ReportTemplate; recommendations?: Recommendation[]; lighthouse?: Report["lighthouse"]; now?: number }): Report {
    const now = input.now ?? Date.now();
    // metrics, segments and cohorts cover the chosen range; regressions also look at the four weeks before it
    const samples = input.samples.filter((s) => s.timestamp >= now - input.days * 86_400_000);
    const metrics: MetricRow[] = METRICS.map((metric) => {
      const values = samples.filter((s) => s.name === metric).map((s) => s.value);
      if (!values.length) return null;
      const s = summarize(values);
      return { metric, samples: values.length, p50: s.p50, p75: s.p75, p95: s.p95, rating: rate(metric, s.p75), good: THRESHOLDS[metric].good, needsImprovement: THRESHOLDS[metric].needsImprovement };
    }).filter((r): r is MetricRow => r !== null);
    const p75 = p75ByMetric(samples);
    const rating = overallRating(p75);
    const regressions = this.monitoring.checkForRegressions(input.samples, now);
    const trends: Report["trends"] = {};
    for (const m of ["LCP", "CLS", "INP"] as Metric[]) trends[m] = this.monitoring.dailyTrend(samples, m, input.days, now);
    return {
      title: `Web Vitals report: ${input.url || "all pages"}`,
      url: input.url,
      template: input.template.id,
      range: { from: new Date(now - input.days * 86_400_000).toISOString(), to: new Date(now).toISOString(), days: input.days },
      generatedAt: new Date(now).toISOString(),
      totalSamples: samples.length,
      rating,
      summary: this.generateExecutiveSummary(metrics, regressions, rating),
      metrics,
      regressions,
      trends,
      segments: { device: this.analytics.segment(samples, "device"), browser: this.analytics.segment(samples, "browser") },
      cohorts: this.cohorts.analyzePerformanceCohorts(samples),
      recommendations: input.recommendations ?? [],
      lighthouse: input.lighthouse,
      sections: input.template.sections,
      brand: input.template.brand,
    };
  }

  generateExecutiveSummary(metrics: MetricRow[], regressions: Regression[], rating: Rating): string {
    if (!metrics.length) return "No samples were collected in this period.";
    const verdict = rating === "good" ? "passes" : "does not pass";
    const worst = [...metrics].filter((m) => m.rating !== "good").sort((a, b) => (a.rating === "poor" ? -1 : 1) - (b.rating === "poor" ? -1 : 1))[0];
    const reg = regressions.filter((r) => r.regressed);
    const parts = [`The page ${verdict} the Core Web Vitals assessment (LCP, CLS and INP at the 75th percentile).`];
    if (worst) parts.push(`${worst.metric} is the weakest metric at ${formatMetric(worst.metric, worst.p75)} (${worst.rating.replace("-", " ")}).`);
    parts.push(reg.length ? `${reg.length} metric${reg.length > 1 ? "s" : ""} regressed against the previous four weeks: ${reg.map((r) => `${r.metric} +${r.changePercent}%`).join(", ")}.` : "No regressions against the previous four weeks.");
    return parts.join(" ");
  }

  exportReport(report: Report, format: "json" | "csv" | "html"): { body: string; contentType: string; filename: string } {
    const base = `web-vitals-report-${report.generatedAt.slice(0, 10)}`;
    if (format === "csv") return { body: toCsv(report), contentType: "text/csv; charset=utf-8", filename: `${base}.csv` };
    if (format === "html") return { body: new TemplateService().render(report), contentType: "text/html; charset=utf-8", filename: `${base}.html` };
    return { body: JSON.stringify(report, null, 2), contentType: "application/json", filename: `${base}.json` };
  }
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(r: Report): string {
  const lines = [["metric", "samples", "p50", "p75", "p95", "rating", "good_threshold", "poor_threshold"].join(",")];
  for (const m of r.metrics) lines.push([m.metric, m.samples, m.p50, m.p75, m.p95, m.rating, m.good, m.needsImprovement].map(csvCell).join(","));
  lines.push("", ["metric", "date", "p75"].join(","));
  for (const [metric, rows] of Object.entries(r.trends)) for (const t of rows ?? []) lines.push([metric, t.date, t.value].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const COLOR: Record<Rating, string> = { good: "#059669", "needs-improvement": "#d97706", poor: "#dc2626" };

/** Renders a report as a standalone HTML page, one block per template section. */
export class TemplateService {
  private readonly custom = new Map<string, ReportTemplate>();

  createTemplate(template: ReportTemplate): ReportTemplate {
    this.custom.set(template.id, template);
    return template;
  }

  getTemplate(id: string): ReportTemplate | undefined {
    return this.custom.get(id) ?? BUILT_IN_TEMPLATES.find((t) => t.id === id);
  }

  render(r: Report): string {
    const brand = r.brand?.color ?? "#2563eb";
    const body = r.sections.map((s) => this.renderSection(s, r)).filter(Boolean).join("\n");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;color:#0f172a;background:#f8fafc}header{background:${esc(brand)};color:#fff;padding:24px 32px}main{padding:24px 32px;max-width:1000px}section{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:16px}h2{font-size:16px;margin:0 0 12px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #f1f5f9}.pill{display:inline-block;padding:2px 8px;border-radius:999px;color:#fff;font-size:12px}.muted{color:#64748b;font-size:13px}</style></head>
<body><header><div style="opacity:.8;font-size:13px">${esc(r.brand?.name ?? "Web Vitals Profiler")}</div><h1 style="margin:4px 0 0;font-size:22px">${esc(r.title)}</h1><div style="opacity:.85;font-size:13px">${esc(r.range.from.slice(0, 10))} – ${esc(r.range.to.slice(0, 10))} · ${r.totalSamples} samples</div></header><main>${body}</main></body></html>`;
  }

  private pill(rating: Rating): string {
    return `<span class="pill" style="background:${COLOR[rating]}">${esc(rating.replace("-", " "))}</span>`;
  }

  private renderSection(section: SectionId, r: Report): string {
    switch (section) {
      case "summary":
        return `<section><h2>Summary ${this.pill(r.rating)}</h2><p>${esc(r.summary)}</p></section>`;
      case "scorecard":
        return `<section><h2>Scorecard</h2><table><tr>${r.metrics.map((m) => `<th>${m.metric}</th>`).join("")}</tr><tr>${r.metrics.map((m) => `<td><strong>${esc(formatMetric(m.metric, m.p75))}</strong><br>${this.pill(m.rating)}</td>`).join("")}</tr></table></section>`;
      case "metrics":
        return `<section><h2>Metrics (percentiles)</h2><table><tr><th>Metric</th><th>Samples</th><th>p50</th><th>p75</th><th>p95</th><th>Rating</th></tr>${r.metrics.map((m) => `<tr><td>${m.metric}</td><td>${m.samples}</td><td>${esc(formatMetric(m.metric, m.p50))}</td><td>${esc(formatMetric(m.metric, m.p75))}</td><td>${esc(formatMetric(m.metric, m.p95))}</td><td>${this.pill(m.rating)}</td></tr>`).join("")}</table></section>`;
      case "regressions": {
        const reg = r.regressions.filter((x) => x.regressed);
        return `<section><h2>Regressions</h2>${reg.length ? `<table><tr><th>Metric</th><th>Previous p75</th><th>Current p75</th><th>Change</th><th>Severity</th></tr>${reg.map((x) => `<tr><td>${x.metric}</td><td>${esc(formatMetric(x.metric, x.previous))}</td><td>${esc(formatMetric(x.metric, x.current))}</td><td>+${x.changePercent}%</td><td>${esc(x.severity)}</td></tr>`).join("")}</table>` : '<p class="muted">No regressions against the previous four weeks.</p>'}</section>`;
      }
      case "trends":
        return `<section><h2>Daily p75</h2><table><tr><th>Date</th>${Object.keys(r.trends).map((m) => `<th>${m}</th>`).join("")}</tr>${[...new Set(Object.values(r.trends).flatMap((rows) => (rows ?? []).map((x) => x.date)))].sort().map((d) => `<tr><td>${d}</td>${Object.entries(r.trends).map(([m, rows]) => { const v = rows?.find((x) => x.date === d)?.value; return `<td>${v === undefined ? "—" : esc(formatMetric(m as Metric, v))}</td>`; }).join("")}</tr>`).join("")}</table></section>`;
      case "segments":
        return `<section><h2>By device and browser</h2><table><tr><th>Segment</th><th>Samples</th><th>LCP p75</th><th>CLS p75</th><th>INP p75</th><th>Rating</th></tr>${[...r.segments.device, ...r.segments.browser].map((s) => `<tr><td>${esc(s.segment)}</td><td>${s.samples}</td><td>${esc(formatMetric("LCP", s.p75.LCP ?? Number.NaN))}</td><td>${esc(formatMetric("CLS", s.p75.CLS ?? Number.NaN))}</td><td>${esc(formatMetric("INP", s.p75.INP ?? Number.NaN))}</td><td>${this.pill(s.rating)}</td></tr>`).join("")}</table></section>`;
      case "cohorts":
        return `<section><h2>Weekly cohorts</h2><table><tr><th>Week</th><th>Samples</th><th>LCP p75</th><th>Good LCP</th><th>Rating</th></tr>${r.cohorts.map((c) => `<tr><td>${c.week}</td><td>${c.samples}</td><td>${esc(formatMetric("LCP", c.p75.LCP ?? Number.NaN))}</td><td>${c.goodShare}%</td><td>${this.pill(c.rating)}</td></tr>`).join("")}</table></section>`;
      case "recommendations":
        return r.recommendations.length ? `<section><h2>Recommendations</h2><ol>${r.recommendations.map((x) => `<li><strong>${esc(x.title)}</strong> <span class="muted">(${x.impact} impact)</span><br><span class="muted">${esc(x.detail)}</span></li>`).join("")}</ol></section>` : "";
      case "lighthouse":
        return r.lighthouse ? `<section><h2>Lighthouse (lab)</h2><table><tr><th>Performance</th><th>Accessibility</th><th>Best practices</th><th>SEO</th></tr><tr><td>${r.lighthouse.performance}</td><td>${r.lighthouse.accessibility ?? "—"}</td><td>${r.lighthouse.bestPractices ?? "—"}</td><td>${r.lighthouse.seo ?? "—"}</td></tr></table><p class="muted">Run at ${esc(r.lighthouse.fetchedAt)}</p></section>` : "";
    }
  }
}
