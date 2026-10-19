/** Performance budgets, A/B test comparisons and Core Web Vitals badges (with a public SVG for embedding). */
import { compareVariants, formatMetric, overallRating, p75ByMetric, rate, THRESHOLDS, type Metric, type Sample } from "@wvp/core";
import type { Deps } from "../deps";
import { HttpError, httpUrl, json, newId, num, oneOf, str, type Router } from "../http";
import { samplesFor, samplesForUrl, toSample } from "../samples";
import { ownUser } from "./vitals";

const strip = <T extends { userId: string }>({ userId: _u, ...rest }: T) => rest;
/** FID was replaced by INP as a Core Web Vital; old clients may still send it. */
const metricOf = (m: string): Metric => (m === "FID" ? "INP" : (m as Metric));

async function owned<T extends { userId: string }>(deps: Deps, collection: string, id: string, userId: string): Promise<T> {
  const doc = await deps.store.get<T>(collection, id);
  if (!doc || doc.userId !== userId) throw new HttpError(404, "Not found", "not_found");
  return doc;
}

/* ---------------------------------------------------------------- budgets */

interface BudgetDoc {
  id: string;
  userId: string;
  name: string;
  metric: Metric;
  threshold: number;
  unit: "ms" | "score";
  url?: string;
  createdAt: number;
}

/** A budget with its current p75 over the last 7 days: failing above the budget, warning within 10% of it. */
function budgetView(b: BudgetDoc, recent: Sample[]) {
  const values = recent.filter((s) => s.name === b.metric && (!b.url || s.url === b.url));
  const current = values.length ? (p75ByMetric(values)[b.metric] as number) : null;
  const status = current === null ? "warning" : current > b.threshold ? "failing" : current > b.threshold * 0.9 ? "warning" : "passing";
  return { ...strip(b), status, currentValue: current ?? 0, hasData: current !== null, samples: values.length, lastChecked: new Date().toISOString() };
}

/* --------------------------------------------------------------- A/B tests */

interface ABTestDoc {
  id: string;
  userId: string;
  name: string;
  description: string;
  variantA: { name: string; url: string };
  variantB: { name: string; url: string };
  status: "running" | "completed" | "paused";
  createdAt: number;
  endedAt?: number;
}

/* ------------------------------------------------------------------ badges */

interface BadgeDoc {
  id: string;
  userId: string;
  name: string;
  type: "LCP" | "INP" | "CLS" | "overall";
  style: "minimal" | "detailed" | "score";
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  url?: string;
  enabled: boolean;
  createdAt: number;
}

const BADGE_COLOR = { good: "#0cce6b", "needs-improvement": "#ffa400", poor: "#ff4e42" } as const;
const xml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function badgeSvg(label: string, value: string, color: string): string {
  const w1 = 8 + label.length * 6.5;
  const w2 = 10 + value.length * 7;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w1 + w2}" height="20" role="img" aria-label="${xml(label)}: ${xml(value)}"><title>${xml(label)}: ${xml(value)}</title><rect width="${w1}" height="20" fill="#555"/><rect x="${w1}" width="${w2}" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,Geneva,sans-serif" font-size="11" text-anchor="middle"><text x="${w1 / 2}" y="14">${xml(label)}</text><text x="${w1 + w2 / 2}" y="14">${xml(value)}</text></g></svg>`;
}

