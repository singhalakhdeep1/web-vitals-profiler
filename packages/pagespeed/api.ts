// PageSpeed Insights API client: runs Lighthouse remotely (lab data) and returns CrUX field data when Google has it.
// https://developers.google.com/speed/docs/insights/v5/get-started

export type Strategy = "desktop" | "mobile";
export type Category = "performance" | "accessibility" | "best-practices" | "seo" | "pwa";
export const ALL_CATEGORIES: Category[] = ["performance", "accessibility", "best-practices", "seo", "pwa"];

export interface LabMetrics {
  "first-contentful-paint": number;
  "largest-contentful-paint": number;
  "total-blocking-time": number;
  "cumulative-layout-shift": number;
  "speed-index": number;
  interactive: number;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  /** Estimated saving in milliseconds. */
  savingsMs: number;
  score: number | null;
}

export interface PageSpeedResult {
  url: string;
  strategy: Strategy;
  /** 0-100 per category (null when the category was not run). */
  performance: number;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  pwa: number | null;
  metrics: LabMetrics;
  opportunities: Opportunity[];
  /** Chrome UX Report p75 values for the URL, when available. */
  field?: { LCP?: number; CLS?: number; INP?: number; FCP?: number; TTFB?: number; overall?: string };
  lighthouseVersion?: string;
  fetchedAt: string;
}

export class PageSpeedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PageSpeedError";
  }
}

interface RawAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  numericValue?: number;
  details?: { type?: string; overallSavingsMs?: number };
}

interface RawResponse {
  id: string;
  loadingExperience?: { overall_category?: string; metrics?: Record<string, { percentile: number }> };
  lighthouseResult?: {
    lighthouseVersion?: string;
    categories: Record<string, { score: number | null } | undefined>;
    audits: Record<string, RawAudit>;
  };
  error?: { code: number; message: string };
}

const score = (c?: { score: number | null }): number | null => (c && c.score !== null ? Math.round(c.score * 100) : null);
const num = (audits: Record<string, RawAudit>, id: string): number => audits[id]?.numericValue ?? 0;

export class PageSpeedInsightsService {
  constructor(
    private readonly apiKey?: string,
    private readonly baseUrl = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
    private readonly timeoutMs = 90_000,
  ) {}

  /** The raw API response. */
  async analyzeUrl(url: string, strategy: Strategy = "mobile", categories: Category[] = ALL_CATEGORIES): Promise<RawResponse> {
    const params = new URLSearchParams({ url, strategy });
    // performance is always run: the lab metrics come from it
    for (const c of new Set<Category>(["performance", ...categories])) params.append("category", c);
    if (this.apiKey) params.set("key", this.apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}?${params}`, { signal: controller.signal });
      const data = (await res.json().catch(() => ({}))) as RawResponse;
      if (!res.ok || data.error) throw new PageSpeedError(data.error?.message ?? `PageSpeed Insights answered ${res.status}`, res.status === 200 ? 502 : res.status);
      if (!data.lighthouseResult) throw new PageSpeedError("PageSpeed Insights returned no Lighthouse result", 502);
      return data;
    } catch (e) {
      if (e instanceof PageSpeedError) throw e;
      throw new PageSpeedError(controller.signal.aborted ? "PageSpeed Insights timed out" : `PageSpeed Insights is unreachable: ${(e as Error).message}`, 504);
    } finally {
      clearTimeout(timer);
    }
  }

  /** A normalized report: category scores, lab metrics, the biggest opportunities and field data. */
  async run(url: string, strategy: Strategy = "mobile", categories: Category[] = ALL_CATEGORIES): Promise<PageSpeedResult> {
    const data = await this.analyzeUrl(url, strategy, categories);
    const lh = data.lighthouseResult!;
    const audits = lh.audits;
    const opportunities = Object.values(audits)
      .filter((a) => a.details?.type === "opportunity" && (a.details.overallSavingsMs ?? 0) > 0)
      .map((a) => ({ id: a.id, title: a.title, description: a.description, savingsMs: Math.round(a.details!.overallSavingsMs!), score: a.score }))
      .sort((a, b) => b.savingsMs - a.savingsMs)
      .slice(0, 10);
    const fm = data.loadingExperience?.metrics ?? {};
    const field = data.loadingExperience?.metrics
      ? {
          LCP: fm.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
          CLS: fm.CUMULATIVE_LAYOUT_SHIFT_SCORE ? fm.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : undefined,
          INP: fm.INTERACTION_TO_NEXT_PAINT?.percentile,
          FCP: fm.FIRST_CONTENTFUL_PAINT_MS?.percentile,
          TTFB: fm.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile,
          overall: data.loadingExperience?.overall_category,
        }
      : undefined;
    return {
      url: data.id ?? url,
      strategy,
      performance: score(lh.categories.performance) ?? 0,
      accessibility: score(lh.categories.accessibility),
      bestPractices: score(lh.categories["best-practices"]),
      seo: score(lh.categories.seo),
      pwa: score(lh.categories.pwa),
      metrics: {
        "first-contentful-paint": num(audits, "first-contentful-paint"),
        "largest-contentful-paint": num(audits, "largest-contentful-paint"),
        "total-blocking-time": num(audits, "total-blocking-time"),
        "cumulative-layout-shift": num(audits, "cumulative-layout-shift"),
        "speed-index": num(audits, "speed-index"),
        interactive: num(audits, "interactive"),
      },
      opportunities,
      field,
      lighthouseVersion: lh.lighthouseVersion,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export default PageSpeedInsightsService;
