import { ApiError, getSyncSettings, updateSyncSettings, uploadSamples, type UploadSample } from "@wvp/api-client";
import { CriticalPathService, PerformanceAnalysisService } from "@wvp/core";
import { createMessage, onMessage } from "@wvp/messaging";
import { registerBackgroundSync, UploadQueue } from "@wvp/service-worker";
import {
  clearAllData,
  detectRegressions,
  exportMetricsCsv,
  exportMetricsJson,
  getExtensionState,
  getMetrics,
  saveMetric,
  saveSession,
  getSessions,
  setExtensionState,
  updateSetting,
} from "@wvp/storage";
import { exportMetricsHtml, sendSlackNotification } from "@wvp/storage/reports";
import type { PageResources, SyncStatus, TabInfo, VitalMetric, VitalsSnapshot } from "@wvp/types";
import { generateId, logger } from "@wvp/utils";
import { detectPlatform, deviceClass } from "./platform";

const platform = detectPlatform();
logger.info("Background service worker initialized", { platform: platform.name });

/* ---- cloud sync: measured vitals are queued and uploaded to the user's sync server ---- */

const uploads = new UploadQueue<UploadSample & { connection?: string }>({
  storageKey: "wvp:upload-queue",
  batchSize: 200,
  send: async (batch) => {
    // one request per connection type, so the server can segment by network
    const groups = new Map<string, UploadSample[]>();
    for (const { connection, ...s } of batch) (groups.get(connection ?? "") ?? groups.set(connection ?? "", []).get(connection ?? "")!).push(s);
    for (const [connection, samples] of groups) {
      await uploadSamples(samples, { device: deviceClass(), browser: platform.browserName(navigator.userAgent), connection: connection || undefined });
    }
    await updateSyncSettings({ lastSyncAt: Date.now(), lastError: undefined });
  },
  // signed out or the account is gone: retrying is pointless until the user signs in again
  isPermanent: (e) => e instanceof ApiError && (e.status === 401 || e.code === "unauthenticated"),
});

let flushTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFlush(): void {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flushUploads(false), 5_000);
}

async function flushUploads(force: boolean): Promise<void> {
  const settings = await getSyncSettings();
  if (!settings.enabled || !settings.token) return;
  try {
    await uploads.flush(force);
  } catch (e) {
    await updateSyncSettings({ lastError: (e as Error).message });
  }
}

async function queueForSync(metric: VitalMetric): Promise<void> {
  const settings = await getSyncSettings();
  if (!settings.enabled || !settings.token || !/^https?:/.test(metric.url)) return;
  await uploads.enqueue([{ id: metric.id, name: metric.name, value: metric.value, url: metric.url, timestamp: metric.timestamp, navigationType: metric.navigationType, connection: metric.connection }]);
  scheduleFlush();
}

// retries queued uploads every minute (also after the browser was offline or the worker was stopped)
registerBackgroundSync("wvp-sync", 1, () => flushUploads(false));

/* ---- the measuring script in every page's own JavaScript world ---- */

const MAIN_WORLD_SCRIPT = { id: "wvp-main-world", js: ["injected/injected-script.js"], matches: ["http://*/*", "https://*/*"], runAt: "document_start" as const, world: "MAIN" as const };

async function registerMainWorldScript(): Promise<void> {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [MAIN_WORLD_SCRIPT.id] });
    if (!existing.length) await chrome.scripting.registerContentScripts([MAIN_WORLD_SCRIPT]);
  } catch (error) {
    logger.error("Could not register the page measuring script", error);
  }
}
void registerMainWorldScript();

/* ---- speed analysis of the page's resources ---- */

const resourcesByTab = new Map<number, PageResources>();
const resourceAnalysis = new PerformanceAnalysisService();
const criticalPath = new CriticalPathService();

const vitalsByTab = new Map<number, VitalsSnapshot>();
const timeline: VitalMetric[] = [];
const streamPorts = new Set<chrome.runtime.Port>();

