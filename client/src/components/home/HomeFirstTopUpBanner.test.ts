import { describe, expect, it } from "vitest";

import {
  dismissFirstTopUpBannerForToday,
  FIRST_TOP_UP_BANNER_DISMISSAL_STORAGE_KEY,
  getLocalCalendarDay,
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

describe("HomeFirstTopUpBanner daily dismissal", () => {
  it("uses the local calendar day instead of a UTC timestamp", () => {
    expect(getLocalCalendarDay(new Date(2026, 6, 20, 0, 5))).toBe("2026-07-20");
  });

  it("keeps the banner closed today and restores it on the next day", () => {
    const storage = createMemoryStorage();
    const today = new Date(2026, 6, 20, 14, 30);
    const tomorrow = new Date(2026, 6, 21, 8, 0);

    dismissFirstTopUpBannerForToday(storage, today);

    expect(storage.getItem(FIRST_TOP_UP_BANNER_DISMISSAL_STORAGE_KEY)).toBe("2026-07-20");
    expect(isFirstTopUpBannerDismissedToday(storage, today)).toBe(true);
    expect(isFirstTopUpBannerDismissedToday(storage, tomorrow)).toBe(false);
  });
});
