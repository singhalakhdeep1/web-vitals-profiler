import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import { resolve } from "node:path";
import manifest from "./manifest";

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  resolve: {
    alias: {
      "@popup": resolve(__dirname, "../apps/popup/src"),
      "@devtools": resolve(__dirname, "../apps/devtools/src"),
      "@side-panel": resolve(__dirname, "../apps/side-panel/src"),
      "@options": resolve(__dirname, "../apps/options/src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "../apps/popup/index.html"),
        "side-panel": resolve(__dirname, "../apps/side-panel/index.html"),
        options: resolve(__dirname, "../apps/options/index.html"),
        devtools: resolve(__dirname, "../apps/devtools/devtools.html"),
        panel: resolve(__dirname, "../apps/devtools/panel.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