function getOrCreateSnapshot(tabId: number, url: string): VitalsSnapshot {
  const existing = vitalsByTab.get(tabId);
  if (existing) return existing;
  const snapshot: VitalsSnapshot = { tabId, url, metrics: {}, updatedAt: Date.now() };
  vitalsByTab.set(tabId, snapshot);
  return snapshot;
}

function updateSnapshot(tabId: number, metric: VitalMetric): VitalsSnapshot {
  const snapshot = getOrCreateSnapshot(tabId, metric.url);
  snapshot.metrics[metric.name] = { ...metric, tabId };
  snapshot.url = metric.url;
  snapshot.updatedAt = Date.now();
  vitalsByTab.set(tabId, snapshot);
  timeline.push(metric);
  if (timeline.length > 200) timeline.shift();
  return snapshot;
}

function broadcastToStreams(snapshot: VitalsSnapshot, metric: VitalMetric): void {
  for (const port of streamPorts) {
    port.postMessage({ type: "vitals", snapshot, metric });
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const manifest = chrome.runtime.getManifest();
  const existing = await getExtensionState();

  if (!existing) {
    await setExtensionState({
      version: manifest.version,
      installedAt: Date.now(),
      overlayEnabled: true,
    });
  }

  logger.info(`Extension ${details.reason}`, { version: manifest.version });

  await platform.setup();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "wvp-devtools") return;
  streamPorts.add(port);
  port.postMessage({ type: "connected" });

  port.onMessage.addListener((msg: { type: string; tabId?: number }) => {
    if (msg.type === "get-snapshot" && msg.tabId) {
      const snapshot = vitalsByTab.get(msg.tabId);
      if (snapshot) port.postMessage({ type: "vitals", snapshot });
    }
    if (msg.type === "get-timeline") {
      port.postMessage({ type: "timeline", metrics: timeline.slice(-50) });
    }
  });

  port.onDisconnect.addListener(() => streamPorts.delete(port));
});

