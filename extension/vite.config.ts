import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import { build as esbuild } from "esbuild";
import type { Plugin } from "vite";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import manifest from "./manifest";

// The extension pages live in apps/* and the shared code in packages/*, so the build root is the monorepo root:
// Vite only accepts HTML entry points inside its root.
const root = resolve(__dirname, "..");

// One physical copy of the shared runtime libraries for every page (pnpm links them per package, and Vite's resolver
// does not follow those links reliably on Windows). They are dependencies of this package.
const require = createRequire(import.meta.url);
const pkgDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

/**
 * The page-world measuring script must be one self-contained file: it runs in the page's JavaScript world, where the
 * extension's module chunks cannot be imported. It is bundled with esbuild into injected/injected-script.js and
 * registered at runtime by the background (chrome.scripting.registerContentScripts, world: "MAIN").
 */
function injectedScript(): Plugin {
  return {
    name: "wvp-injected-script",
    async generateBundle() {
      const out = await esbuild({
        entryPoints: [resolve(__dirname, "injected/injected-script.ts")],
        bundle: true,
        format: "iife",
        target: "es2020",
        minify: true,
        write: false,
      });
      this.emitFile({ type: "asset", fileName: "injected/injected-script.js", source: out.outputFiles[0]!.text });
    },
  };
}

export default defineConfig({
  root,
  publicDir: resolve(__dirname, "public"),
  plugins: [react(), tailwindcss(), crx({ manifest }), injectedScript()],
  resolve: {
    alias: {
      react: pkgDir("react"),
      "react-dom": pkgDir("react-dom"),
      "@popup": resolve(root, "apps/popup/src"),
      "@devtools": resolve(root, "apps/devtools/src"),
      "@side-panel": resolve(root, "apps/side-panel/src"),
      "@options": resolve(root, "apps/options/src"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // the DevTools panel is opened by devtools.html at runtime, so it is not reachable from the manifest
        panel: resolve(root, "apps/devtools/panel.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
});
