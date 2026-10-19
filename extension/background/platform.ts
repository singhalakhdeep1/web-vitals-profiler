/** Picks the browser-specific background adapter at runtime (one background bundle serves every browser). */
import { edgeAdapter } from "./edge";
import { firefoxAdapter } from "./firefox";
import { safariAdapter } from "./safari";

export interface PlatformAdapter {
  name: "chromium" | "firefox" | "safari";
  hasSidePanel: boolean;
  /** "Edge 141", "Firefox 132", ... (stored with synced samples for browser analytics). */
  browserName(userAgent: string): string;
  setup(): Promise<void>;
}

export function detectPlatform(userAgent = navigator.userAgent): PlatformAdapter {
  if (/Firefox\//.test(userAgent)) return firefoxAdapter;
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return safariAdapter;
  return edgeAdapter;
}

/** Device class from the user agent (mobile browsers that run extensions: Firefox for Android, Safari on iOS). */
export function deviceClass(userAgent = navigator.userAgent): "desktop" | "mobile" | "tablet" {
  if (/iPad|Tablet/.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone/.test(userAgent)) return "mobile";
  return "desktop";
}
