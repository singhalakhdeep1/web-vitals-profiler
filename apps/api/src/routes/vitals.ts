/** Vitals ingest (real-user monitoring from the extension) and everything computed from the samples. */
import { createHash } from "node:crypto";
import {
  AnalyticsService,
  BUILT_IN_TEMPLATES,
  CohortService,
  isMetric,
  MonitoringService,
  rate,
  ReportService,
  summarize,
  type Metric,
  type ReportTemplate,
  type SectionId,
} from "@wvp/core";
import { saveVitals, type VitalsDoc } from "@wvp/firebase";
import type { Deps } from "../deps";
import { HttpError, httpUrl, json, newId, oneOf, str, type Ctx, type Router } from "../http";
import { invalidateUser, RANGES, samplesFor, toSample } from "../samples";
import { evaluateAlerts } from "./alerts";
import { latestLighthouse } from "./lighthouse";

const MAX_BATCH = 500;
const MAX_AGE = 30 * 86_400_000;

function cleanUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  return u.toString();
}

/** Validates one sample from the extension; null when it is unusable (it is counted as rejected, not an error). */
function parseSample(raw: unknown, userId: string, context: Record<string, unknown>, country: string | undefined): VitalsDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const name = s.name === "FID" ? "INP" : s.name;
  if (!isMetric(name)) return null;
  const value = Number(s.value);
  if (!Number.isFinite(value) || value < 0 || value > (name === "CLS" ? 100 : 600_000)) return null;
  const timestamp = Number(s.timestamp ?? Date.now());
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60_000 || timestamp < Date.now() - MAX_AGE) return null;
  let url: string;
  try {
    url = cleanUrl(String(s.url ?? ""));
    if (!/^https?:/.test(url) || url.length > 2048) return null;
  } catch {
    return null;
  }
  const clientId = typeof s.id === "string" && s.id.length <= 100 ? s.id : `${name}-${timestamp}-${value}`;
  const pick = (v: unknown, max = 40) => (typeof v === "string" && v ? v.slice(0, max) : undefined);
  const device = pick(context.device);
  return {
    // the same sample uploaded twice (offline queue retries) lands on the same document
    id: createHash("sha1").update(`${userId}:${url}:${clientId}`).digest("hex"),
    userId,
    url,
    origin: new URL(url).origin,
    name,
    value,
    rating: rate(name, value),
    timestamp,
    navigationType: pick(s.navigationType),
    device: device === "mobile" || device === "tablet" || device === "desktop" ? device : undefined,
    browser: pick(context.browser),
    connection: pick(context.connection),
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
  };
}

const rangeDays = (ctx: Ctx, fallback = "30d"): number => RANGES[oneOf(ctx.query("range"), "range", Object.keys(RANGES), fallback)] as number;
const optionalUrl = (ctx: Ctx): string | undefined => httpUrl(ctx.query("url"), "url", { optional: true }) || undefined;

/** The authenticated user may only read their own /api/users/:id/... data. */
export function ownUser(ctx: Ctx): string {
  if (ctx.params.id !== ctx.userId) throw new HttpError(403, "You can only read your own data", "forbidden");
  return ctx.userId!;
}