export function featureRoutes(r: Router, deps: Deps): void {
  const { store, cache } = deps;

  /* ---- budgets ---- */

  r.get("/api/users/:id/performance-budgets", async (ctx) => {
    const userId = ownUser(ctx);
    const budgets = await store.query<BudgetDoc>("budgets", { where: [["userId", "==", userId]], orderBy: ["createdAt", "desc"] });
    const recent = (await samplesFor(deps, userId, 7)).map(toSample);
    return json(budgets.map((b) => budgetView(b, recent)));
  });

  r.post("/api/performance-budgets", async (ctx) => {
    const b = await ctx.body();
    const metric = metricOf(oneOf(b.metric, "metric", ["LCP", "CLS", "INP", "FCP", "TTFB", "TBT", "FID"] as const));
    const budget: BudgetDoc = {
      id: newId(),
      userId: ctx.userId!,
      name: str(b.name, "name", { max: 80 }),
      metric,
      threshold: num(b.threshold, "threshold", { min: 0, max: 600_000 }),
      unit: metric === "CLS" ? "score" : "ms",
      url: httpUrl(b.url, "url", { optional: true }) || undefined,
      createdAt: Date.now(),
    };
    await store.set("budgets", budget.id, budget);
    return json(budgetView(budget, (await samplesFor(deps, ctx.userId!, 7)).map(toSample)), 201);
  });

  r.delete("/api/performance-budgets/:bid", async (ctx) => {
    const b = await owned<BudgetDoc>(deps, "budgets", ctx.params.bid!, ctx.userId!);
    await store.delete("budgets", b.id);
    return json({ deleted: true });
  });

  /* ---- A/B tests ---- */

  const sizes = async (t: ABTestDoc) => {
    const [a, b] = await Promise.all([samplesForUrl(deps, t.variantA.url, t.createdAt, [t.userId], t.endedAt), samplesForUrl(deps, t.variantB.url, t.createdAt, [t.userId], t.endedAt)]);
    return { a, b };
  };
  const viewTest = async (t: ABTestDoc) => {
    const { a, b } = await sizes(t);
    return { ...strip(t), variantA: { ...t.variantA, sampleSize: a.length }, variantB: { ...t.variantB, sampleSize: b.length } };
  };

  r.get("/api/users/:id/ab-tests", async (ctx) => {
    const tests = await store.query<ABTestDoc>("abTests", { where: [["userId", "==", ownUser(ctx)]], orderBy: ["createdAt", "desc"] });
    return json(await Promise.all(tests.map(viewTest)));
  });

  r.post("/api/ab-tests", async (ctx) => {
    const b = await ctx.body<{ name?: unknown; description?: unknown; variantA?: { name?: unknown; url?: unknown }; variantB?: { name?: unknown; url?: unknown } }>();
    const test: ABTestDoc = {
      id: newId(),
      userId: ctx.userId!,
      name: str(b.name, "name", { max: 80 }),
      description: str(b.description, "description", { max: 500, optional: true }),
      variantA: { name: str(b.variantA?.name || "A", "variantA.name", { max: 40 }), url: httpUrl(b.variantA?.url, "variantA.url") },
      variantB: { name: str(b.variantB?.name || "B", "variantB.name", { max: 40 }), url: httpUrl(b.variantB?.url, "variantB.url") },
      status: "running",
      createdAt: Date.now(),
    };
    if (test.variantA.url === test.variantB.url) throw new HttpError(400, "The two variants need different URLs", "validation");
    await store.set("abTests", test.id, test);
    return json(await viewTest(test), 201);
  });

  r.get("/api/ab-tests/:tid/comparison", async (ctx) => {
    const t = await owned<ABTestDoc>(deps, "abTests", ctx.params.tid!, ctx.userId!);
    const { a, b } = await sizes(t);
    return json(compareVariants(a.map(toSample), b.map(toSample)));
  });

  r.post("/api/ab-tests/:tid/status", async (ctx) => {
    const t = await owned<ABTestDoc>(deps, "abTests", ctx.params.tid!, ctx.userId!);
    const status = oneOf((await ctx.body()).status, "status", ["running", "completed", "paused"] as const);
    const patch = { status, endedAt: status === "completed" ? Date.now() : undefined };
    await store.set("abTests", t.id, { ...t, ...patch });
    return json(await viewTest({ ...t, ...patch }));
  });

  r.delete("/api/ab-tests/:tid", async (ctx) => {
    const t = await owned<ABTestDoc>(deps, "abTests", ctx.params.tid!, ctx.userId!);
    await store.delete("abTests", t.id);
    return json({ deleted: true });
  });

  /* ---- badges ---- */

  const embed = (b: BadgeDoc) => {
    const [v, h] = b.position.split("-") as ["top" | "bottom", "left" | "right"];
    const src = `${deps.config.publicUrl}/api/badges/${b.id}.svg`;
    return `<a href="https://web.dev/articles/vitals" style="position:fixed;${v}:12px;${h}:12px;z-index:9999"><img src="${src}" alt="Core Web Vitals"></a>`;
  };
  const viewBadge = (b: BadgeDoc) => ({ ...strip(b), imageUrl: `${deps.config.publicUrl}/api/badges/${b.id}.svg`, embedHtml: embed(b) });

  r.get("/api/users/:id/badge-configs", async (ctx) => json((await store.query<BadgeDoc>("badges", { where: [["userId", "==", ownUser(ctx)]], orderBy: ["createdAt", "desc"] })).map(viewBadge)));

  r.post("/api/badge-configs", async (ctx) => {
    const b = await ctx.body();
    const type = oneOf(b.type === "FID" ? "INP" : b.type, "type", ["LCP", "INP", "CLS", "overall"] as const, "overall");
    const badge: BadgeDoc = {
      id: newId(),
      userId: ctx.userId!,
      name: str(b.name, "name", { max: 80 }),
      type,
      style: oneOf(b.style, "style", ["minimal", "detailed", "score"] as const, "minimal"),
      position: oneOf(b.position, "position", ["top-left", "top-right", "bottom-left", "bottom-right"] as const, "bottom-right"),
      url: httpUrl(b.url, "url", { optional: true }) || undefined,
      enabled: true,
      createdAt: Date.now(),
    };
    await store.set("badges", badge.id, badge);
    return json(viewBadge(badge), 201);
  });

  r.post("/api/badge-configs/:bid/toggle", async (ctx) => {
    const b = await owned<BadgeDoc>(deps, "badges", ctx.params.bid!, ctx.userId!);
    await store.update("badges", b.id, { enabled: !b.enabled });
    await cache.delete(`badge:${b.id}`);
    return json(viewBadge({ ...b, enabled: !b.enabled }));
  });

  r.delete("/api/badge-configs/:bid", async (ctx) => {
    const b = await owned<BadgeDoc>(deps, "badges", ctx.params.bid!, ctx.userId!);
    await store.delete("badges", b.id);
    await cache.delete(`badge:${b.id}`);
    return json({ deleted: true });
  });

  // current p75 and status per metric over 28 days (what the badges show)
  r.get("/api/users/:id/badge-data", async (ctx) => {
    const userId = ownUser(ctx);
    const url = httpUrl(ctx.query("url"), "url", { optional: true }) || undefined;
    const p75 = p75ByMetric((await samplesFor(deps, userId, 28, url)).map(toSample));
    return json((["LCP", "INP", "CLS", "FCP", "TTFB"] as Metric[]).filter((m) => p75[m] !== undefined).map((m) => ({ metric: m, value: p75[m], status: rate(m, p75[m]!), threshold: THRESHOLDS[m] })));
  });

  // the embeddable image (no sign-in; disabled badges disappear)
  r.get("/api/badges/:bid.svg", async (ctx) => {
    const b = await store.get<BadgeDoc>("badges", ctx.params.bid!);
    if (!b || !b.enabled) return new Response("Not found", { status: 404 });
    const { value: svg } = await cache.getOrSet(`badge:${b.id}`, async () => {
      const p75 = p75ByMetric((await samplesFor(deps, b.userId, 28, b.url)).map(toSample));
      if (b.type === "overall") {
        const rating = overallRating(p75);
        const hasData = ["LCP", "CLS", "INP"].some((m) => p75[m as Metric] !== undefined);
        const label = b.style === "minimal" ? "Web Vitals" : "Core Web Vitals";
        const value = !hasData ? "no data" : b.style === "detailed" ? (["LCP", "CLS", "INP"] as Metric[]).filter((m) => p75[m] !== undefined).map((m) => `${m} ${formatMetric(m, p75[m]!)}`).join(" · ") : rating === "good" ? "passing" : rating.replace("-", " ");
        return badgeSvg(label, value, hasData ? BADGE_COLOR[rating] : "#9f9f9f");
      }
      const v = p75[b.type];
      if (v === undefined) return badgeSvg(b.type, "no data", "#9f9f9f");
      const r2 = rate(b.type, v);
      return badgeSvg(b.type, b.style === "minimal" ? r2.replace("-", " ") : formatMetric(b.type, v), BADGE_COLOR[r2]);
    }, 300);
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" } });
  }, false);
}
