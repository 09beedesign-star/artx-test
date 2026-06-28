import type { BillingCycleId, MembershipPlanId } from "@/lib/membership-plans";

export type PaymentMethod = "wechat" | "alipay";
export type BillingOrderStatus = "pending" | "paid";

export interface BillingOrder {
  id: string;
  planId: MembershipPlanId | string;
  cycleId: BillingCycleId | string;
  planName: string;
  cycleLabel: string;
  paymentMethod: PaymentMethod;
  amount: number;
  credits: number;
  bonusCredits: number;
  status: BillingOrderStatus;
  createdAt: string;
  paidAt?: string;
}

const AUTH_STORAGE_KEY = "artx-auth-session";
const BALANCE_KEY = "artx:billing:credit-balance";
const ORDERS_KEY = "artx:billing:orders";
export const BILLING_CHANGED_EVENT = "artx:billing-changed";
export const OPEN_MEMBERSHIP_EVENT = "artx:open-membership";

export function goToUpgradePage(source = "unknown") {
  const target = `/upgrade?source=${encodeURIComponent(source)}`;
  if (typeof window === "undefined") return target;
  window.history.pushState(null, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
  return target;
}

export function openMembershipDialog(source = "unknown") {
  window.dispatchEvent(new CustomEvent(OPEN_MEMBERSHIP_EVENT, { detail: { source } }));
}

export function notifyBillingChanged() {
  window.dispatchEvent(new Event(BILLING_CHANGED_EVENT));
}

export function getStoredCreditBalance() {
  if (typeof window === "undefined") return 75;
  const raw = window.localStorage.getItem(BALANCE_KEY);
  const value = raw ? Number(raw) : 75;
  return Number.isFinite(value) ? value : 75;
}

export function setStoredCreditBalance(nextBalance: number) {
  window.localStorage.setItem(BALANCE_KEY, String(Math.max(0, Math.round(nextBalance))));
  notifyBillingChanged();
}

export function getStoredOrders(): BillingOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ORDERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isBillingOrder) : [];
  } catch {
    return [];
  }
}

function setStoredOrders(orders: BillingOrder[]) {
  window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 20)));
  notifyBillingChanged();
}

function readAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return typeof parsed?.token === "string" ? parsed.token : "";
  } catch {
    return "";
  }
}

function getBillingApiBaseUrl() {
  const configured = (
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ""
  ).replace(/\/+$/, "");

  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return "https://artx-test.onrender.com";
  }

  return "";
}

async function fetchBilling(path: string, init?: RequestInit) {
  const token = readAuthToken();
  const response = await fetch(`${getBillingApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Billing API returned non-JSON");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Billing request failed");
  }
  return data;
}

export async function syncBillingStateFromServer() {
  const data = await fetchBilling("/api/billing/summary");
  const balance = typeof data?.balance === "number" ? data.balance : 0;
  const orders = Array.isArray(data?.orders) ? data.orders.filter(isBillingOrder) : [];
  setStoredCreditBalance(balance);
  setStoredOrders(orders);
  return { balance, orders };
}

export async function createServerBillingOrder(input: {
  planId: MembershipPlanId | string;
  cycleId: BillingCycleId | string;
  paymentMethod: PaymentMethod;
}) {
  const data = await fetchBilling("/api/billing/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const order = data?.order;
  if (!isBillingOrder(order)) {
    throw new Error("订单返回格式不正确");
  }
  const nextOrders = [order, ...getStoredOrders().filter((item) => item.id !== order.id)].slice(0, 20);
  setStoredOrders(nextOrders);
  return order;
}

export async function markServerBillingOrderPaid(orderId: string) {
  await fetchBilling(`/api/billing/orders/${encodeURIComponent(orderId)}/pay`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return syncBillingStateFromServer();
}

function isBillingOrder(value: unknown): value is BillingOrder {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BillingOrder>;
  return typeof item.id === "string" &&
    typeof item.planName === "string" &&
    typeof item.amount === "number" &&
    typeof item.credits === "number" &&
    (item.paymentMethod === "wechat" || item.paymentMethod === "alipay") &&
    (item.status === "pending" || item.status === "paid");
}
