// Runs in the page's own JavaScript world (manifest content script with world: "MAIN"): measures the vitals with the
// real PerformanceObserver timeline and posts them to the isolated content script.
import { initWebVitalsMonitoring } from "@wvp/performance/monitor";
import type { PageResources, VitalMetric } from "@wvp/types";

const SOURCE = "wvp-injected";

function notify(type: string, payload: unknown): void {
  window.postMessage({ source: SOURCE, type, payload }, "*");
}

const connection = (): string | undefined => (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;

notify("INJECTED_READY", { url: window.location.href, timestamp: Date.now() });

initWebVitalsMonitoring((metric: VitalMetric) => {
  notify("VITALS_UPDATE", { ...metric, url: window.location.href, connection: connection() });
}, window.location.href);

/* ---- resource timing for the speed analysis (render-blocking, large, third-party resources, LCP resource) ---- */

let lcp: { startTime: number; url?: string } | undefined;
try {
  new PerformanceObserver((list) => {
    const last = list.getEntries().at(-1) as (PerformanceEntry & { url?: string }) | undefined;
    if (last) lcp = { startTime: last.startTime, url: last.url || undefined };
  }).observe({ type: "largest-contentful-paint", buffered: true });
} catch {
  /* not supported */
}

function collectResources(): PageResources {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const resources = (performance.getEntriesByType("resource") as (PerformanceResourceTiming & { renderBlockingStatus?: string })[]).slice(0, 300).map((r) => ({
    name: r.name,
    initiatorType: r.initiatorType,
    startTime: Math.round(r.startTime),
    duration: Math.round(r.duration),
    transferSize: r.transferSize,
    encodedBodySize: r.encodedBodySize,
    decodedBodySize: r.decodedBodySize,
    renderBlockingStatus: r.renderBlockingStatus,
  }));
  return {
    url: window.location.href,
    resources,
    navigation: {
      ttfb: nav ? Math.round(nav.responseStart) : 0,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      loadEvent: nav ? Math.round(nav.loadEventEnd) : 0,
      lcp: lcp ? Math.round(lcp.startTime) : undefined,
      lcpResource: lcp?.url,
    },
    collectedAt: Date.now(),
  };
}

const report = () => notify("PAGE_RESOURCES", collectResources());
if (document.readyState === "complete") setTimeout(report, 1500);
else window.addEventListener("load", () => setTimeout(report, 1500), { once: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") report();
});

console.info("[Web Vitals Profiler] Monitoring active on", window.location.href);

export {};
