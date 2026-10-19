# Web Vitals Profiler

A browser extension that measures Core Web Vitals (LCP, CLS, INP, FCP, TTFB, TBT) on every page you visit, shows
them live (popup, DevTools panel, side panel, on-page badge), keeps a local history with regression detection, and
analyzes each page's resources for concrete speed fixes. Signed in to the optional **sync server**, it also uploads
your measurements (real-user monitoring) and adds trends, performance budgets, Lighthouse runs, scoring, Slack /
e-mail alerts, team dashboards, A/B comparisons, embeddable badges and reports.

Chrome and Edge (Manifest V3), with Firefox and Safari packages derived from the same build.

## Features

**In the extension (works offline, no account)**
- Live Core Web Vitals per tab: popup, side panel, DevTools panel with live charts, on-page overlay badge
- Measured in the page's own JavaScript world with `web-vitals` plus a Total Blocking Time observer; every change is
  reported live
- Local history in IndexedDB, sessions saved when tabs close, regression detection (last week vs the 4 weeks before)
- **Speed tab**: resource-timing analysis of the open page: render-blocking resources, large images and bundles,
  uncompressed text, third-party origins, fonts, critical-path bottlenecks, LCP preload advice
- Export JSON / CSV / HTML, Slack report webhook

**With a sync server (signed in from Settings → Cloud Sync)**
- Background sync: measurements queue in `chrome.storage` (survives offline periods and browser restarts), upload in
  batches, back off on failure and retry every minute
- **Trends**: daily p75 per metric (7 / 30 / 90 days), export CSV / JSON / SVG chart
- **Budgets**: per metric (optionally per page), passing / warning / failing from the last 7 days' p75
- **Lighthouse**: lab runs through PageSpeed Insights (categories and desktop / mobile / both), with opportunities
  and CrUX field data
- **Scores**: weighted score from lab categories and field Core Web Vitals, with presets and recommendations
- **Alerts**: Slack and e-mail channels, rules on p75 (above / below), cool-down, delivery history, test sends
- **Team dashboards**: invite by e-mail (pending invites join on sign-up), roles, pages whose field data from every
  member is shown together, optional public read-only view
- **A/B tests**: two URLs compared with Welch's t-test (winner only when significant)
- **Badges**: embeddable SVG Core Web Vitals badges with ready-to-paste HTML
- **Analytics and reports**: segments by device / browser / connection / country, rating distribution, weekly
  cohorts, anomalies; executive or technical reports (or your own branded template) as HTML, CSV or JSON

## Architecture

```
 Page (MAIN world)                Extension                                    Sync server (apps/api)
 injected-script.js  ──post──►  content script ──► background service worker ──HTTPS──► Web-standard handler
  web-vitals, TBT,               overlay badge      IndexedDB history, regressions        Node server / Vercel function
  resource timing                                   speed analysis (@wvp/core)            ├─ Firestore (firebase-admin)
                                                    upload queue (@wvp/service-worker)    ├─ Redis: cache, rate limits,
 popup · side panel · DevTools panel · options ◄── messages / ports                      │   alert cool-downs
                                                                                          ├─ PageSpeed Insights
                                                                                          └─ Slack / SMTP
```

| Path | What it is |
|---|---|
| `extension/` | Manifest, background service worker (+ Chromium / Firefox / Safari adapters), content script, page-world script, build of every browser target |
| `apps/popup`, `apps/side-panel`, `apps/devtools`, `apps/options` | Extension pages (React 19, Tailwind 4) |
| `apps/api` | Sync API: accounts, ingest, stats, trends, analytics, reports, budgets, Lighthouse, scores, alerts, teams, A/B tests, badges |
| `packages/types`, `messaging`, `hooks`, `ui`, `utils`, `performance`, `storage` | Shared extension code |
| `packages/api-client` | Sync API client for extension pages and the worker |
| `packages/service-worker` | Background sync: persistent upload queue with back-off and alarms |
| `packages/core` | Thresholds, scoring, regressions, A/B statistics, analytics, cohorts, resource / critical-path analysis, reports |
| `packages/wasm` | WebAssembly statistics (heap sort, percentiles, mean, variance) from `src/vitals.wat` |
| `packages/firebase` | Document store: Firestore (emulator aware) or in-memory |
| `packages/services` | Redis cache, token-bucket rate limiting (atomic Lua), structured JSON logging with correlation ids |
| `packages/pagespeed` | PageSpeed Insights client (remote Lighthouse) |
| `packages/vercel` | Vercel function adapter (`apps/api/api/index.ts`) |
| `packages/lighthouse-ci` | Lighthouse CI configuration (`lighthouserc.cjs`: pages from `LHCI_URLS`, Core Web Vitals budgets) |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json` | Firestore project files (rules deny all client access; indexes for the API's queries) |

## Getting started

Requirements: Node 22, pnpm 9.

```bash
pnpm install
pnpm build                       # builds extension/dist plus dist-edge, dist-firefox, dist-safari
```

**Load the extension**: `chrome://extensions` (or `edge://extensions`) → Developer mode → Load unpacked →
`extension/dist`. Development with hot reload: `pnpm dev`.

