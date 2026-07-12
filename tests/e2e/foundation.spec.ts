import { test, expect } from "@playwright/test";

test.describe("Web Vitals Profiler — E2E", () => {
  test("PerformanceObserver API is available in browser", async ({ page }) => {
    await page.goto("https://example.com");
    const hasObserver = await page.evaluate(
      () => typeof PerformanceObserver !== "undefined",
    );
    expect(hasObserver).toBe(true);
  });

  test("LCP can be observed on a real page", async ({ page }) => {
    await page.goto("https://example.com");
    const observed = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          try {
            const observer = new PerformanceObserver(() => resolve(true));
            observer.observe({ type: "largest-contentful-paint", buffered: true });
            setTimeout(() => resolve(false), 4000);
          } catch {
            resolve(false);
          }
        }),
    );
    expect(observed).toBe(true);
  });

  test("extension manifest structure is valid MV3", async () => {
    const manifest = await import("../../extension/manifest.ts");
    expect(manifest.default.manifest_version).toBe(3);
    expect(manifest.default.background?.service_worker).toBeTruthy();
    expect(manifest.default.action?.default_popup).toBeTruthy();
  });
});
