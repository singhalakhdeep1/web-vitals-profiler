import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import type { VitalMetric } from "@wvp/types";
import { createVitalMetric, fromWebVitalMetric, initTBTObserver } from "./index";

/** Initializes all Core Web Vitals collectors in page context. */
export function initWebVitalsMonitoring(
  onMetric: (metric: VitalMetric) => void,
  url = window.location.href,
): () => void {
  const handleMetric = (metric: Metric) => {
    const vital = fromWebVitalMetric(metric, url);
    if (vital) onMetric(vital);
  };

  onCLS(handleMetric);
  onFCP(handleMetric);
  onINP(handleMetric);
  onLCP(handleMetric);
  onTTFB(handleMetric);

  const cleanupTBT = initTBTObserver(onMetric, url);

  return () => {
    cleanupTBT();
  };
}

/** Re-export for injected script convenience. */
export { createVitalMetric, formatVitalValue } from "./index";
