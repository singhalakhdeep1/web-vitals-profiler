// Lighthouse CI configuration for web vitals profiler (used by .github/workflows/vitals.yml via ../../lighthouserc.cjs).
// Pages come from LHCI_URLS (comma separated). Budgets follow the Core Web Vitals "good" thresholds.
const urls = (process.env.LHCI_URLS || "https://example.com").split(",").map((u) => u.trim()).filter(Boolean);

module.exports = {
  ci: {
    collect: {
      url: urls,
      numberOfRuns: 3,
      settings: { preset: "desktop" },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["warn", { maxNumericValue: 200 }],
      },
    },
    upload: { target: "temporary-public-storage" },
  },
};
