import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Web Vitals Profiler",
  description: "Production-grade Chrome extension for profiling Core Web Vitals in real time.",
  version: "1.0.0",
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  action: {
    default_title: "Web Vitals Profiler",
    default_popup: "../apps/popup/index.html",
  },
  background: {
    service_worker: "background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["content/content-script.ts"],
      run_at: "document_idle",
    },
  ],
  devtools_page: "../apps/devtools/devtools.html",
  side_panel: {
    default_path: "../apps/side-panel/index.html",
  },
  options_ui: {
    page: "../apps/options/index.html",
    open_in_tab: true,
  },
  permissions: ["storage", "tabs", "activeTab", "scripting", "sidePanel"],
  host_permissions: ["<all_urls>"],
  browser_specific_settings: {
    gecko: {
      id: "web-vitals-profiler@portfolio.dev",
      strict_min_version: "109.0",
    },
  },
  web_accessible_resources: [
    {
      resources: ["injected/injected-script.js"],
      matches: ["<all_urls>"],
    },
  ],
});