**Run the sync server** (optional):

```bash
cp .env.example .env             # set JWT_SECRET (32+ characters)
pnpm --filter @wvp/api dev       # http://localhost:8787, in-memory storage unless Firestore is configured
# or everything with Firestore (emulator) and Redis:
docker compose up -d --build
```

Then in the extension: Settings → Cloud Sync → server `http://localhost:8787` → create an account.

**Production storage**: set `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` (service-account JSON), deploy the
indexes with `firebase deploy --only firestore:indexes,firestore:rules`, and set `REDIS_URL`. **Vercel**: deploy
`apps/api` (it contains `vercel.json` and `api/index.ts`); the function uses the Node.js runtime because Firestore
and Redis need it.

### Other browsers

| Target | Folder | Notes |
|---|---|---|
| Chrome | `extension/dist` | Manifest V3 service worker, side panel |
| Edge | `extension/dist-edge` | Same package, `minimum_chrome_version` 114 |
| Firefox 128+ | `extension/dist-firefox` | Background runs as an event page, side panel becomes a sidebar |
| Safari 16.4+ | `extension/dist-safari` | No side panel or DevTools panel; convert on macOS with `xcrun safari-web-extension-converter extension/dist-safari` |

The per-browser differences are in `extension/manifest.{edge,firefox,safari}.json`, applied by
`extension/scripts/build-targets.mjs`; the background picks its adapter at runtime (`extension/background/platform.ts`).

## Configuration

Server settings are listed in [.env.example](.env.example): JWT secret, Firestore project / service account /
emulator, Redis, PageSpeed key, SMTP for e-mail alerts, alert cool-down. The extension keeps its settings in
`chrome.storage.local` (`wvp:state`, `wvp:sync`, `wvp:upload-queue`).

## Sync API

All routes need `Authorization: Bearer <token>` (from register / login) except those marked public.

| Area | Routes |
|---|---|
| Accounts | `POST /api/auth/register` (public) · `POST /api/auth/login` (public) · `GET /api/auth/me` |
| Vitals | `POST /api/vitals` (batch ingest, idempotent) · `GET /api/vitals?url=` · `GET /api/stats?url=&range=` · `GET /api/users/:id/urls` · `GET /api/users/:id/trends?metric=&range=&url=` |
| Analytics / reports | `GET /api/analytics?url=&range=` · `GET /api/reports?url=&range=&format=html\|csv\|json&template=` · `GET/POST /api/report-templates` |
| Budgets | `GET /api/users/:id/performance-budgets` · `POST /api/performance-budgets` · `DELETE /api/performance-budgets/:id` |
| Lighthouse / scores | `GET /api/users/:id/lighthouse-reports` · `POST /api/lighthouse/run` · `GET /api/users/:id/performance-scores` · `POST /api/performance/calculate` |
| Alerts | `GET /api/users/:id/alert-channels\|alert-rules\|alert-history` · `POST /api/alert-channels` · `POST /api/alert-channels/:id/toggle\|test` · `DELETE /api/alert-channels/:id` · `POST /api/alert-rules` · `POST /api/alert-rules/:id/toggle` · `DELETE /api/alert-rules/:id` |
| Teams | `GET /api/users/:id/team-dashboards` · `POST /api/team-dashboards` · `PATCH/DELETE /api/team-dashboards/:id` · `POST /api/team-dashboards/:id/invite` · `DELETE /api/team-dashboards/:id/members/:memberId` · `GET /api/team-dashboards/:id/summary` · `GET /api/public/dashboards/:id` (public) |
| A/B tests | `GET /api/users/:id/ab-tests` · `POST /api/ab-tests` · `GET /api/ab-tests/:id/comparison` · `POST /api/ab-tests/:id/status` · `DELETE /api/ab-tests/:id` |
| Badges | `GET /api/users/:id/badge-configs` · `POST /api/badge-configs` · `POST /api/badge-configs/:id/toggle` · `DELETE /api/badge-configs/:id` · `GET /api/users/:id/badge-data` · `GET /api/badges/:id.svg` (public) |
| Operations | `GET /health` (store, Redis, WebAssembly) |

