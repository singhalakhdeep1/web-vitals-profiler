import { describe, expect, it } from "vitest";
import { exportMetricsCsv } from "./index";
import type { VitalMetric } from "@wvp/types";

describe("@wvp/storage export", () => {
  it("exportMetricsCsv formats header row", async () => {
    const csv = await exportMetricsCsv();
    expect(csv.startsWith("id,name,value,rating,url,timestamp")).toBe(true);
  });
});