export function vitalsRoutes(r: Router, deps: Deps): void {
  const { store, cache, limits, log } = deps;
  const monitoring = new MonitoringService();
  const analytics = new AnalyticsService();
  const cohorts = new CohortService();
  const reports = new ReportService();

  r.post("/api/vitals", async (ctx) => {
    const userId = ctx.userId!;
    const quota = await limits.ingest.consume(userId);
    if (!quota.allowed) return json({ error: "Too many uploads, slow down", code: "rate_limited" }, 429, { "Retry-After": String(quota.retryAfter) });
    const b = await ctx.body<{ samples?: unknown[]; context?: Record<string, unknown> }>();
    if (!Array.isArray(b.samples) || !b.samples.length) throw new HttpError(400, "samples must be a non-empty array", "validation");
    if (b.samples.length > MAX_BATCH) throw new HttpError(413, `At most ${MAX_BATCH} samples per request`, "too_many");
    const country = ctx.req.headers.get("x-vercel-ip-country") ?? ctx.req.headers.get("cf-ipcountry") ?? undefined;
    const docs = b.samples.map((s) => parseSample(s, userId, b.context ?? {}, country ?? undefined)).filter((d): d is VitalsDoc => d !== null);
    if (docs.length) {
      await saveVitals(store, docs);
      await invalidateUser(deps, userId);
    }
    const alerts = docs.length ? await evaluateAlerts(deps, userId, docs) : 0;
    log.logInformation("Vitals ingested", { accepted: docs.length, rejected: b.samples.length - docs.length, alerts });
    return json({ accepted: docs.length, rejected: b.samples.length - docs.length, alertsTriggered: alerts }, 202);
  });

  // recent samples for a URL (the endpoint the Vercel design describes)
  r.get("/api/vitals", async (ctx) => {
    const url = httpUrl(ctx.query("url"), "url");
    const limit = Math.min(1000, Number(ctx.query("limit") ?? 200) || 200);
    const rows = (await samplesFor(deps, ctx.userId!, 30, url)).slice(0, limit);
    return json({ vitals: rows.map(({ userId: _u, ...v }) => v) });
  });

  // p50 / p75 / p95 per metric, cached until new samples arrive
  r.get("/api/stats", async (ctx) => {
    const url = optionalUrl(ctx);
    const days = rangeDays(ctx, "28d");
    const key = `agg:${ctx.userId}:stats:${days}:${url ?? "*"}`;
    const { value, hit } = await cache.getOrSet(key, async () => {
      const rows = await samplesFor(deps, ctx.userId!, days, url);
      const out: Record<string, ReturnType<typeof summarize> & { rating: string }> = {};
      for (const m of ["LCP", "CLS", "INP", "FCP", "TTFB", "TBT"] as Metric[]) {
        const values = rows.filter((x) => x.name === m).map((x) => x.value);
        if (values.length) {
          const s = summarize(values);
          out[m] = { ...s, rating: rate(m, s.p75) };
        }
      }
      return { url: url ?? null, days, stats: out };
    }, 300);
    return json(value, 200, { "X-Cache": hit ? "HIT" : "MISS" });
  });

  // pages with data, for pickers in the extension
  r.get("/api/users/:id/urls", async (ctx) => {
    const userId = ownUser(ctx);
    const rows = await samplesFor(deps, userId, rangeDays(ctx, "30d"));
    const counts = new Map<string, { url: string; samples: number; lastSeen: number }>();
    for (const x of rows) {
      const e = counts.get(x.url) ?? { url: x.url, samples: 0, lastSeen: 0 };
      e.samples++;
      e.lastSeen = Math.max(e.lastSeen, x.timestamp);
      counts.set(x.url, e);
    }
    return json([...counts.values()].sort((a, b) => b.samples - a.samples).slice(0, 100));
  });

  // daily p75 for one metric (HistoricalTrendCharts)
  r.get("/api/users/:id/trends", async (ctx) => {
    const userId = ownUser(ctx);
    const metric = oneOf(ctx.query("metric") === "FID" ? "INP" : ctx.query("metric"), "metric", ["LCP", "CLS", "INP", "FCP", "TTFB", "TBT"] as const, "LCP");
    const days = rangeDays(ctx);
    const url = optionalUrl(ctx);
    const { value } = await cache.getOrSet(`agg:${userId}:trend:${metric}:${days}:${url ?? "*"}`, async () => {
      const rows = (await samplesFor(deps, userId, days, url)).map(toSample);
      return monitoring.dailyTrend(rows, metric, days).map((t) => ({ date: t.date, metric, value: t.value, samples: t.count }));
    }, 300);
    return json(value);
  });

  // regressions, anomalies, rating distribution, segments and weekly cohorts
  r.get("/api/analytics", async (ctx) => {
    const days = rangeDays(ctx, "30d");
    const url = optionalUrl(ctx);
    const rows = (await samplesFor(deps, ctx.userId!, Math.max(days, 35), url)).map(toSample);
    const inRange = rows.filter((s) => s.timestamp >= Date.now() - days * 86_400_000);
    const anomalies: Record<string, unknown[]> = {};
    for (const m of ["LCP", "CLS", "INP"] as Metric[]) anomalies[m] = monitoring.detectAnomalies(monitoring.dailyTrend(inRange, m, days));
    return json({
      url: url ?? null,
      days,
      samples: inRange.length,
      distribution: analytics.distribution(inRange),
      regressions: monitoring.checkForRegressions(rows),
      anomalies,
      segments: { device: analytics.segment(inRange, "device"), browser: analytics.segment(inRange, "browser"), connection: analytics.segment(inRange, "connection"), country: analytics.segment(inRange, "country") },
      cohorts: cohorts.analyzePerformanceCohorts(inRange),
    });
  });

  /* ---- report templates (built-in plus the user's own) ---- */

  const SECTIONS: SectionId[] = ["summary", "scorecard", "metrics", "regressions", "trends", "segments", "cohorts", "recommendations", "lighthouse"];

  r.get("/api/report-templates", async (ctx) => {
    const mine = await store.query<ReportTemplate & { userId: string }>("reportTemplates", { where: [["userId", "==", ctx.userId!]] });
    return json([...BUILT_IN_TEMPLATES.map((t) => ({ ...t, builtIn: true })), ...mine.map(({ userId: _u, ...t }) => t)]);
  });

  r.post("/api/report-templates", async (ctx) => {
    const b = await ctx.body<{ name?: unknown; sections?: unknown; brand?: { name?: unknown; color?: unknown } }>();
    const sections = Array.isArray(b.sections) ? b.sections.filter((s): s is SectionId => SECTIONS.includes(s as SectionId)) : [];
    if (!sections.length) throw new HttpError(400, `sections must list some of: ${SECTIONS.join(", ")}`, "validation");
    const color = typeof b.brand?.color === "string" && /^#[0-9a-f]{6}$/i.test(b.brand.color) ? b.brand.color : undefined;
    const template = { id: newId(), userId: ctx.userId!, name: str(b.name, "name", { max: 80 }), sections, brand: { name: b.brand?.name ? str(b.brand.name, "brand.name", { max: 80 }) : undefined, color } };
    await store.set("reportTemplates", template.id, template);
    const { userId: _u, ...out } = template;
    return json(out, 201);
  });

  // a report file (executive / technical / custom template; json, csv or html)
  r.get("/api/reports", async (ctx) => {
    const days = rangeDays(ctx, "30d");
    const url = optionalUrl(ctx);
    const format = oneOf(ctx.query("format"), "format", ["json", "csv", "html"] as const, "html");
    const templateId = ctx.query("template") ?? "executive";
    let template: ReportTemplate | undefined = BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      const own = await store.get<ReportTemplate & { userId: string }>("reportTemplates", templateId);
      if (!own || own.userId !== ctx.userId) throw new HttpError(404, "Template not found", "not_found");
      template = own;
    }
    const rows = (await samplesFor(deps, ctx.userId!, Math.max(days, 35), url)).map(toSample);
    const lh = url ? await latestLighthouse(deps, ctx.userId!, url) : null;
    const report = reports.generatePerformanceReport({
      url: url ?? "",
      samples: rows,
      days,
      template,
      recommendations: lh?.opportunities?.map((o) => ({ id: o.id, title: o.title, detail: `Estimated saving ${Math.round(o.savingsMs)} ms`, impact: o.savingsMs > 1000 ? "high" : o.savingsMs > 300 ? "medium" : "low" })) ?? [],
      lighthouse: lh ? { performance: lh.performance, accessibility: lh.accessibility, bestPractices: lh.bestPractices, seo: lh.seo, fetchedAt: new Date(lh.generatedAt).toISOString() } : undefined,
    });
    const file = reports.exportReport(report, format);
    return new Response(file.body, { headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${file.filename}"` } });
  });
}
