import { useCallback, useEffect, useRef, useState } from "react";
import { Gift, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ART_X_TEST_API_BASE_URL, defaultApiBaseUrlForCurrentHost, normalizeApiBaseUrl } from "@/lib/api-base-url";

type CreditNotification = {
  id: string;
  amount: number;
  balance: number;
  message: string;
  createdAt: string;
};

type CreditNotificationResponse = {
  balance?: number;
  notifications?: CreditNotification[];
};

function getCreditNotificationApiBaseUrl() {
  if (typeof window === "undefined") return ART_X_TEST_API_BASE_URL;
  const configured = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || "");
  if (configured) return configured;
  return defaultApiBaseUrlForCurrentHost(window.location.origin) || window.location.origin.replace(/\/+$/, "");
}

function getStoredAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? JSON.parse(raw) as { token?: string } : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

function dispatchCreditsUpdated(balance?: number) {
  if (typeof window === "undefined" || typeof balance !== "number") return;
  window.dispatchEvent(new CustomEvent("artx:credits-updated", {
    detail: { balance, reason: "admin-credit-gift" },
  }));
}

export default function CreditGrantNotification() {
  const { isAuthenticated, user } = useAuth();
  const [activeNotification, setActiveNotification] = useState<CreditNotification | null>(null);
  const [notificationQueue, setNotificationQueue] = useState<CreditNotification[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    const token = getStoredAuthToken();
    if (!token) return;

    const response = await fetch(`${getCreditNotificationApiBaseUrl()}/api/billing/credit-notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({})) as CreditNotificationResponse;
    if (!response.ok) return;
    dispatchCreditsUpdated(payload.balance);

    const nextNotifications = (payload.notifications || []).filter((item) => {
      if (!item?.id || seenIdsRef.current.has(item.id)) return false;
      seenIdsRef.current.add(item.id);
      return true;
    });
    if (nextNotifications.length === 0) return;
    setNotificationQueue((current) => [...current, ...nextNotifications]);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveNotification(null);
      setNotificationQueue([]);
      seenIdsRef.current.clear();
      return;
    }

    void fetchNotifications();
    const interval = window.setInterval(() => void fetchNotifications(), 2_000);
    const handleFocus = () => void fetchNotifications();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchNotifications, isAuthenticated, user?.id]);

  useEffect(() => {
    if (activeNotification || notificationQueue.length === 0) return;
    const [next, ...rest] = notificationQueue;
    setActiveNotification(next);
    setNotificationQueue(rest);
    dispatchCreditsUpdated(next.balance);
  }, [activeNotification, notificationQueue]);

  const acknowledgeNotification = async () => {
    if (!activeNotification) return;
    const confirmed = activeNotification;
    setActiveNotification(null);
    dispatchCreditsUpdated(confirmed.balance);

    const token = getStoredAuthToken();
    if (!token) return;
    try {
      const response = await fetch(
        `${getCreditNotificationApiBaseUrl()}/api/billing/credit-notifications/${encodeURIComponent(confirmed.id)}/ack`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const payload = await response.json().catch(() => ({})) as { balance?: number };
      if (response.ok) dispatchCreditsUpdated(payload.balance);
    } catch {
      // The user already confirmed the local popup. If the network is down,
      // the server will keep the unread notification for a later session.
    }
  };

  if (!isAuthenticated || !activeNotification) return null;

  return (
    <aside
      className="fixed right-5 top-20 z-[2147483500] w-[360px] max-w-[calc(100vw-40px)] overflow-hidden rounded-[22px] border border-[#C5ED47]/35 bg-[#1d1d1d]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl"
      role="dialog"
      aria-live="polite"
      aria-label="系统赠送积分通知"
      data-testid="credit-grant-notification"
    >
      <div className="absolute -right-10 -top-10 size-28 rounded-full bg-[#C5ED47]/25 blur-2xl" />
      <div className="relative p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-[#C5ED47] text-[#1d1d1d] shadow-[0_0_24px_rgba(197,237,71,0.38)]">
            <Gift size={21} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles size={14} className="text-[#C5ED47]" />
              系统积分赠送
            </div>
            <p className="mt-0.5 text-xs text-white/52">余额已同步刷新</p>
          </div>
        </div>

        <p className="text-[15px] leading-7 text-white/88">
          {activeNotification.message}
        </p>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.045] px-4 py-3">
          <span className="text-xs text-white/50">当前积分余额</span>
          <span className="text-lg font-semibold text-[#C5ED47]">
            {activeNotification.balance.toLocaleString("zh-CN")}
          </span>
        </div>

        <button
          type="button"
          className="mt-4 h-11 w-full rounded-full bg-[#C5ED47] px-4 text-sm font-semibold text-[#1d1d1d] transition hover:bg-[#d7ff60] focus:outline-none focus:ring-2 focus:ring-[#C5ED47]/50"
          onClick={acknowledgeNotification}
        >
          确认
        </button>
      </div>
    </aside>
  );
}
