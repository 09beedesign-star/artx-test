/**
 * 第三方接口计费查询模块
 *
 * 封装佐糖、腾讯云等上游厂商的余额 / 账单查询 API，
 * 带 60 秒缓存与超时降级，避免频繁探测影响后台面板加载速度。
 *
 * 设计原则：
 * - 所有调用均为**只读**，不写任何数据
 * - 超时 5 秒自动降级返回 null，不阻塞主流程
 * - 返回 null 时前端展示「暂无数据」而非报错，保证面板可用性
 * - 调用失败不影响核心业务，日志记录但不抛异常
 *
 * 厂商能力实测（2026-09-12）：
 * - ✅ PicWish/佐糖：提供 `/api/customers/package-credits` 查余额，
 *   注意官方文档路径 `/tech/...` 是错的，实测 404。
 * - ✅ 腾讯云：VOD 凭据就是标准云 API 密钥，可调 DescribeAccountBalance 和
 *   DescribeBillSummaryByProduct（本月汇总）。
 * - ❌ 美图：未公开账户余额/用量查询 API，只能走控制台 ai.meitu.com。
 */

import crypto from "node:crypto";

const CACHE_TTL_MS = 60_000; // 60 秒缓存，避免频繁探测
const TIMEOUT_MS = 5_000; // 5 秒超时自动降级

type BillingInfo = {
  provider: string;
  balance?: number; // 剩余额度/余额
  used?: number; // 已用额度
  currency?: string; // 货币单位（元 / 点 / credits）
  summary?: string; // 简短汇总文案
  consoleUrl?: string; // 控制台/结算入口 URL
  error?: string; // 查询失败时的错误信息
};

const cache = new Map<string, { data: BillingInfo | null; expiry: number }>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function getCached(key: string): BillingInfo | null | undefined {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.data;
  return undefined;
}

function setCache(key: string, data: BillingInfo | null) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

/* ============ PicWish / 佐糖 ============ */
async function fetchPicwishBilling(): Promise<BillingInfo | null> {
  const key = process.env.PICWISH_API_KEY || process.env.AOS_API_KEY || "";
  if (!key) return null;

  try {
    // 官方文档写的 /tech/customers/package-credits 是错的（实测 404），
    // 真实可用路径是 /api/customers/package-credits。
    const res = await fetch("https://techsz.aoscdn.com/api/customers/package-credits", {
      headers: { "X-API-KEY": key },
    });
    if (!res.ok) {
      return {
        provider: "PicWish/佐糖",
        error: `HTTP ${res.status}`,
        consoleUrl: "https://picwish.com/my-account",
      };
    }
    const body = await res.json();
    if (body.status !== 200 || !Array.isArray(body.data)) {
      return {
        provider: "PicWish/佐糖",
        error: `Unexpected response: ${JSON.stringify(body).slice(0, 80)}`,
        consoleUrl: "https://picwish.com/my-account",
      };
    }
    const total = body.data.reduce((sum: number, p: any) => sum + Number(p.remaining_credits || 0), 0);
    const used = body.data.reduce((sum: number, p: any) => sum + Number(p.used_credits || 0), 0);
    return {
      provider: "PicWish/佐糖",
      balance: total,
      used,
      currency: "点",
      summary: `剩余 ${total.toFixed(1)} 点`,
      consoleUrl: "https://picwish.com/my-account",
    };
  } catch (error: any) {
    console.error("[provider-billing] PicWish query failed:", error.message);
    return {
      provider: "PicWish/佐糖",
      error: error.message,
      consoleUrl: "https://picwish.com/my-account",
    };
  }
}

export async function getPicwishBilling(): Promise<BillingInfo | null> {
  const cached = getCached("picwish");
  if (cached !== undefined) return cached;
  const result = await withTimeout(fetchPicwishBilling(), TIMEOUT_MS);
  setCache("picwish", result);
  return result;
}

