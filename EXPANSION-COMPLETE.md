# Web Vitals Profiler - Expansion Status

What the expansion plan asked for, and where it is in the code (verified 2026-10-19; see README "What has been
verified"). ✅ built · ➖ partly · ❌ not built.

## 1. Speed Optimization

| Feature | Status | Where |
|---|---|---|
| Core Web Vitals monitoring (LCP, CLS, INP, FCP, TTFB, TBT), real-time collection | ✅ | `packages/performance`, `extension/injected` |
| Performance scoring and ratings | ✅ | `packages/core` (`calculateScore`, thresholds), Scores tab |
| Bottleneck identification, critical path | ✅ | `CriticalPathService` (server time, render-blocking span, slow LCP, late sub-resources) |
| Resource loading analysis, render-blocking detection | ✅ | `PerformanceAnalysisService`, side panel Speed tab |
| Image optimization, lazy loading, code splitting, compression, font loading, third-party impact, preconnect / preload suggestions | ✅ | recommendations from `PerformanceAnalysisService` / `CriticalPathService` |
| Automatic audits (Lighthouse) | ✅ | `POST /api/lighthouse/run` through PageSpeed Insights |
| Performance budget tracking | ✅ | Budgets tab, `/api/performance-budgets` |
| Network waterfall visualization, critical CSS extraction, bundle analysis | ❌ | |

## 2. Performance Monitoring

| Feature | Status | Where |
|---|---|---|
| Real-time tracking, live dashboard, charts | ✅ | popup, side panel, DevTools panel, overlay |
| Historical data, trend analysis | ✅ | IndexedDB history; Trends tab (`/api/users/:id/trends`) |
| Regression detection | ✅ | `MonitoringService.checkForRegressions` (extension and API) |
| Alerts, custom thresholds | ✅ | Alerts tab: Slack / e-mail channels, rules on p75, cool-down, history |
| A/B testing comparison | ✅ | A/B tab, Welch's t-test (`compareVariants`) |
| Device-specific and geographic monitoring | ✅ | samples carry device, browser, connection and country (Vercel / Cloudflare header); `/api/analytics` segments |
| Real User Monitoring | ✅ | background sync of every user's measurements |
| Baselines, KPI / goal tracking | ➖ | regressions use a 4-week baseline; budgets act as goals |
| Synthetic monitoring | ➖ | Lighthouse runs on demand (scheduled CI collection not working yet) |
| Uptime / SLA monitoring, network condition simulation, competitor and industry comparison | ❌ | |

## 3. Analytics

| Feature | Status | Where |
|---|---|---|
| Page load and interaction analytics, data aggregation | ✅ | p50 / p75 / p95 per metric (WebAssembly), rating distribution |
| Segmentation: device, browser, network, geography | ✅ | `AnalyticsService.segment` |
| Cohort analysis | ✅ | `CohortService` (weekly cohorts) |
| Anomaly detection | ✅ | z-score on daily p75 (`/api/analytics`) |
| A/B test performance | ✅ | see above |
| Export, API access | ✅ | JSON / CSV / HTML exports; the sync API |
| Conversion impact, bounce rate, session duration, funnels, predictive analytics | ❌ | no business data source |

## 4. Reporting

| Feature | Status | Where |
|---|---|---|
| Performance reports, executive summaries, technical reports | ✅ | `ReportService` (`/api/reports`), built-in executive and technical templates |
| Custom report templates, custom branding / white-label | ✅ | `/api/report-templates` (sections, brand name and colour) |
| HTML, CSV, JSON export | ✅ | |
| Comparison, trend and summary reports, scorecards, recommendations | ✅ | report sections |
| PDF export | ➖ | the HTML report prints to PDF from the browser |
| Scheduled / automated delivery, sharing, annotations, version history, multi-language | ❌ | |

## Services named in the original plan

| Service | Implementation |
|---|---|
| PerformanceAnalysisService | `packages/core/src/analysis.ts` |
| CriticalPathService | `packages/core/src/analysis.ts` |
| MonitoringService | `packages/core/src/monitoring.ts` |
| AlertService | `packages/core/src/monitoring.ts` (evaluation), `apps/api/src/routes/alerts.ts` (delivery) |
| AnalyticsService | `packages/core/src/monitoring.ts` |
| CohortService | `packages/core/src/monitoring.ts` |
| ReportService | `packages/core/src/reports.ts` |
| TemplateService | `packages/core/src/reports.ts` |
