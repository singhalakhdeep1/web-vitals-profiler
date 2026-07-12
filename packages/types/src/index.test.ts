import { describe, expect, it } from "vitest";
import type { ExtensionMessage, VitalMetric } from "./index";

describe("@wvp/types", () => {
  it("ExtensionMessage shape is valid", () => {
    const message: ExtensionMessage = {
      type: "PING",
      timestamp: Date.now(),
    };
    expect(message.type).toBe("PING");
  });

  it("VitalMetric shape is valid", () => {
    const metric: VitalMetric = {
      name: "LCP",
      value: 1200,
      rating: "good",
      delta: 1200,
      id: "v1",
      navigationType: "navigate",
      timestamp: Date.now(),
      url: "https://example.com",
    };
    expect(metric.rating).toBe("good");
  });
});
