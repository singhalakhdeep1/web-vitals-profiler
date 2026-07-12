/** Core Web Vitals metric names tracked by the extension. */
export type VitalName = "LCP" | "CLS" | "INP" | "TTFB" | "FCP" | "TBT";

/** A single performance metric reading. */
export interface VitalMetric {
  name: VitalName;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta: number;
  id: string;
  navigationType: string;
  timestamp: number;
  url: string;
  tabId?: number;
}

/** Latest vitals snapshot for a tab. */
export interface VitalsSnapshot {
  tabId: number;
  url: string;
  metrics: Partial<Record<VitalName, VitalMetric>>;
  updatedAt: number;
}

/** Historical session record. */
export interface SessionRecord {
  id: string;
  url: string;
  title: string;
  metrics: VitalMetric[];
  startedAt: number;
  endedAt: number;
}

/** Regression detection result. */
export interface RegressionReport {
  metric: VitalName;
  url: string;
  previousAvg: number;
  currentAvg: number;
  changePercent: number;
  regressed: boolean;
  severity: "none" | "minor" | "major";
}

/** Extension message types for cross-context communication. */
export type MessageType =
  | "PING"
  | "PONG"
  | "GET_TAB_INFO"
  | "TAB_INFO"
  | "VITALS_UPDATE"
  | "GET_VITALS"
  | "GET_VITALS_HISTORY"
  | "GET_REGRESSIONS"
  | "EXTENSION_READY"
  | "OVERLAY_TOGGLE"
  | "EXPORT_REPORT"
  | "VITALS_STREAM"
  | "GET_SESSIONS"
  | "CLEAR_DATA";

/** Base message envelope sent between extension contexts. */
export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload?: T;
  tabId?: number;
  timestamp: number;
}

/** Tab metadata returned by the background service worker. */
export interface TabInfo {
  tabId: number;
  url: string;
  title: string;
}

/** Extension runtime state stored in chrome.storage. */
export interface ExtensionState {
  version: string;
  installedAt: number;
  lastActiveTabId?: number;
  overlayEnabled: boolean;
  slackWebhookUrl?: string;
}

/** Response wrapper for typed message handlers. */
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Export report format options. */
export interface ExportOptions {
  format: "json" | "csv" | "html";
  url?: string;
  dateRange?: { from: number; to: number };
}

/** Port message for DevTools streaming. */
export interface VitalsStreamMessage {
  type: "vitals" | "timeline" | "connected";
  snapshot?: VitalsSnapshot;
  metric?: VitalMetric;
}
