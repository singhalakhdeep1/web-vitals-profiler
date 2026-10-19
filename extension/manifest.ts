import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// Paths are relative to the Vite root (the monorepo root, see vite.config.ts).
// This is the Chrome / Edge manifest; scripts/build-targets.mjs derives the Firefox and Safari ones from the build.
export default defineManifest({
  manifest_version: 3,
  name: "Web Vitals Profiler",
  description: "Profile Core Web Vitals (LCP, CLS, INP, FCP, TTFB, TBT) live, keep history, catch regressions and sync to a team dashboard.",
  version: pkg.version,
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  action: {
    default_title: "Web Vitals Profiler",
    default_popup: "apps/popup/index.html",
  },
  background: {
    service_worker: "extension/background/service-worker.ts",
    type: "module",
  },
  // The page-world measuring script (injected/injected-script.js) is registered by the background at runtime with
  // world: "MAIN", see background/service-worker.ts.
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["extension/content/content-script.ts"],
      run_at: "document_start",
    },
  ],
  devtools_page: "apps/devtools/devtools.html",
  side_panel: {
    default_path: "apps/side-panel/index.html",
  },
  options_ui: {
    page: "apps/options/index.html",
    open_in_tab: true,
  },
  permissions: ["storage", "tabs", "activeTab", "scripting", "sidePanel", "alarms"],
  // any page can be measured, and the sync server address is chosen by the user
  host_permissions: ["<all_urls>"],
});
