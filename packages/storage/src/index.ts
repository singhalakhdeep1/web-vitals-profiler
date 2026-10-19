import Dexie, { type Table } from "dexie";
import type { RegressionReport, SessionRecord, VitalMetric, VitalName } from "@wvp/types";

export class VitalsDatabase extends Dexie {
  metrics!: Table<VitalMetric, string>;
  sessions!: Table<SessionRecord, string>;

  constructor() {
    super("WebVitalsProfiler");
    this.version(1).stores({
      metrics: "id, name, url, timestamp, tabId",
      sessions: "id, url, startedAt, endedAt",
    });
  }
}

export const db = new VitalsDatabase();

/** Persists a vital metric to IndexedDB. */
export async function saveMetric(metric: VitalMetric): Promise<void> {
  await db.metrics.put(metric);
}

/** Retrieves metrics with optional filters. */
export async function getMetrics(filters?: {
  url?: string;
  name?: VitalName;
  from?: number;
  to?: number;
  limit?: number;
}): Promise<VitalMetric[]> {
  const collection = db.metrics.orderBy("timestamp").reverse();

  const all = await collection.toArray();

  return all
    .filter((m) => {
      if (filters?.url && !m.url.includes(filters.url)) return false;
      if (filters?.name && m.name !== filters.name) return false;
      if (filters?.from && m.timestamp < filters.from) return false;
      if (filters?.to && m.timestamp > filters.to) return false;
      return true;
    })
    .slice(0, filters?.limit ?? 500);
}

/** Saves a browsing session with its metrics. */
export async function saveSession(session: SessionRecord): Promise<void> {
  await db.sessions.put(session);
}

/** Retrieves recent sessions. */
export async function getSessions(limit = 20): Promise<SessionRecord[]> {
  return db.sessions.orderBy("startedAt").reverse().limit(limit).toArray();
}

/** Computes average value for a metric on a URL. */
export async function getAverageMetric(
  name: VitalName,
  url: string,
  since?: number,
): Promise<number | null> {
  const metrics = await getMetrics({ url, name, from: since });
  if (metrics.length === 0) return null;
  return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
}

/** Detects performance regressions by comparing recent vs historical averages. */
export async function detectRegressions(url: string): Promise<RegressionReport[]> {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const vitalNames: VitalName[] = ["LCP", "CLS", "INP", "TTFB", "FCP", "TBT"];
  const reports: RegressionReport[] = [];

  for (const name of vitalNames) {
    const historicalAvg = await getAverageMetric(name, url, now - week * 4);
    const recentAvg = await getAverageMetric(name, url, now - week);

    if (historicalAvg === null || recentAvg === null) continue;

    const changePercent = ((recentAvg - historicalAvg) / historicalAvg) * 100;
    const regressed = changePercent > 10;
    const severity =
      changePercent > 50 ? "major" : changePercent > 20 ? "minor" : "none";

    reports.push({
      metric: name,
      url,
      previousAvg: Math.round(historicalAvg * 100) / 100,
      currentAvg: Math.round(recentAvg * 100) / 100,
      changePercent: Math.round(changePercent),
      regressed,
      severity: regressed ? severity : "none",
    });
  }

  return reports;
}

/** Exports metrics as JSON string. */
export async function exportMetricsJson(url?: string): Promise<string> {
  const metrics = await getMetrics(url ? { url } : undefined);
  return JSON.stringify(metrics, null, 2);
}

/** Exports metrics as CSV string. */
export async function exportMetricsCsv(url?: string): Promise<string> {
  const metrics = await getMetrics(url ? { url } : undefined);
  const header = "id,name,value,rating,url,timestamp\n";
  const rows = metrics
    .map(
      (m) =>
        `${m.id},${m.name},${m.value},${m.rating},"${m.url}",${m.timestamp}`,
    )
    .join("\n");
  return header + rows;
}

/** Clears all stored metrics and sessions. */
export async function clearAllData(): Promise<void> {
  await db.metrics.clear();
  await db.sessions.clear();
}

// --- chrome.storage helpers for extension state ---

import type { ExtensionState } from "@wvp/types";

const STATE_KEY = "wvp:state";

export async function getExtensionState(): Promise<ExtensionState | null> {
  const result = await chrome.storage.local.get(STATE_KEY);
  return (result[STATE_KEY] as ExtensionState) ?? null;
}

export async function setExtensionState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

export async function getSetting<K extends keyof ExtensionState>(
  key: K,
): Promise<ExtensionState[K] | undefined> {
  const state = await getExtensionState();
  return state?.[key];
}

export async function updateSetting<K extends keyof ExtensionState>(
  key: K,
  value: ExtensionState[K],
): Promise<void> {
  const state = (await getExtensionState()) ?? {
    version: "1.0.0",
    installedAt: Date.now(),
    overlayEnabled: true,
  };
  await setExtensionState({ ...state, [key]: value });
}
