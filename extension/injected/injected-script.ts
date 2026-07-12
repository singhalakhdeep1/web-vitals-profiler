import { initWebVitalsMonitoring } from "@wvp/performance/monitor";
import type { VitalMetric } from "@wvp/types";

const SOURCE = "wvp-injected";

function notify(type: string, payload: unknown): void {
  window.postMessage({ source: SOURCE, type, payload }, "*");
}

notify("INJECTED_READY", { url: window.location.href, timestamp: Date.now() });

const url = window.location.href;

initWebVitalsMonitoring((metric: VitalMetric) => {
  notify("VITALS_UPDATE", metric);
}, url);

console.info("[Web Vitals Profiler] Monitoring active on", url);

export {};
