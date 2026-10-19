/** Minimal Web-standard (Request -> Response) routing, so the same handler runs on Node and on Vercel. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const CORS_HEADERS: Record<string, string> = {
  // the API is called from browser extensions (chrome-extension://, moz-extension://) with a bearer token, never with
  // cookies, so any origin may call it
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Request-Id",
  "Access-Control-Expose-Headers": "X-Request-Id,X-Cache,Retry-After,Content-Disposition",
  "Access-Control-Max-Age": "600",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

export interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  /** Set by `auth` routes. */
  userId?: string;
  body<T = Record<string, unknown>>(): Promise<T>;
  query(name: string): string | undefined;
  ip: string;
}

export type Handler = (ctx: Ctx) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  auth: boolean;
}

export class Router {
  private readonly routes: Route[] = [];

  /** `path` like "/api/users/:id/trends"; `auth` routes need a valid bearer token. */
  add(method: string, path: string, handler: Handler, auth = true): this {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/\./g, "\\.").replace(/:(\w+)/g, (_, k: string) => (keys.push(k), "([^/]+)"))}/?$`);
    this.routes.push({ method, pattern, keys, handler, auth });
    return this;
  }

  get = (p: string, h: Handler, auth = true) => this.add("GET", p, h, auth);
  post = (p: string, h: Handler, auth = true) => this.add("POST", p, h, auth);
  patch = (p: string, h: Handler, auth = true) => this.add("PATCH", p, h, auth);
  put = (p: string, h: Handler, auth = true) => this.add("PUT", p, h, auth);
  delete = (p: string, h: Handler, auth = true) => this.add("DELETE", p, h, auth);

  match(method: string, pathname: string): { route: Route; params: Record<string, string> } | { allowed: string[] } | null {
    const allowed: string[] = [];
    for (const route of this.routes) {
      const m = route.pattern.exec(pathname);
      if (!m) continue;
      if (route.method !== method) {
        allowed.push(route.method);
        continue;
      }
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1] as string)]));
      return { route, params };
    }
    return allowed.length ? { allowed } : null;
  }
}

/** Reads a JSON body once (max 1 MB). */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 1_000_000) throw new HttpError(413, "Request body is too large");
  if (!text) return {};
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Malformed JSON body", "bad_json");
  }
}

/* ---------------------------------------------------------------- validation */

export const str = (v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string => {
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return "";
    throw new HttpError(400, `${field} is required`, "validation");
  }
  if (typeof v !== "string") throw new HttpError(400, `${field} must be text`, "validation");
  const s = v.trim();
  if (opts.min !== undefined && s.length < opts.min) throw new HttpError(400, `${field} must be at least ${opts.min} characters`, "validation");
  if (s.length > (opts.max ?? 500)) throw new HttpError(400, `${field} must be at most ${opts.max ?? 500} characters`, "validation");
  return s;
};

export const num = (v: unknown, field: string, opts: { min?: number; max?: number } = {}): number => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new HttpError(400, `${field} must be a number`, "validation");
  if (opts.min !== undefined && n < opts.min) throw new HttpError(400, `${field} must be at least ${opts.min}`, "validation");
  if (opts.max !== undefined && n > opts.max) throw new HttpError(400, `${field} must be at most ${opts.max}`, "validation");
  return n;
};

export const oneOf = <T extends string>(v: unknown, field: string, values: readonly T[], fallback?: T): T => {
  if ((v === undefined || v === null || v === "") && fallback !== undefined) return fallback;
  if (typeof v !== "string" || !(values as readonly string[]).includes(v)) throw new HttpError(400, `${field} must be one of ${values.join(", ")}`, "validation");
  return v as T;
};

export function httpUrl(v: unknown, field: string, opts: { optional?: boolean } = {}): string {
  const s = str(v, field, { max: 2048, optional: opts.optional });
  if (!s) return "";
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError(400, `${field} must be a URL`, "validation");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new HttpError(400, `${field} must be an http(s) URL`, "validation");
  u.hash = "";
  return u.toString();
}

export const email = (v: unknown, field = "email"): string => {
  const s = str(v, field, { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, `${field} must be an e-mail address`, "validation");
  return s;
};

export const newId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
