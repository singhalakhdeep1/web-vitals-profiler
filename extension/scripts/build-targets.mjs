// Derives the Edge, Firefox and Safari packages from the Chrome build in dist/ (run after `vite build`):
//   dist-edge/     Microsoft Edge Add-ons
//   dist-firefox/  addons.mozilla.org (Manifest V3, Firefox 128+)
//   dist-safari/   input for `xcrun safari-web-extension-converter` on macOS
// Each target's differences live in manifest.<target>.json; "$remove" drops keys, "$removePermissions" drops
// permissions and "$backgroundScripts" runs the background module as an event page (Firefox has no service workers).
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(here, "dist");
if (!existsSync(resolve(dist, "manifest.json"))) throw new Error("Build the extension first (vite build): dist/manifest.json is missing");
const base = JSON.parse(readFileSync(resolve(dist, "manifest.json"), "utf8"));

for (const target of ["edge", "firefox", "safari"]) {
  const overrides = JSON.parse(readFileSync(resolve(here, `manifest.${target}.json`), "utf8"));
  const out = resolve(here, `dist-${target}`);
  rmSync(out, { recursive: true, force: true });
  cpSync(dist, out, { recursive: true });

  const manifest = structuredClone(base);
  for (const key of overrides.$remove ?? []) delete manifest[key];
  if (overrides.$removePermissions) manifest.permissions = (manifest.permissions ?? []).filter((p) => !overrides.$removePermissions.includes(p));
  if (overrides.$backgroundScripts && manifest.background?.service_worker) {
    manifest.background = { scripts: [manifest.background.service_worker], type: "module" };
  }
  // Firefox and Safari do not know use_dynamic_url
  if (target !== "edge") {
    for (const w of manifest.web_accessible_resources ?? []) delete w.use_dynamic_url;
  }
  for (const [key, value] of Object.entries(overrides)) if (!key.startsWith("$")) manifest[key] = value;
  writeFileSync(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`dist-${target}: manifest v${manifest.manifest_version}, ${Object.keys(manifest).length} keys`);
}
