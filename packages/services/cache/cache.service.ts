/**
 * Cache Service for Web Vitals Profiler.
 * Distributed caching with Redis (shared by every API instance), with a bounded in-process fallback. A cache failure
 * is never an error for the caller: it gets a miss and computes the value.
 */
import { getRedis } from "../redis.js";

const MAX_MEMORY_ENTRIES = 5_000;
const memory = new Map<string, { value: string; expires: number }>();

export class CacheService {
  readonly defaultTTL = 3600;

  constructor(private readonly namespace = "wvp") {}

  private k(key: string): string {
    return `${this.namespace}:${key}`;
  }

  async get(key: string): Promise<string | null> {
    const redis = getRedis();
    if (redis) {
      try {
        return await redis.get(this.k(key));
      } catch {
        return null;
      }
    }
    const hit = memory.get(this.k(key));
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      memory.delete(this.k(key));
      return null;
    }
    return hit.value;
  }

  async set(key: string, value: string, ttl = this.defaultTTL): Promise<void> {
    const redis = getRedis();
    if (redis) {
      await redis.set(this.k(key), value, "EX", ttl).catch(() => undefined);
      return;
    }
    if (memory.size >= MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value as string);
    memory.set(this.k(key), { value, expires: Date.now() + ttl * 1000 });
  }

  /** Sets only when absent; true when this call created it (cool-downs, one-time claims). */
  async setIfAbsent(key: string, value: string, ttl: number): Promise<boolean> {
    const redis = getRedis();
    if (redis) {
      try {
        return (await redis.set(this.k(key), value, "EX", ttl, "NX")) === "OK";
      } catch {
        return true; // without the cache, act as if the slot was free
      }
    }
    if ((await this.get(key)) !== null) return false;
    await this.set(key, value, ttl);
    return true;
  }

  async delete(key: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
      await redis.del(this.k(key)).catch(() => undefined);
      return;
    }
    memory.delete(this.k(key));
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJSON(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  }

  /** Cache-aside: the cached value, or compute, store and return it. */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<{ value: T; hit: boolean }> {
    const cached = await this.getJSON<T>(key);
    if (cached !== null) return { value: cached, hit: true };
    const value = await factory();
    if (value !== undefined && value !== null) await this.setJSON(key, value, ttl);
    return { value, hit: false };
  }

  /** Removes every key matching a glob such as "stats:user1:*" (SCAN, never KEYS). */
  async invalidatePattern(pattern: string): Promise<number> {
    const redis = getRedis();
    let removed = 0;
    if (redis) {
      try {
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(cursor, "MATCH", this.k(pattern), "COUNT", 200);
          cursor = next;
          if (keys.length) removed += await redis.del(...keys);
        } while (cursor !== "0");
      } catch {
        /* a stale entry expires on its own */
      }
      return removed;
    }
    const re = new RegExp(`^${this.k(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    for (const key of memory.keys()) {
      if (re.test(key)) {
        memory.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

export default CacheService;
