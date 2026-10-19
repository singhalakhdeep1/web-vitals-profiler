/**
 * Rate Limiting Service for Web Vitals Profiler: token bucket per key.
 * On Redis the refill-and-take step is one Lua script, so it is atomic across concurrent requests and API instances.
 * Without Redis an in-process bucket is used. If Redis fails, requests are allowed (an outage must not lock users out).
 */
import { getRedis } from "../redis.js";

const LUA = `
local cap = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local d = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(d[1])
local ts = tonumber(d[2])
if tokens == nil then tokens = cap; ts = now end
tokens = math.min(cap, tokens + math.max(0, (now - ts) / 1000) * rate)
local allowed = 0
if tokens >= cost then tokens = tokens - cost; allowed = 1 end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('EXPIRE', KEYS[1], math.ceil(cap / rate) + 60)
return { allowed, tostring(tokens) }
`;

const memory = new Map<string, { tokens: number; ts: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the request would succeed. */
  retryAfter: number;
}

export class RateLimitingService {
  constructor(
    readonly bucketCapacity = Number(process.env.RATE_LIMIT_BUCKET_CAPACITY ?? 100),
    /** Tokens added per second. */
    readonly refillRate = Number(process.env.RATE_LIMIT_REFILL_RATE ?? 1),
    private readonly prefix = "rate_limit",
  ) {}

  async consume(key: string, cost = 1): Promise<RateLimitResult> {
    const now = Date.now();
    const cap = this.bucketCapacity;
    const rate = this.refillRate;
    const redis = getRedis();
    if (redis) {
      try {
        const [allowed, tokens] = (await redis.eval(LUA, 1, `${this.prefix}:${key}`, cap, rate, now, cost)) as [number, string];
        const left = parseFloat(tokens);
        return { allowed: allowed === 1, remaining: Math.floor(left), retryAfter: allowed === 1 ? 0 : Math.ceil((cost - left) / rate) };
      } catch {
        return { allowed: true, remaining: cap, retryAfter: 0 };
      }
    }
    const b = memory.get(`${this.prefix}:${key}`) ?? { tokens: cap, ts: now };
    b.tokens = Math.min(cap, b.tokens + Math.max(0, (now - b.ts) / 1000) * rate);
    b.ts = now;
    const allowed = b.tokens >= cost;
    if (allowed) b.tokens -= cost;
    if (memory.size > 50_000) memory.clear();
    memory.set(`${this.prefix}:${key}`, b);
    return { allowed, remaining: Math.floor(b.tokens), retryAfter: allowed ? 0 : Math.ceil((cost - b.tokens) / rate) };
  }

  async isAllowed(key: string, tokensRequested = 1): Promise<boolean> {
    return (await this.consume(key, tokensRequested)).allowed;
  }

  async reset(key: string): Promise<void> {
    memory.delete(`${this.prefix}:${key}`);
    await getRedis()?.del(`${this.prefix}:${key}`).catch(() => undefined);
  }
}

/** "max requests per windowSeconds" as a bucket of `max` refilling at max/window per second. */
export const perWindow = (name: string, max: number, windowSeconds: number): RateLimitingService => new RateLimitingService(max, max / windowSeconds, `rl:${name}`);

export default RateLimitingService;
