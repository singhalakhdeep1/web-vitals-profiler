/**
 * Speed optimization: resource and critical-path analysis on serializable resource-timing data (collected in the page
 * by the extension), producing concrete recommendations.
 */

/** The fields of a PerformanceResourceTiming entry the analysis needs (plain data, so it can cross contexts). */
export interface ResourceEntry {
  name: string;
  initiatorType: string;
  startTime: number;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  renderBlockingStatus?: string;
  /** For images: whether the element is in the first viewport (set by the collector when known). */
  aboveTheFold?: boolean;
}

export interface NavigationSummary {
  ttfb: number;
  domContentLoaded: number;
  loadEvent: number;
  /** URL of the LCP element's resource, when it was an image. */
  lcpResource?: string;
  lcp?: number;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
  resources?: string[];
}

export interface ResourceAnalysis {
  totalRequests: number;
  totalTransferBytes: number;
  byType: Record<string, { count: number; bytes: number }>;
  renderBlocking: ResourceEntry[];
  largeResources: ResourceEntry[];
  slowResources: ResourceEntry[];
  thirdParty: { origin: string; count: number; bytes: number; time: number }[];
  uncompressed: ResourceEntry[];
  recommendations: Recommendation[];
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i;
const SCRIPT = /\.m?js(\?|$)/i;
const STYLE = /\.css(\?|$)/i;
const FONT = /\.(woff2?|ttf|otf)(\?|$)/i;

function typeOf(r: ResourceEntry): string {
  if (r.initiatorType === "img" || IMAGE.test(r.name)) return "image";
  if (r.initiatorType === "script" || SCRIPT.test(r.name)) return "script";
  if (r.initiatorType === "css" || r.initiatorType === "link" ? STYLE.test(r.name) : STYLE.test(r.name)) return "stylesheet";
  if (FONT.test(r.name)) return "font";
  if (r.initiatorType === "fetch" || r.initiatorType === "xmlhttprequest") return "fetch";
  return "other";
}

const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

const short = (url: string): string => {
  try {
    const u = new URL(url);
    return u.pathname.split("/").pop() || u.host;
  } catch {
    return url;
  }
};

export class PerformanceAnalysisService {
  constructor(
    private readonly largeBytes = 200 * 1024,
    private readonly slowMs = 1000,
  ) {}

  analyzeResources(resources: ResourceEntry[], pageOrigin: string): ResourceAnalysis {
    const byType: Record<string, { count: number; bytes: number }> = {};
    for (const r of resources) {
      const t = typeOf(r);
      byType[t] ??= { count: 0, bytes: 0 };
      byType[t].count++;
      byType[t].bytes += r.transferSize;
    }
    const renderBlocking = this.detectRenderBlocking(resources);
    const largeResources = resources.filter((r) => r.decodedBodySize > this.largeBytes || r.transferSize > this.largeBytes).sort((a, b) => b.transferSize - a.transferSize);
    const slowResources = resources.filter((r) => r.duration > this.slowMs).sort((a, b) => b.duration - a.duration);
    // text resources whose transfer is close to their decoded size were not compressed (cached entries have transferSize 0)
    const uncompressed = resources.filter((r) => ["script", "stylesheet"].includes(typeOf(r)) && r.transferSize > 2048 && r.encodedBodySize > 0 && r.encodedBodySize >= r.decodedBodySize * 0.95);
    const third = new Map<string, { origin: string; count: number; bytes: number; time: number }>();
    for (const r of resources) {
      const o = originOf(r.name);
      if (!o || o === pageOrigin) continue;
      const e = third.get(o) ?? { origin: o, count: 0, bytes: 0, time: 0 };
      e.count++;
      e.bytes += r.transferSize;
      e.time += r.duration;
      third.set(o, e);
    }
    const analysis: ResourceAnalysis = {
      totalRequests: resources.length,
      totalTransferBytes: resources.reduce((s, r) => s + r.transferSize, 0),
      byType,
      renderBlocking,
      largeResources,
      slowResources,
      thirdParty: [...third.values()].sort((a, b) => b.time - a.time),
      uncompressed,
      recommendations: [],
    };
    analysis.recommendations = this.generateRecommendations(resources, analysis);
    return analysis;
  }

  /** Stylesheets and synchronous scripts that block the first render. */
  private detectRenderBlocking(resources: ResourceEntry[]): ResourceEntry[] {
    return resources.filter((r) => r.renderBlockingStatus === "blocking");
  }