/* ============ 腾讯云 VOD ============ */
function tc3Sign({
  secretId,
  secretKey,
  host,
  service,
  action,
  version,
  payload,
  region,
}: {
  secretId: string;
  secretKey: string;
  host: string;
  service: string;
  action: string;
  version: string;
  payload: string;
  region?: string;
}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  const hmac = (k: Buffer | string, s: string) =>
    crypto.createHmac("sha256", k).update(s).digest();

  const canonicalRequest = [
    "POST",
    "/",
    "",
    `content-type:application/json\nhost:${host}\n`,
    "content-type;host",
    hash(payload),
  ].join("\n");

  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");

  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = crypto
    .createHmac("sha256", secretSigning)
    .update(stringToSign)
    .digest("hex");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Host: host,
    "X-TC-Action": action,
    "X-TC-Version": version,
    "X-TC-Timestamp": String(timestamp),
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`,
  };
  if (region) headers["X-TC-Region"] = region;
  return headers;
}

async function callTencentCloud(
  action: string,
  version: string,
  payloadObj: any,
  service = "billing",
  host = "billing.tencentcloudapi.com"
): Promise<{ body: any; status: number } | null> {
  const secretId = process.env.TENCENT_VOD_SID || process.env.TENCENT_SECRET_ID || "";
  const secretKey = process.env.TENCENT_VOD_SKEY || process.env.TENCENT_SECRET_KEY || "";
  if (!secretId || !secretKey) return null;

  const payload = JSON.stringify(payloadObj);
  const headers = tc3Sign({ secretId, secretKey, host, service, action, version, payload });
  try {
    const res = await fetch(`https://${host}`, { method: "POST", headers, body: payload });
    const body = await res.json().catch(() => null);
    return { body, status: res.status };
  } catch (error: any) {
    console.error(`[provider-billing] Tencent ${action} failed:`, error.message);
    return null;
  }
}

async function fetchTencentBilling(): Promise<BillingInfo | null> {
  if (!process.env.TENCENT_VOD_SID || !process.env.TENCENT_VOD_SKEY) return null;

  try {
    const result = await callTencentCloud("DescribeAccountBalance", "2018-07-09", {});
    if (!result) return null;
    const { body } = result;
    if (body?.Response?.Error) {
      return {
        provider: "腾讯云 VOD",
        error: `${body.Response.Error.Code}: ${body.Response.Error.Message}`,
        consoleUrl: "https://console.cloud.tencent.com/expense/overview",
      };
    }
    const balanceCent = body?.Response?.Balance || 0;
    const balanceYuan = Number(balanceCent) / 100;
    return {
      provider: "腾讯云 VOD",
      balance: balanceYuan,
      currency: "元",
      summary: `账户余额 ${balanceYuan.toFixed(2)} 元`,
      consoleUrl: "https://console.cloud.tencent.com/expense/overview",
    };
  } catch (error: any) {
    console.error("[provider-billing] Tencent billing query failed:", error.message);
    return {
      provider: "腾讯云 VOD",
      error: error.message,
      consoleUrl: "https://console.cloud.tencent.com/expense/overview",
    };
  }
}

export async function getTencentBilling(): Promise<BillingInfo | null> {
  const cached = getCached("tencent");
  if (cached !== undefined) return cached;
  const result = await withTimeout(fetchTencentBilling(), TIMEOUT_MS);
  setCache("tencent", result);
  return result;
}

/* ============ 美图 ============ */
export async function getMeituBilling(): Promise<BillingInfo | null> {
  // 美图开放平台未公开账户余额/用量查询 API，只能走控制台。
  if (!process.env.ACCESS_KEY || !process.env.SECRET_KEY) return null;
  return {
    provider: "MEITU",
    summary: "暂无 API，请访问控制台",
    consoleUrl: "https://ai.meitu.com/",
  };
}

/* ============ 统一入口 ============ */
export async function getAllProviderBilling(): Promise<BillingInfo[]> {
  const [picwish, tencent, meitu] = await Promise.all([
    getPicwishBilling(),
    getTencentBilling(),
    getMeituBilling(),
  ]);
  return [picwish, tencent, meitu].filter((x): x is BillingInfo => x !== null);
}