onMessage({
  PING: () => ({ success: true, data: "PONG" }),

  GET_TAB_INFO: async (_message, sender) => {
    try {
      const tabId = sender.tab?.id;
      if (!tabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) return { success: false, error: "No active tab found" };
        const tabInfo: TabInfo = {
          tabId: activeTab.id,
          url: activeTab.url ?? "",
          title: activeTab.title ?? "",
        };
        return { success: true, data: tabInfo };
      }
      return {
        success: true,
        data: { tabId, url: sender.tab?.url ?? "", title: sender.tab?.title ?? "" } satisfies TabInfo,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to get tab info" };
    }
  },

  EXTENSION_READY: () => ({ success: true, data: { ready: true } }),

  VITALS_UPDATE: async (message, sender) => {
    const metric = message.payload as VitalMetric;
    const tabId = sender.tab?.id ?? message.tabId;
    if (!tabId || !metric) return { success: false, error: "Invalid vitals update" };

    const enriched = { ...metric, tabId, id: metric.id || generateId() };
    const snapshot = updateSnapshot(tabId, enriched);

    void saveMetric(enriched).catch((err) => logger.error("Failed to save metric", err));
    void queueForSync(enriched).catch((err) => logger.error("Failed to queue metric for sync", err));
    broadcastToStreams(snapshot, enriched);

    chrome.tabs.sendMessage(tabId, createMessage("VITALS_UPDATE", snapshot)).catch(() => {});
    void chrome.runtime.sendMessage(createMessage("VITALS_UPDATE", snapshot)).catch(() => {});

    return { success: true, data: snapshot };
  },

  GET_VITALS: (message, sender) => {
    const tabId = sender.tab?.id ?? message.tabId;
    if (!tabId) {
      const [first] = vitalsByTab.values();
      return { success: true, data: first ?? null };
    }
    return { success: true, data: vitalsByTab.get(tabId) ?? null };
  },

  GET_VITALS_HISTORY: async (message) => {
    const { url, limit } = (message.payload as { url?: string; limit?: number }) ?? {};
    const metrics = await getMetrics({ url, limit });
    return { success: true, data: metrics };
  },

  GET_REGRESSIONS: async (message) => {
    const { url } = (message.payload as { url: string }) ?? {};
    if (!url) return { success: false, error: "URL required" };
    const reports = await detectRegressions(url);
    return { success: true, data: reports };
  },

  OVERLAY_TOGGLE: async (message) => {
    const enabled = (message.payload as { enabled: boolean }).enabled;
    await updateSetting("overlayEnabled", enabled);
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, createMessage("OVERLAY_TOGGLE", { enabled })).catch(() => {});
      }
    }
    return { success: true, data: { enabled } };
  },

  EXPORT_REPORT: async (message) => {
    const { format, url, sendSlack } = (message.payload as {
      format: "json" | "csv" | "html";
      url?: string;
      sendSlack?: boolean;
    }) ?? { format: "json" };

    let content: string;
    if (format === "html") content = await exportMetricsHtml(url);
    else if (format === "csv") content = await exportMetricsCsv(url);
    else content = await exportMetricsJson(url);

    if (sendSlack) {
      const state = await getExtensionState();
      if (state?.slackWebhookUrl) {
        const metrics = await getMetrics({ url, limit: 10 });
        const pageUrl = url ?? metrics[0]?.url ?? "All pages";
        const slackSent = await sendSlackNotification(state.slackWebhookUrl, metrics, pageUrl);
        return { success: true, data: { content, format, slackSent } };
      }
    }

    return { success: true, data: { content, format, slackSent: false } };
  },

  GET_SESSIONS: async (message) => {
    const { limit } = (message.payload as { limit?: number }) ?? {};
    const sessions = await getSessions(limit ?? 20);
    return { success: true, data: sessions };
  },

  CLEAR_DATA: async () => {
    await clearAllData();
    await uploads.clear();
    return { success: true };
  },

  SYNC_STATUS: async () => {
    const s = await getSyncSettings();
    const status: SyncStatus = { enabled: s.enabled, signedIn: Boolean(s.token), user: s.user, apiUrl: s.apiUrl, queued: await uploads.size(), lastSyncAt: s.lastSyncAt, lastError: s.lastError ?? (await uploads.state()).lastError };
    return { success: true, data: status };
  },

  SYNC_NOW: async () => {
    await flushUploads(true);
    const s = await getSyncSettings();
    return { success: !s.lastError, data: { queued: await uploads.size(), lastSyncAt: s.lastSyncAt }, error: s.lastError };
  },

  PAGE_RESOURCES: (message, sender) => {
    const tabId = sender.tab?.id;
    if (tabId) resourcesByTab.set(tabId, message.payload as PageResources);
    return { success: true };
  },

  GET_PAGE_ANALYSIS: (message) => {
    const tabId = (message.payload as { tabId?: number } | undefined)?.tabId ?? message.tabId;
    const page = tabId ? resourcesByTab.get(tabId) : undefined;
    if (!page) return { success: true, data: null };
    const origin = new URL(page.url).origin;
    return {
      success: true,
      data: { url: page.url, collectedAt: page.collectedAt, resources: resourceAnalysis.analyzeResources(page.resources, origin), criticalPath: criticalPath.analyzeCriticalPath(page.navigation, page.resources) },
    };
  },
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CLEAR_DATA") {
    void clearAllData().then(() => sendResponse({ success: true }));
    return true;
  }
  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    vitalsByTab.delete(tabId);
    void chrome.runtime.sendMessage(
      createMessage("TAB_INFO", { tabId, url: tab.url, title: tab.title ?? "" }),
    );
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  resourcesByTab.delete(tabId);
  const snapshot = vitalsByTab.get(tabId);
  if (snapshot && Object.keys(snapshot.metrics).length > 0) {
    void saveSession({
      id: generateId(),
      url: snapshot.url,
      title: snapshot.url,
      metrics: Object.values(snapshot.metrics).filter(Boolean) as VitalMetric[],
      startedAt: snapshot.updatedAt - 60_000,
      endedAt: snapshot.updatedAt,
    });
  }
  vitalsByTab.delete(tabId);
});

export {};
