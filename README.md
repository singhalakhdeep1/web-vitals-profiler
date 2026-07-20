# Web Vitals Profiler

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Chrome Extension](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)

A production-grade **Manifest V3 Chrome extension** for profiling **Core Web Vitals** in real time — built as a **Turborepo monorepo** with separate React apps for popup, DevTools panel, side panel, and options page.

> **Portfolio status:** ~**80% complete** · 1 ✅ · 4 ⚠️ · 0 ❌ (5 modules)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Chrome Extension Surfaces](#chrome-extension-surfaces)
- [Browser APIs Used](#browser-apis-used)
- [Project Structure](#project-structure)
- [Package Map](#package-map)
- [Getting Started](#getting-started)
- [Development](#development)
- [Testing](#testing)
- [Architecture](#architecture)
- [Message Passing](#message-passing)
- [Module Progress](#module-progress)
- [Configuration](#configuration)
- [CI/CD](#cicd)
- [Browser Support](#browser-support)
- [Interview Highlights](#interview-highlights)
- [Remaining Work](#remaining-work)
- [Documentation](#documentation)
- [License](#license)

---

## Overview

Web Vitals Profiler captures **LCP, CLS, INP, FCP, TTFB, and TBT** from any webpage and surfaces them across multiple extension contexts — popup snapshot, persistent side panel, custom DevTools panel, on-page overlay badge, and exportable reports.

All data is stored **locally** in IndexedDB. Nothing is sent to external servers unless you configure a Slack webhook.

---

## Features

| Feature                      | Status | Implementation                                         |
| ---------------------------- | ------ | ------------------------------------------------------ |
| Live Core Web Vitals         | ✅     | `web-vitals` library + `PerformanceObserver`           |
| Total Blocking Time (TBT)    | ✅     | Custom `PerformanceObserver` for long tasks            |
| DevTools panel + live charts | ✅     | Recharts + `chrome.runtime.Port` streaming             |
| Side panel with live metrics | ✅     | `chrome.runtime.onMessage` broadcast                   |
| On-page overlay badge        | ✅     | Content script DOM overlay, toggle via storage         |
| IndexedDB persistence        | ✅     | Dexie — metrics table + sessions table                 |
| Regression detection         | ✅     | Recent 1-week vs 4-week rolling average                |
| Session history              | ✅     | Saved on tab close via background SW                   |
| Export reports               | ✅     | JSON, CSV, HTML from Options page                      |
| Slack webhook notifications  | ✅     | Configurable in Options                                |
| Firefox compatibility        | ✅     | `browser_specific_settings.gecko` in manifest          |
| Chrome Store screenshots     | ⚠️     | Listing copy in `store/`; PNGs not generated           |
| Extension-loaded E2E         | ⚠️     | Playwright tests browser APIs, not full extension flow |
| Historical trend charts      | ⚠️     | Side panel charts exist; trend UI is thin              |

---

## Tech Stack

### Core

| Category        | Technology        | Version  | Purpose                              |
| --------------- | ----------------- | -------- | ------------------------------------ |
| Language        | TypeScript        | 5.9      | Strict typing across all contexts    |
| UI Framework    | React             | 19       | Popup, DevTools, side panel, options |
| Build Tool      | Vite              | 6        | Fast HMR dev server                  |
| Extension Build | CRXJS Vite Plugin | 2.0 beta | MV3 bundling + hot reload            |
| Package Manager | pnpm              | 9        | Workspace dependency management      |
| Monorepo        | Turborepo         | 2.10     | Parallel builds, task caching        |

### UI & Styling

| Category        | Technology          | Purpose                                |
| --------------- | ------------------- | -------------------------------------- | --------------------------------- |
| CSS             | Tailwind CSS        | 4                                      | Utility-first styling             |
| Tailwind Plugin | `@tailwindcss/vite` | Vite integration                       |
| Charts          | Recharts            | 2.15                                   | DevTools + side panel live charts |
| State           | Zustand             | 5                                      | Vitals store + overlay toggle     |
| Components      | `@wvp/ui`           | Shared Button, Card, Header, MetricRow |

### Data & Performance

| Category       | Technology             | Purpose |
| -------------- | ---------------------- | ------- | ----------------------------------- |
| IndexedDB ORM  | Dexie                  | 4       | Metrics + sessions persistence      |
| Web Vitals     | `web-vitals`           | 4.2     | LCP, CLS, INP, FCP, TTFB collection |
| Performance    | `PerformanceObserver`  | Native  | TBT via long-task entries           |
| Chrome Storage | `chrome.storage.local` | Native  | Extension state, overlay toggle     |

### Chrome Extension Platform

| API                | Used In             | Purpose                            |
| ------------------ | ------------------- | ---------------------------------- |
| `chrome.runtime`   | All contexts        | Message passing, `onConnect` ports |
| `chrome.tabs`      | Background SW       | Tab lifecycle, vitals per tab      |
| `chrome.storage`   | Background, Options | Settings, overlay state            |
| `chrome.sidePanel` | Background          | Side panel API                     |
| `chrome.scripting` | Manifest permission | Dynamic script injection           |
| DevTools API       | DevTools panel      | Custom profiling panel             |

### Testing & Quality

| Category     | Technology          | Purpose                           |
| ------------ | ------------------- | --------------------------------- | --------------------------------- |
| Unit Tests   | Vitest              | 3.1                               | Package-level tests               |
| E2E Tests    | Playwright          | 1.51                              | Browser API + manifest validation |
| Linting      | ESLint              | 9                                 | Shared `@repo/eslint-config`      |
| Formatting   | Prettier            | 3.7                               | Code style + Tailwind plugin      |
| Git Hooks    | Husky + lint-staged | Pre-commit lint + format          |
| CI/CD        | GitHub Actions      | Lint, typecheck, test, build, E2E |
| Chrome Types | `@types/chrome`     | Extension API typings             |

---

## Chrome Extension Surfaces

| Surface             | Path                    | Description                                          |
| ------------------- | ----------------------- | ---------------------------------------------------- |
| **Popup**           | `apps/popup/`           | Quick vitals snapshot for active tab                 |
| **Side Panel**      | `apps/side-panel/`      | Persistent live metrics + Recharts                   |
| **DevTools Panel**  | `apps/devtools/`        | Developer-grade profiling with port streaming        |
| **Options Page**    | `apps/options/`         | Export, Slack, overlay toggle, sessions, regressions |
| **Background SW**   | `extension/background/` | Message hub, storage, tab lifecycle                  |
| **Content Script**  | `extension/content/`    | Overlay badge, message bridge                        |
| **Injected Script** | `extension/injected/`   | Page-world `PerformanceObserver`                     |

### Manifest Permissions

```
storage · tabs · activeTab · scripting · sidePanel
host_permissions: <all_urls>
```

---

## Browser APIs Used

| API                          | Module | What It Does                          |
| ---------------------------- | ------ | ------------------------------------- |
| `PerformanceObserver`        | M2     | Observes LCP, long tasks (TBT)        |
| `web-vitals`                 | M2     | Standardized CWV metric collection    |
| `IndexedDB` via Dexie        | M4     | Time-series metrics + session storage |
| `chrome.runtime.Port`        | M3     | DevTools live streaming               |
| `chrome.runtime.sendMessage` | M2     | Live broadcast to popup/side panel    |
| `chrome.storage.local`       | M1     | Extension settings persistence        |
| `chrome.tabs.onRemoved`      | M4     | Session save on tab close             |

---

## Project Structure

```
web-vitals-profiler/
├── apps/
│   ├── popup/              # Quick vitals snapshot (React 19)
│   ├── devtools/           # DevTools panel + Recharts timeline
│   ├── side-panel/         # Persistent live metrics view
│   └── options/            # Export, Slack, overlay, sessions
├── extension/
│   ├── background/
│   │   └── service-worker.ts   # Message hub, storage, tab lifecycle
│   ├── content/
│   │   └── content-script.ts   # Overlay badge + bridge
│   ├── injected/
│   │   └── injected-script.ts  # Page-world PerformanceObserver
│   ├── manifest.ts             # MV3 manifest (CRXJS)
│   └── icons/                    # 16/32/48/128 PNG icons
├── packages/
│   ├── performance/        # web-vitals + TBT observer + ratings
│   ├── storage/            # Dexie DB, regression, export, Slack
│   ├── messaging/          # Typed createMessage / onMessage
│   ├── hooks/              # useVitalsStore (Zustand), useRegressions
│   ├── ui/                 # Button, Card, Header, MetricRow, StatusBadge
│   ├── types/              # VitalMetric, VitalsSnapshot, MessageType
│   └── utils/              # Logger, generateId
├── tests/
│   └── e2e/                # Playwright foundation tests
├── store/
│   ├── CHROME_STORE_LISTING.md
│   └── landing/index.html  # Static marketing page
├── docs/
│   ├── architecture.md
│   └── roadmap.md
├── scripts/
│   └── generate-icons.mjs
├── .github/workflows/ci.yml
├── turbo.json
├── pnpm-workspace.yaml
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

---

## Package Map

| Package            | Scope                  | Key Exports                                                          |
| ------------------ | ---------------------- | -------------------------------------------------------------------- |
| `@wvp/performance` | `packages/performance` | `createVitalMetric`, `getVitalRating`, `initTBTObserver`             |
| `@wvp/storage`     | `packages/storage`     | `saveMetric`, `getMetrics`, `detectRegressions`, `exportMetricsJson` |
| `@wvp/messaging`   | `packages/messaging`   | `createMessage`, `onMessage`, `sendToTab`                            |
| `@wvp/hooks`       | `packages/hooks`       | `useVitalsStore`, `useRegressions`, `exportReport`                   |
| `@wvp/ui`          | `packages/ui`          | `Button`, `Card`, `Header`, `MetricRow`                              |
| `@wvp/types`       | `packages/types`       | `VitalMetric`, `VitalsSnapshot`, `MessageType`                       |
| `@wvp/utils`       | `packages/utils`       | `logger`, `generateId`                                               |
| `@wvp/extension`   | `extension/`           | CRXJS entry — bundles all contexts                                   |

---

## Getting Started

### Prerequisites

| Tool          | Version            |
| ------------- | ------------------ |
| Node.js       | 22 LTS+            |
| pnpm          | 9+                 |
| Google Chrome | Latest             |
| Git           | Any recent version |

### Install

```bash
git clone <your-repo-url>
cd web-vitals-profiler
pnpm install
node scripts/generate-icons.mjs
```

### Development (Hot Reload)

```bash
pnpm dev
```

Opens the CRXJS dev server. Load `extension/dist` in Chrome — changes hot-reload across popup, content script, and background.

### Production Build

```bash
pnpm build
```

Output: `extension/dist/` — load this folder in Chrome.

### Load in Chrome

1. Run `pnpm build` (or `pnpm dev`)
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select `extension/dist`
5. Pin the extension → click icon to open popup
6. Open DevTools → **Web Vitals Profiler** tab for live charts
7. Right-click icon → **Open side panel** for persistent view

---

## Development

### Available Scripts

| Command             | Description                                     |
| ------------------- | ----------------------------------------------- |
| `pnpm dev`          | CRXJS dev server with HMR (port 5173)           |
| `pnpm build`        | Typecheck + production build → `extension/dist` |
| `pnpm test`         | Vitest unit tests across packages               |
| `pnpm test:e2e`     | Playwright E2E tests                            |
| `pnpm lint`         | ESLint across all workspaces                    |
| `pnpm check-types`  | TypeScript `--noEmit` across all packages       |
| `pnpm format`       | Prettier write all files                        |
| `pnpm format:check` | Prettier check (CI)                             |

### Environment Variables

Copy `.env.example` to `.env` (optional — used by Vite client):

```env
VITE_EXTENSION_NAME=Web Vitals Profiler
VITE_EXTENSION_VERSION=1.0.0
```

---

## Testing

| Layer  | Tool       | Location                   | Coverage                            |
| ------ | ---------- | -------------------------- | ----------------------------------- |
| Unit   | Vitest     | `packages/*/src/*.test.ts` | Performance ratings, storage export |
| E2E    | Playwright | `tests/e2e/`               | Browser APIs, manifest structure    |
| Manual | Chrome     | `chrome://extensions`      | Full extension flow                 |

```bash
pnpm test          # Unit tests
pnpm test:e2e      # E2E (requires Playwright chromium)
```

---

## Architecture

```
                    Chrome Browser
                           │
        ┌──────────────────┼─────────────────┐
        │                  │                 │
        ▼                  ▼                 ▼
   Popup UI          DevTools UI      Side Panel UI
   (React 19)        (Recharts)       (Recharts)
        │                  │                 │
        └──────────────┬───┴─────────────────┘
                       │
           chrome.runtime.sendMessage
           chrome.runtime.Port (DevTools)
                       │
               Background Service Worker
               (vitalsByTab Map + Dexie)
                       │
        ┌──────────────┴───────────────┐
        │                              │
        ▼                              ▼
 Content Script                 IndexedDB (Dexie)
 (overlay badge)                metrics + sessions
        │
        ▼
 Injected Script
 (PerformanceObserver + web-vitals)
        │
        ▼
      Web Page
```

---

## Message Passing

| Message Type         | Direction              | Purpose                 |
| -------------------- | ---------------------- | ----------------------- |
| `VITALS_UPDATE`      | Injected → BG → UI     | Live metric broadcast   |
| `GET_VITALS`         | UI → BG                | Snapshot for active tab |
| `GET_VITALS_HISTORY` | UI → BG                | IndexedDB query         |
| `GET_REGRESSIONS`    | Options → BG           | Regression report       |
| `GET_SESSIONS`       | Options → BG           | Session history         |
| `OVERLAY_TOGGLE`     | Options → BG → Content | Show/hide overlay       |
| `EXPORT_REPORT`      | Options → BG           | JSON/CSV/HTML export    |
| `CLEAR_DATA`         | Options → BG           | Wipe IndexedDB          |

---

## Module Progress

| #   | Module                 | Version | Status  | Key Deliverables                       |
| --- | ---------------------- | ------- | ------- | -------------------------------------- |
| 1   | Extension Foundation   | v0.1    | ⚠️ ~90% | Monorepo, MV3, all UI, CI, Husky       |
| 2   | Performance Monitoring | v0.2    | ✅      | LCP, CLS, INP, FCP, TTFB, TBT          |
| 3   | DevTools + Overlay     | v0.3    | ✅      | Recharts, port streaming, overlay      |
| 4   | IndexedDB Analytics    | v0.5    | ⚠️ ~75% | Dexie, regression, sessions            |
| 5   | Export & Release       | v1.0    | ⚠️ ~70% | JSON/CSV/HTML, Slack, Firefox manifest |

**Overall: ~80%** · 1 complete · 4 partial · 0 missing

---

## Configuration

### Overlay Toggle

Options page → **On-Page Overlay** → Enable/Disable. Stored in `chrome.storage.local` under `wvp:state`.

### Slack Integration

Options page → enter webhook URL → **Send Report to Slack**. Sends top 10 metrics as a formatted notification.

### Regression Detection

Automatically compares last 7 days vs prior 4-week average per URL. Shown in Options when regressions are detected (>10% degradation).

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR to `main`:

1. `pnpm install --frozen-lockfile`
2. `node scripts/generate-icons.mjs`
3. `pnpm lint`
4. `pnpm check-types`
5. `pnpm test`
6. `pnpm build`
7. `pnpm test:e2e` (Playwright + Chromium)

---

## Browser Support

| Browser      | Status     | Notes                                |
| ------------ | ---------- | ------------------------------------ |
| Chrome 120+  | ✅ Primary | Full MV3 support                     |
| Edge 120+    | ✅         | Chromium-based                       |
| Firefox 109+ | ⚠️         | Manifest ready; manual QA needed     |
| Safari       | ❌         | Not supported (no MV3 extension API) |

---

## Interview Highlights

- **MV3 service workers** replace persistent background pages — trade-offs for long-running tasks
- **Content script isolated world** vs **injected script page world** — why both are needed
- `chrome.runtime.sendMessage` (fire-and-forget) vs `chrome.runtime.Port` (persistent DevTools stream)
- **IndexedDB schema** design for time-series vitals: `metrics` + `sessions` tables
- **Regression detection**: rolling average vs spike detection — false positive trade-offs
- **web-vitals library** vs raw `PerformanceObserver` — when to use each
- **TBT calculation** from long-task entries and main-thread blocking

---

## Remaining Work

- [ ] Extension-loaded Playwright E2E (load unpacked + interact with popup)
- [ ] Chrome Web Store screenshot PNG assets
- [ ] Richer historical trend charts in side panel / options
- [ ] Deploy static landing page from `store/landing/`
- [ ] Firefox manual QA pass

---

## Documentation

| Doc                                                     | Description                                        |
| ------------------------------------------------------- | -------------------------------------------------- |
| [Architecture](./docs/architecture.md)                  | Context diagram, message flows, package boundaries |
| [Roadmap](./docs/roadmap.md)                            | 5-module development plan                          |
| [Chrome Store Listing](./store/CHROME_STORE_LISTING.md) | Store copy and metadata                            |
| [Portfolio Overview](../CHROME_EXTENSIONS_PORTFOLIO.md) | All three projects                                 |

---

## License

Proprietary - All rights reserved.
