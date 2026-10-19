# Web Vitals Profiler - Implementation

## Overview
This document describes the browser targets and monitoring integrations of Web Vitals Profiler, as built. The
extension is one Manifest V3 build; the server side is the sync API in `apps/api`.

## Technologies Added

### 1. Firefox Extension
- Derived from the Chrome build by `extension/scripts/build-targets.mjs` into `extension/dist-firefox`
- Manifest V3 for Firefox 128+ (`extension/manifest.firefox.json` holds the differences)
- The background module runs as an event page (`background.scripts`), the side panel becomes a sidebar (`sidebar_action`)
- Platform adapter: `extension/background/firefox.ts` (browser naming, setup)
- Not tested here (Firefox is not installed on the build machine)

### 2. Safari Extension
- Derived into `extension/dist-safari` (`extension/manifest.safari.json`): no side panel, no DevTools panel
- Packaged on macOS with `xcrun safari-web-extension-converter extension/dist-safari`
- Platform adapter: `extension/background/safari.ts`
- Not tested here (needs macOS)

### 3. Edge Extension
- Same Manifest V3 package as Chrome in `extension/dist-edge` (`extension/manifest.edge.json`: minimum version 114)
- Platform adapter: `extension/background/edge.ts` (Chromium: side panel behaviour, Edge / Chrome version naming)
- Tested in Microsoft Edge: measurement, sync and every side-panel view

### 4. Lighthouse CI
- Configuration in `packages/lighthouse-ci/lighthouserc.cjs` (pages from `LHCI_URLS`, Core Web Vitals budgets: LCP ≤ 2.5 s, CLS ≤ 0.1), loaded through the root `lighthouserc.cjs`
- The workflow `.github/workflows/vitals.yml` still needs updating (see README "Known gaps")

### 5. PageSpeed Insights API
- `packages/pagespeed/api.ts`: typed client (categories, desktop / mobile, timeout, errors)
- Normalized result: category scores, lab metrics (FCP, LCP, TBT, CLS, Speed Index, TTI), the biggest opportunities,
  CrUX field data (p75)
- Used by the API for Lighthouse runs (`POST /api/lighthouse/run`, cached 10 minutes) and scoring

### 6. WASM
- `packages/wasm/src/vitals.wat`: heap sort, nearest-rank percentile, mean and sample variance over f64 arrays
- Compiled by `packages/wasm/scripts/build-wasm.mjs` (wabt) and embedded as base64, so it loads synchronously in Node,
  serverless functions and extension pages; plain JavaScript fallback
- Used for every percentile in the API (stats, trends, budgets, badges, reports) and in `packages/core`

### 7. Service Workers
- `packages/service-worker/index.ts`: background sync for the extension's service worker
- Persistent upload queue in `chrome.storage.local` (offline support), batching, exponential back-off, serialized
  writes, retries through `chrome.alarms`

### 8. Firebase
- `packages/firebase`: document store with a Firestore implementation (firebase-admin; emulator via
  `FIRESTORE_EMULATOR_HOST`) and an in-memory one; `saveVitals`, `getVitalsByUrl`, `getVitalsStats`
- `firebase.json`, `firestore.rules` (no client access), `firestore.indexes.json` (indexes for the API's queries)
- Firebase Analytics (a web-page SDK) is not used: extensions cannot load it

### 9. Vercel
- `packages/vercel/config.ts`: function adapter and configuration (Node.js runtime: Firestore and Redis need it)
- `apps/api/api/index.ts` and `apps/api/vercel.json`: every request goes to the API handler
- The same handler runs on Node (`apps/api/src/server.ts`, Dockerfile, docker-compose.yml)

### 10. GitHub Actions
- `.github/workflows/ci.yml`: install, icons, lint, typecheck, unit tests, build; Playwright specs
- `.github/workflows/vitals.yml`: Lighthouse CI and scheduled collection (to be updated)

## Files

| Area | Files |
|---|---|
| Browser targets | `extension/manifest.ts`, `extension/manifest.{edge,firefox,safari}.json`, `extension/scripts/build-targets.mjs`, `extension/background/{edge,firefox,safari,platform}.ts` |
| Lighthouse CI | `packages/lighthouse-ci/lighthouserc.cjs`, `lighthouserc.cjs`, `.github/workflows/vitals.yml` |
| PageSpeed | `packages/pagespeed/api.ts` |
| WASM | `packages/wasm/src/vitals.wat`, `packages/wasm/src/index.ts`, `packages/wasm/scripts/build-wasm.mjs` |
| Service worker | `packages/service-worker/index.ts` |
| Firebase | `packages/firebase/config.ts`, `packages/firebase/src/{store,firestore}.ts`, `firebase.json`, `firestore.rules`, `firestore.indexes.json` |
| Vercel | `packages/vercel/config.ts`, `apps/api/api/index.ts`, `apps/api/vercel.json` |

## Installation

Everything is declared in the workspace `package.json` files: `pnpm install`.

## Environment Variables

See `.env.example`: `PAGESPEED_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`,
`FIRESTORE_EMULATOR_HOST`, `REDIS_URL`, `JWT_SECRET`, `SMTP_URL`.

## Notes
- The API was verified with in-memory storage and with the Firestore emulator + Redis (91 checks each); the extension
  in Edge against the real API (26 checks)
- Firefox, Safari, a real Firebase project, the real PageSpeed API and Vercel were not available for testing
