import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import type { VitalMetric } from "@wvp/types";
import { fromWebVitalMetric, initTBTObserver } from "./index";

/** Initializes all Core Web Vitals collectors in page context. */
export function initWebVitalsMonitoring(
  onMetric: (metric: VitalMetric) => void,
  url = window.location.href,
): () => void {
  const handleMetric = (metric: Metric) => {
    const vital = fromWebVitalMetric(metric, url);
    if (vital) onMetric(vital);
  };

  // every change is reported, so the live views update while the page is in use (the final value has the same id)
  const live = { reportAllChanges: true };
  onCLS(handleMetric, live);
  onFCP(handleMetric, live);
  onINP(handleMetric, live);
  onLCP(handleMetric, live);
  onTTFB(handleMetric, live);

  const cleanupTBT = initTBTObserver(onMetric, url);

  return () => {
    cleanupTBT();
  };
}

/** Re-export for injected script convenience. */
export { createVitalMetric, formatVitalValue } from "./index";
