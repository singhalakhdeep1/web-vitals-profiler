/**
 * The Web Vitals Profiler API as one Web-standard handler: (Request) => Promise<Response>. src/server.ts runs it on
 * Node; api/index.ts (through @wvp/vercel) runs it as a Vercel function.
 */
import { redisHealthy, StructuredLoggingService } from "@wvp/services";
import { wasmAvailable } from "@wvp/wasm";
import { createDeps, type Deps } from "./deps";
import { CORS_HEADERS, HttpError, json, readJson, Router, type Ctx } from "./http";
import { accountRoutes } from "./routes/accounts";
import { alertRoutes } from "./routes/alerts";
import { featureRoutes } from "./routes/features";
import { lighthouseRoutes } from "./routes/lighthouse";
import { teamRoutes } from "./routes/teams";
import { vitalsRoutes } from "./routes/vitals";

export type App = (req: Request, info?: { ip?: string }) => Promise<Response>;

export function createApp(deps: Deps = createDeps()): App {
  const router = new Router();

  router.get("/health", async () => {
    const checks: Record<string, unknown> = { store: deps.store.kind, redis: await redisHealthy(), wasm: wasmAvailable() };
    try {
      await deps.store.ping();
      checks.storeReachable = true;
    } catch (e) {
      checks.storeReachable = false;
      checks.storeError = (e as Error).message;
    }
    const ok = checks.storeReachable === true && checks.redis !== false;
    return json({ status: ok ? "ok" : "degraded", checks, time: new Date().toISOString() }, ok ? 200 : 503);
  }, false);

  accountRoutes(router, deps);
  vitalsRoutes(router, deps);
  alertRoutes(router, deps);
  lighthouseRoutes(router, deps);
  teamRoutes(router, deps);
  featureRoutes(router, deps);

  return async (req, info = {}) => {
    const url = new URL(req.url);
    const incoming = req.headers.get("x-request-id");
    const correlationId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : StructuredLoggingService.createCorrelationId();
    const started = Date.now();
    return deps.log.runWithContext({ correlationId, method: req.method, path: url.pathname }, async () => {
      let res: Response;
      try {
        res = await handle(req, url, info.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown");
      } catch (e) {
        if (e instanceof HttpError) res = json({ error: e.message, code: e.code }, e.status);
        else {
          deps.log.logError("Unhandled error", e);
          res = json({ error: deps.config.env === "production" ? "Internal server error" : (e as Error).message, code: "internal" }, 500);
        }
      }
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
      headers.set("X-Request-Id", correlationId);
      if (url.pathname !== "/health") deps.log.logInformation("request", { status: res.status, ms: Date.now() - started });
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    });
  };

  async function handle(req: Request, url: URL, ip: string): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    const found = router.match(req.method, url.pathname);
    if (!found) throw new HttpError(404, `No route for ${req.method} ${url.pathname}`, "not_found");
    if ("allowed" in found) throw new HttpError(405, `Use ${found.allowed.join(" or ")}`, "method_not_allowed");
    let bodyCache: Promise<Record<string, unknown>> | undefined;
    const ctx: Ctx = {
      req,
      url,
      params: found.params,
      ip,
      body: <T,>() => (bodyCache ??= readJson(req)) as Promise<T>,
      query: (name) => url.searchParams.get(name) ?? undefined,
    };
    if (found.route.auth) {
      const header = req.headers.get("authorization") ?? "";
      const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
      if (!token) throw new HttpError(401, "Sign in first (Authorization: Bearer <token>)", "unauthenticated");
      ctx.userId = deps.tokens.verify(token);
      deps.log.setUser(ctx.userId);
      const quota = await deps.limits.api.consume(ctx.userId);
      if (!quota.allowed) return json({ error: "Too many requests", code: "rate_limited" }, 429, { "Retry-After": String(quota.retryAfter) });
    }
    return found.route.handler(ctx);
  }
}
