// Safari background setup: Safari Web Extensions (macOS / iOS) have no side panel and no DevTools panel, so the side
// panel page opens in a tab, and the extension is packaged with Xcode (see README: Safari).
import type { PlatformAdapter } from "./platform";

export const safariAdapter: PlatformAdapter = {
  name: "safari",
  hasSidePanel: false,
  browserName(ua) {
    const v = /Version\/(\d+)[\d.]* Safari/.exec(ua);
    return v ? `Safari ${v[1]}` : "Safari";
  },
  async setup() {},
};
