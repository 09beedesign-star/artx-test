import { X } from "lucide-react";

export const FIRST_TOP_UP_BANNER_DISMISSAL_STORAGE_KEY = "artx:home-first-top-up-banner:v1:closed-on";

export function getLocalCalendarDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isFirstTopUpBannerDismissedToday(
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage,
  date = new Date(),
) {
  try {
    return storage?.getItem(FIRST_TOP_UP_BANNER_DISMISSAL_STORAGE_KEY) === getLocalCalendarDay(date);
  } catch {
    return false;
  }
}

export function dismissFirstTopUpBannerForToday(
  storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage,
  date = new Date(),
) {
  try {
    storage?.setItem(FIRST_TOP_UP_BANNER_DISMISSAL_STORAGE_KEY, getLocalCalendarDay(date));
  } catch {
    // The banner can still close for this render when browser storage is unavailable.
  }
}

type HomeFirstTopUpBannerProps = {
  onDismiss: () => void;
  onOpenBilling: () => void;
};

export default function HomeFirstTopUpBanner({ onDismiss, onOpenBilling }: HomeFirstTopUpBannerProps) {
  return (
    <section className="relative h-[90px] shrink-0 bg-[#00FFE5] text-[#222222]">
      <button
        type="button"
        onClick={onOpenBilling}
        className="absolute inset-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#222222]"
        aria-label="查看首充活动并前往充值"
      />
      <p className="pointer-events-none flex h-full items-center justify-center px-14 text-center text-sm font-semibold leading-6 sm:text-base">
        首充 HKD 150，即赠 2,500 积分，立即充值
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-4 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center text-[#222222] transition-opacity hover:opacity-65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222]"
        aria-label="今日关闭首充活动"
        title="今日关闭"
      >
        <X size={22} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </section>
  );
}
