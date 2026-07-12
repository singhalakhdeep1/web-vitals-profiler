import { describe, expect, it } from "vitest";
import { formatMs, getRatingColorClass, safeJsonParse } from "./index";

describe("@wvp/utils", () => {
  it("formatMs formats sub-second values", () => {
    expect(formatMs(450)).toBe("450ms");
  });

  it("formatMs formats second values", () => {
    expect(formatMs(1500)).toBe("1.50s");
  });

  it("getRatingColorClass returns correct classes", () => {
    expect(getRatingColorClass("good")).toBe("text-emerald-600");
  });

  it("safeJsonParse returns fallback on invalid JSON", () => {
    expect(safeJsonParse("invalid", { ok: false })).toEqual({ ok: false });
  });
});
