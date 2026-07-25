import { describe, expect, it } from "vitest";

import {
  dismissFirstTopUpBannerForToday,
  FIRST_TOP_UP_BANNER_DISMISSAL_STORAGE_KEY,
  isFirstTopUpBannerDismissedToday,
} from "./HomeFirstTopUpBanner";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) || null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("HomeFirstTopUpBanner 3-hour dismissal", () => {
  it("keeps the banner closed within 3 hours and restores it after that window", () => {
    const storage = createMemoryStorage();
    const dismissedAt = new Date(2026, 6, 20, 14, 30);
    const withinWindow = new Date(2026, 6, 20, 17, 29, 59);
    const outsideWindow = new Date(2026, 6, 20, 17, 30, 0);

    dismissFirstTopUpBannerForToday(storage, dismissedAt);

    expect(storage.getItem(FIRST_TOP_UP_BANNER_DISMISSAL_STORAGE_KEY)).toBe(String(dismissedAt.getTime()));
    expect(isFirstTopUpBannerDismissedToday(storage, withinWindow)).toBe(true);
    expect(isFirstTopUpBannerDismissedToday(storage, outsideWindow)).toBe(false);
  });
});
