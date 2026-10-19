// Chromium (Chrome and Microsoft Edge) background setup: Manifest V3 service worker with the side panel API.
import type { PlatformAdapter } from "./platform";

export const edgeAdapter: PlatformAdapter = {
  name: "chromium",
  hasSidePanel: true,
  browserName(ua) {
    const edge = /Edg\/(\d+)/.exec(ua);
    if (edge) return `Edge ${edge[1]}`;
    const chrome = /Chrome\/(\d+)/.exec(ua);
    return chrome ? `Chrome ${chrome[1]}` : "Chromium";
  },
  async setup() {
    // the toolbar button opens the popup; the side panel is opened from the popup or the browser's side panel menu
    if (chrome.sidePanel?.setPanelBehavior) await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  },
};
