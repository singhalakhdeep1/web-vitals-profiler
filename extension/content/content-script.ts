import { createMessage, onMessage } from "@wvp/messaging";
import type { VitalsSnapshot } from "@wvp/types";
import { formatVitalValue } from "@wvp/performance";
import { logger } from "@wvp/utils";

logger.info("Content script loaded", { url: window.location.href });

const OVERLAY_ID = "wvp-overlay";

function injectPageScript(): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected/injected-script.js");
  script.type = "module";
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

function createOverlay(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
    background: rgba(15, 23, 42, 0.92); color: #f8fafc; font-family: system-ui, sans-serif;
    font-size: 12px; border-radius: 10px; padding: 12px 14px; min-width: 200px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3); backdrop-filter: blur(8px);
    pointer-events: none; transition: opacity 0.2s;
  `;
  overlay.innerHTML = `<div style="font-weight:600;margin-bottom:8px;font-size:11px;opacity:0.7">WEB VITALS</div>
    <div id="wvp-overlay-metrics">Collecting…</div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function updateOverlay(snapshot: VitalsSnapshot): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay || overlay.style.display === "none") return;

  const container = document.getElementById("wvp-overlay-metrics");
  if (!container) return;

  const names = ["LCP", "CLS", "INP", "FCP", "TTFB", "TBT"] as const;
  const rows = names
    .map((name) => {
      const m = snapshot.metrics[name];
      if (!m) return `<div style="opacity:0.5">${name}: —</div>`;
      const color = m.rating === "good" ? "#34d399" : m.rating === "needs-improvement" ? "#fbbf24" : "#f87171";
      return `<div style="display:flex;justify-content:space-between;gap:12px;margin:2px 0">
        <span>${name}</span><span style="color:${color};font-family:monospace">${formatVitalValue(name, m.value)}</span>
      </div>`;
    })
    .join("");
  container.innerHTML = rows;
}

function setOverlayVisible(visible: boolean): void {
  if (!document.body) return;
  const overlay = createOverlay();
  overlay.style.display = visible ? "block" : "none";
}

injectPageScript();

void chrome.storage.local.get("wvp:state").then((result) => {
  const state = result["wvp:state"] as { overlayEnabled?: boolean } | undefined;
  setOverlayVisible(state?.overlayEnabled !== false);
});

onMessage({
  PING: () => ({ success: true, data: "PONG from content script" }),
  GET_VITALS: () => ({ success: true, data: null }),
  VITALS_UPDATE: (message) => {
    const snapshot = message.payload as VitalsSnapshot;
    if (snapshot) updateOverlay(snapshot);
    return { success: true };
  },
  OVERLAY_TOGGLE: (message) => {
    const { enabled } = message.payload as { enabled: boolean };
    setOverlayVisible(enabled);
    return { success: true };
  },
});

void chrome.runtime.sendMessage(createMessage("EXTENSION_READY"));

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "wvp-injected") return;

  if (event.data.type === "VITALS_UPDATE") {
    void chrome.runtime.sendMessage(createMessage("VITALS_UPDATE", event.data.payload));
  }
});

export {};