  private generateRecommendations(resources: ResourceEntry[], a: ResourceAnalysis): Recommendation[] {
    const out: Recommendation[] = [];
    if (a.renderBlocking.length) {
      out.push({
        id: "render-blocking",
        title: `Eliminate ${a.renderBlocking.length} render-blocking resource${a.renderBlocking.length > 1 ? "s" : ""}`,
        detail: "Inline critical CSS, load the rest with media queries or preload, and add defer/async to scripts.",
        impact: "high",
        resources: a.renderBlocking.map((r) => short(r.name)),
      });
    }
    const bigImages = a.largeResources.filter((r) => typeOf(r) === "image");
    if (bigImages.length) {
      out.push({ id: "image-size", title: `Optimize ${bigImages.length} large image${bigImages.length > 1 ? "s" : ""}`, detail: "Serve AVIF/WebP at the displayed size with srcset; compress to under 200 KB.", impact: "high", resources: bigImages.map((r) => short(r.name)) });
    }
    const offscreen = resources.filter((r) => typeOf(r) === "image" && r.aboveTheFold === false);
    if (offscreen.length >= 3) {
      out.push({ id: "lazy-load", title: `Lazy-load ${offscreen.length} below-the-fold images`, detail: 'Add loading="lazy" to images outside the first viewport.', impact: "medium", resources: offscreen.map((r) => short(r.name)) });
    }
    const bigScripts = a.largeResources.filter((r) => typeOf(r) === "script");
    if (bigScripts.length) {
      out.push({ id: "code-splitting", title: "Split large JavaScript bundles", detail: "Use dynamic import() for routes and rarely used features so less JavaScript runs at startup.", impact: "high", resources: bigScripts.map((r) => short(r.name)) });
    }
    if (a.uncompressed.length) {
      out.push({ id: "compression", title: `Enable text compression for ${a.uncompressed.length} resource${a.uncompressed.length > 1 ? "s" : ""}`, detail: "Serve scripts and styles with Brotli or gzip.", impact: "medium", resources: a.uncompressed.map((r) => short(r.name)) });
    }
    const fonts = resources.filter((r) => typeOf(r) === "font");
    if (fonts.length) {
      out.push({ id: "font-loading", title: "Optimize font loading", detail: "Preload the main font files and use font-display: swap (or optional) to avoid invisible text.", impact: "low", resources: fonts.map((r) => short(r.name)) });
    }
    const heavyThird = a.thirdParty.filter((t) => t.time > 500);
    if (heavyThird.length) {
      out.push({ id: "third-party", title: `Reduce third-party impact (${heavyThird.length} origin${heavyThird.length > 1 ? "s" : ""})`, detail: "Defer or remove third-party scripts, and add preconnect for the ones you keep.", impact: "medium", resources: heavyThird.map((t) => t.origin) });
    }
    const crossOrigins = new Set(a.thirdParty.slice(0, 3).map((t) => t.origin));
    if (crossOrigins.size) out.push({ id: "preconnect", title: "Preconnect to required origins", detail: `Add <link rel="preconnect"> for ${[...crossOrigins].join(", ")}.`, impact: "low" });
    return out;
  }
}

export interface CriticalPathAnalysis {
  bottlenecks: { phase: string; ms: number; detail: string }[];
  lcpResource?: { url: string; startTime: number; duration: number; preloadSuggested: boolean };
  recommendations: Recommendation[];
}

export class CriticalPathService {
  analyzeCriticalPath(nav: NavigationSummary, resources: ResourceEntry[]): CriticalPathAnalysis {
    const bottlenecks = this.identifyBottlenecks(nav, resources);
    const recommendations: Recommendation[] = [];
    let lcpResource: CriticalPathAnalysis["lcpResource"];
    if (nav.lcpResource) {
      const r = resources.find((x) => x.name === nav.lcpResource);
      if (r) {
        const preloadSuggested = r.startTime > 500;
        lcpResource = { url: r.name, startTime: Math.round(r.startTime), duration: Math.round(r.duration), preloadSuggested };
        if (preloadSuggested) recommendations.push({ id: "preload-lcp", title: "Preload the LCP image", detail: `The largest image starts loading at ${Math.round(r.startTime)} ms. Add <link rel="preload" as="image" fetchpriority="high"> for ${short(r.name)}.`, impact: "high", resources: [short(r.name)] });
      }
    }
    if (nav.ttfb > 800) recommendations.push({ id: "server-response", title: "Reduce server response time", detail: `TTFB is ${Math.round(nav.ttfb)} ms. Cache HTML at the edge (CDN) and avoid redirects.`, impact: "high" });
    return { bottlenecks, lcpResource, recommendations };
  }

  private identifyBottlenecks(nav: NavigationSummary, resources: ResourceEntry[]): CriticalPathAnalysis["bottlenecks"] {
    const out: CriticalPathAnalysis["bottlenecks"] = [];
    if (nav.ttfb > 600) out.push({ phase: "server", ms: Math.round(nav.ttfb), detail: "Waiting for the first byte of HTML" });
    const blockingEnd = Math.max(0, ...resources.filter((r) => r.renderBlockingStatus === "blocking").map((r) => r.startTime + r.duration));
    if (blockingEnd > nav.ttfb + 300) out.push({ phase: "render-blocking", ms: Math.round(blockingEnd - nav.ttfb), detail: "CSS and scripts that must load before the first paint" });
    if (nav.lcp && nav.lcp > 2500) out.push({ phase: "lcp", ms: Math.round(nav.lcp), detail: "Largest contentful paint is slower than 2.5 s" });
    if (nav.loadEvent - nav.domContentLoaded > 2000) out.push({ phase: "load", ms: Math.round(nav.loadEvent - nav.domContentLoaded), detail: "Sub-resources keep loading long after the DOM is ready" });
    return out.sort((a, b) => b.ms - a.ms);
  }
}
