/** Configuration and the services every route uses. */
import { randomBytes } from "node:crypto";
import { createStore, type DocStore } from "@wvp/firebase";
import { PageSpeedInsightsService } from "@wvp/pagespeed";
import { CacheService, logger, perWindow, type RateLimitingService } from "@wvp/services";
import { Tokens } from "./auth";

export interface Config {
  env: "development" | "production" | "test";
  port: number;
  jwtSecret: string;
  /** Base URL of this API as browsers see it (embeddable badge links). */
  publicUrl: string;
  pagespeedKey?: string;
  pagespeedUrl?: string;
  smtpUrl?: string;
  mailFrom: string;
  /** Allow alert webhooks to private / loopback addresses (development and tests only). */
  allowPrivateWebhooks: boolean;
  alertCooldownSeconds: number;
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): Config {
  const mode = (env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development") as Config["env"];
  let jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32) {
    if (mode === "production") throw new Error("JWT_SECRET must be set to at least 32 characters in production");
    jwtSecret = randomBytes(32).toString("hex"); // development: tokens stop working on restart
  }
  const allowPrivateWebhooks = env.ALLOW_PRIVATE_WEBHOOKS === "true";
  if (mode === "production" && allowPrivateWebhooks) throw new Error("ALLOW_PRIVATE_WEBHOOKS must not be enabled in production");
  const port = Number(env.PORT ?? 8787);
  return {
    env: mode,
    port,
    jwtSecret,
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, ""),
    pagespeedKey: env.PAGESPEED_API_KEY || undefined,
    pagespeedUrl: env.PAGESPEED_API_URL || undefined,
    smtpUrl: env.SMTP_URL || undefined,
    mailFrom: env.MAIL_FROM ?? "Web Vitals Profiler <alerts@localhost>",
    allowPrivateWebhooks,
    alertCooldownSeconds: Number(env.ALERT_COOLDOWN_SECONDS ?? 900),
  };
}

export interface Deps {
  config: Config;
  store: DocStore;
  tokens: Tokens;
  cache: CacheService;
  pagespeed: PageSpeedInsightsService;
  limits: { ingest: RateLimitingService; login: RateLimitingService; register: RateLimitingService; lighthouse: RateLimitingService; api: RateLimitingService };
  log: typeof logger;
}

export function createDeps(config: Config = configFromEnv(), store: DocStore = createStore()): Deps {
  return {
    config,
    store,
    tokens: new Tokens(config.jwtSecret),
    cache: new CacheService("wvp"),
    pagespeed: new PageSpeedInsightsService(config.pagespeedKey, config.pagespeedUrl),
    limits: {
      ingest: perWindow("ingest", 240, 60),
      login: perWindow("login", 10, 15 * 60),
      register: perWindow("register", 10, 3600),
      lighthouse: perWindow("lighthouse", 20, 3600),
      api: perWindow("api", 600, 60),
    },
    log: logger,
  };
}
