// Firefox background setup: Firefox runs the same background module as an event page (background.scripts, see
// scripts/build-targets.mjs) and shows the side panel as a sidebar (sidebar_action) instead of chrome.sidePanel.
import type { PlatformAdapter } from "./platform";

export const firefoxAdapter: PlatformAdapter = {
  name: "firefox",
  hasSidePanel: false,
  browserName(ua) {
    const v = /Firefox\/(\d+)/.exec(ua);
    return v ? `Firefox ${v[1]}` : "Firefox";
  },
  async setup() {
    // nothing to configure: the sidebar is declared in the manifest and toggled by the user or the popup
  },
};
