/** Lighthouse runs through PageSpeed Insights, and the performance score that combines them with field data. */
import { calculateScore, p75ByMetric, type ScoreWeights } from "@wvp/core";
import { ALL_CATEGORIES, PageSpeedError, type Category, type PageSpeedResult } from "@wvp/pagespeed";
import type { Deps } from "../deps";
import { HttpError, httpUrl, json, newId, num, oneOf, type Router } from "../http";
import { samplesFor, toSample } from "../samples";
import { ownUser } from "./vitals";

export interface LighthouseDoc {
  id: string;
  userId: string;
  url: string;
  strategy: "desktop" | "mobile";
  performance: number;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  pwa: number | null;
  metrics: PageSpeedResult["metrics"];
  opportunities: PageSpeedResult["opportunities"];
  field?: PageSpeedResult["field"];
  generatedAt: number;
}

interface ScoreDoc {
  id: string;
  userId: string;
  url: string;
  overallScore: number;
  breakdown: ReturnType<typeof calculateScore>["breakdown"];
  weights: ScoreWeights;
  lighthouseId?: string;
  calculatedAt: number;
}

const strip = <T extends { userId: string }>({ userId: _u, ...rest }: T) => rest;

export async function latestLighthouse(deps: Deps, userId: string, url: string): Promise<LighthouseDoc | null> {
  const [doc] = await deps.store.query<LighthouseDoc>("lighthouseReports", { where: [["userId", "==", userId], ["url", "==", url]], orderBy: ["generatedAt", "desc"], limit: 1 });
  return doc ?? null;
}

async function runLighthouse(deps: Deps, userId: string, url: string, strategy: "desktop" | "mobile", categories: Category[] = ALL_CATEGORIES): Promise<LighthouseDoc> {
  const quota = await deps.limits.lighthouse.consume(userId);
  if (!quota.allowed) throw new HttpError(429, `Lighthouse run limit reached, try again in ${Math.ceil(quota.retryAfter / 60)} min`, "rate_limited");
  // the same page and strategy within 10 minutes reuses the previous PageSpeed answer
  let result: PageSpeedResult;
  try {
    ({ value: result } = await deps.cache.getOrSet(`pagespeed:${strategy}:${[...categories].sort().join("+")}:${url}`, () => deps.pagespeed.run(url, strategy, categories), 600));
  } catch (e) {
    if (e instanceof PageSpeedError) throw new HttpError(e.status >= 500 ? 502 : 400, e.message, "pagespeed_failed");
    throw e;
  }
  const doc: LighthouseDoc = {
    id: newId(),
    userId,
    url,
    strategy,
    performance: result.performance,
    accessibility: result.accessibility,
    bestPractices: result.bestPractices,
    seo: result.seo,
    pwa: result.pwa,
    metrics: result.metrics,
    opportunities: result.opportunities,
    field: result.field,
    generatedAt: Date.now(),
  };
  await deps.store.set("lighthouseReports", doc.id, doc);
  deps.log.logAuditEvent("LighthouseRun", "Lighthouse report generated", { url, strategy, performance: doc.performance });
  return doc;
}

export function lighthouseRoutes(r: Router, deps: Deps): void {
  const { store } = deps;

  r.get("/api/users/:id/lighthouse-reports", async (ctx) => json((await store.query<LighthouseDoc>("lighthouseReports", { where: [["userId", "==", ownUser(ctx)]], orderBy: ["generatedAt", "desc"], limit: 50 })).map(strip)));

  r.post("/api/lighthouse/run", async (ctx) => {
    const b = await ctx.body();
    const url = httpUrl(b.url, "url");
    const categories = Array.isArray(b.categories) ? b.categories.filter((c): c is Category => ALL_CATEGORIES.includes(c as Category)) : ALL_CATEGORIES;
    // "both" runs the desktop and the mobile audit (two reports)
    const strategy = oneOf(b.strategy, "strategy", ["desktop", "mobile", "both"] as const, "mobile");
    if (strategy === "both") {
      const docs = [await runLighthouse(deps, ctx.userId!, url, "desktop", categories), await runLighthouse(deps, ctx.userId!, url, "mobile", categories)];
      return json(docs.map(strip), 201);
    }
    return json(strip(await runLighthouse(deps, ctx.userId!, url, strategy, categories)), 201);
  });

  r.get("/api/users/:id/performance-scores", async (ctx) => json((await store.query<ScoreDoc>("performanceScores", { where: [["userId", "==", ownUser(ctx)]], orderBy: ["calculatedAt", "desc"], limit: 50 })).map(strip)));

  r.post("/api/performance/calculate", async (ctx) => {
    const b = await ctx.body<{ url?: unknown; weights?: Record<string, unknown>; runLighthouse?: unknown }>();
    const url = httpUrl(b.url, "url");
    const w = b.weights ?? {};
    const weights: ScoreWeights = {
      speed: num(w.speed ?? 40, "weights.speed", { min: 0, max: 100 }),
      accessibility: num(w.accessibility ?? 25, "weights.accessibility", { min: 0, max: 100 }),
      bestPractices: num(w.bestPractices ?? 20, "weights.bestPractices", { min: 0, max: 100 }),
      seo: num(w.seo ?? 15, "weights.seo", { min: 0, max: 100 }),
    };
    if (weights.speed + weights.accessibility + weights.bestPractices + weights.seo === 0) throw new HttpError(400, "At least one weight must be above 0", "validation");
    let lab = await latestLighthouse(deps, ctx.userId!, url);
    if (!lab && b.runLighthouse !== false) lab = await runLighthouse(deps, ctx.userId!, url, "mobile").catch(() => null);
    const field = p75ByMetric((await samplesFor(deps, ctx.userId!, 28, url)).map(toSample));
    if (!lab && !Object.keys(field).length) throw new HttpError(422, "No data for this page yet: browse it with the extension or run Lighthouse first", "no_data");
    const { overallScore, breakdown } = calculateScore(weights, lab ? { performance: lab.performance, accessibility: lab.accessibility, bestPractices: lab.bestPractices, seo: lab.seo, opportunities: lab.opportunities } : null, field);
    const score: ScoreDoc = { id: newId(), userId: ctx.userId!, url, overallScore, breakdown, weights, lighthouseId: lab?.id, calculatedAt: Date.now() };
    await store.set("performanceScores", score.id, score);
    return json(strip(score), 201);
  });
}
