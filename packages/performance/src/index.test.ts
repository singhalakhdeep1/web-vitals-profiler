import { describe, expect, it } from "vitest";
import { createVitalMetric, getVitalRating } from "./index";

describe("@wvp/performance", () => {
  it("getVitalRating returns good for fast LCP", () => {
    expect(getVitalRating("LCP", 2000)).toBe("good");
  });

  it("getVitalRating returns poor for slow LCP", () => {
    expect(getVitalRating("LCP", 5000)).toBe("poor");
  });

  it("createVitalMetric builds a valid metric", () => {
    const metric = createVitalMetric("FCP", 900, "https://example.com");
    expect(metric.name).toBe("FCP");
    expect(metric.url).toBe("https://example.com");
  });
});
