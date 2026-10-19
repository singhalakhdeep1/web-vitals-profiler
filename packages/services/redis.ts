/**
 * One shared Redis connection for the cache and the rate limiter. Redis is optional: without REDIS_URL (or
 * REDIS_HOST) both fall back to in-process state, which is correct for a single server instance.
 */
import { Redis } from "ioredis";

let client: Redis | null | undefined;

export function redisUrl(): string | undefined {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  if (process.env.REDIS_HOST) return `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT ?? "6379"}`;
  return undefined;
}

/** The shared client, or null when Redis is not configured. */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = redisUrl();
  if (!url) {
    client = null;
    return client;
  }
  client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false, retryStrategy: (n) => Math.min(n * 200, 3000) });
  client.on("error", () => undefined); // surfaced through health checks, never crashes the process
  return client;
}

/** true = answers PING, false = configured but down, null = not configured. */
export async function redisHealthy(): Promise<boolean | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return (await r.ping()) === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) await client.quit().catch(() => undefined);
  client = undefined;
}