Rate limits (token buckets, shared through Redis): sign-in 10 / 15 min per address and e-mail, sign-up 10 / hour per
address, ingest 240 / min and API 600 / min per user, Lighthouse 20 / hour per user. Logs are one JSON object per line
with the request's correlation id (`X-Request-Id`) and user, plus audit events.

## Scripts

| Command | What it does |
|---|---|
| `pnpm build` | Extension build and all browser targets |
| `pnpm dev` | Extension with hot reload |
| `pnpm check-types` | TypeScript across every package (21 tasks) |
| `pnpm lint` | ESLint across the extension packages |
| `pnpm test` / `pnpm test:e2e` | Vitest unit tests / Playwright specs |
| `pnpm --filter @wvp/api dev` | Sync server with reload |
| `pnpm --filter @wvp/wasm build:wasm` | Recompile `vitals.wat` |

## What has been verified

On Windows, 2026-10-19:

- **Sync API**: 91 end-to-end checks through HTTP (accounts, ingest validation and idempotency, WebAssembly
  percentiles against a manual computation, cache hits / invalidation, trends, regressions, segments, cohorts, all
  report formats and templates, budgets, Lighthouse against a PageSpeed mock, scores, Slack and e-mail alerts against
  local receivers with cool-down, team invites including pending sign-ups and public view, A/B significance, badges and
  SVG, rate limits, structured logs) with **in-memory storage** and with **Firestore (official emulator) + Redis**.
  All passed.
- **Extension in Edge** (26 checks): measurement on a test page, sign-in from Settings, background sync of real
  measurements (browser, device and connection recorded), speed analysis, and every side-panel view against the real
  API: trends + export, budgets, Lighthouse, scores, alert channel / rule / test send, team dashboard with page data and
  invite, A/B test, badge image, sign-out. All passed.
- `pnpm check-types` (21/21), `pnpm lint` (12/12) and `pnpm build` pass.

**Not verified here**: Firefox and Safari (not installed; their packages are generated but untested), a real
Firebase project, the real PageSpeed Insights API, Slack itself, a Vercel deployment and the Docker image (no Docker
daemon; `docker compose config` is valid).

**Known gaps**
- Unit tests: 9 of 10 pass; `packages/storage/src/index.test.ts` needs IndexedDB, which Node does not provide.
- `.github/workflows/vitals.yml` (scheduled Lighthouse / collection) still calls `collect:vitals`, `analyze:vitals`
  and `report:vitals` scripts that do not exist, and uses example.com; it needs updating before it can run.
- Chrome Web Store screenshots are not generated yet (`store/`).
- The expansion document's broader wish list (conversion impact, competitor comparison, PDF export, multi-language
  reports) is not built; see [EXPANSION-COMPLETE.md](EXPANSION-COMPLETE.md).

## Documentation

| Doc | Description |
|---|---|
| [HLD / LLD](WEB_VITALS_PROFILER_HLD_LLD.md) | Cache, rate limiting, structured logging and the layers, mapped to code |
| [Implementation](WEB_VITALS_PROFILER_IMPLEMENTATION.md) | Browser targets, Lighthouse, PageSpeed, WASM, service worker, Firebase, Vercel |
| [Expansion status](EXPANSION-COMPLETE.md) | Which expansion features exist and where |
| [Architecture](./docs/architecture.md) | Message flows and package boundaries of the extension |
| [Chrome Store Listing](./store/CHROME_STORE_LISTING.md) | Store copy and metadata |

## License

Proprietary - All rights reserved.
