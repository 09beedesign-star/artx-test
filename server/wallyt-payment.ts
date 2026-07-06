import crypto from "node:crypto";

type WallytPaymentMethod = "wechat" | "alipay";

type WallytXml = Record<string, string | number | undefined | null>;

export type WallytPayMode = "native" | "wap";

export type WallytCreatePaymentInput = {
  orderId: string;
  body: string;
  amount: number;
  paymentMethod: WallytPaymentMethod;
  clientIp: string;
  callbackUrl?: string;
  mode?: WallytPayMode;
  attach?: string;
};

export type WallytPaymentResult = {
  provider: "wallyt";
  channelType: "WALLYT_WX_PAY" | "WALLYT_ALI_PAY" | "WX_WAP_PAY" | "ALI_WAP_PAY";
  service: string;
  payUrl: string;
  payUrlType: "qr" | "redirect";
  transactionId?: string;
  raw: Record<string, string>;
};

const DEFAULT_GATEWAY = "https://paycert.wepayez.com/pay/gateway";

const SERVICE_MAP: Record<WallytPaymentMethod, Record<WallytPayMode, { service: string; channelType: WallytPaymentResult["channelType"]; payField: string; payUrlType: WallytPaymentResult["payUrlType"] }>> = {
  wechat: {
    native: { service: "pay.weixin.native.intl", channelType: "WALLYT_WX_PAY", payField: "code_img_url", payUrlType: "qr" },
    wap: { service: "pay.weixin.wap.intl", channelType: "WX_WAP_PAY", payField: "pay_info", payUrlType: "redirect" },
  },
  alipay: {
    native: { service: "pay.alipay.native.intl", channelType: "WALLYT_ALI_PAY", payField: "code_img_url", payUrlType: "qr" },
    wap: { service: "pay.alipay.wappay.intl", channelType: "ALI_WAP_PAY", payField: "pay_url", payUrlType: "redirect" },
  },
};

function env(name: string) {
  return typeof process.env[name] === "string" ? process.env[name]!.trim() : "";
}

export function getWallytConfig() {
  const publicBaseUrl = env("OAUTH_PUBLIC_BASE_URL") || env("VITE_API_BASE_URL") || "https://backstage.artxsd.com";
  return {
    gatewayUrl: env("WALLYT_DOMAIN_URL") || DEFAULT_GATEWAY,
    mchId: env("WALLYT_MCH_ID"),
    signatureKey: env("WALLYT_SIGNATURE_KEY"),
    notifyUrl: env("WALLYT_NOTIFY_URL") || `${publicBaseUrl.replace(/\/$/, "")}/api/billing/wallyt/callback`,
    wxAppId: env("WALLYT_WX_APP_ID"),
  };
}

export function getWallytConfigStatus() {
  const config = getWallytConfig();
  return {
    provider: "wallyt",
    gatewayUrl: config.gatewayUrl,
    mchId: config.mchId ? maskValue(config.mchId, 4) : "",
    notifyUrl: config.notifyUrl,
    configured: Boolean(config.gatewayUrl && config.mchId && config.signatureKey && config.notifyUrl),
    missing: [
      !config.gatewayUrl ? "WALLYT_DOMAIN_URL" : "",
      !config.mchId ? "WALLYT_MCH_ID" : "",
      !config.signatureKey ? "WALLYT_SIGNATURE_KEY" : "",
      !config.notifyUrl ? "WALLYT_NOTIFY_URL" : "",
    ].filter(Boolean),
    wxAppIdConfigured: Boolean(config.wxAppId),
  };
}

function maskValue(value: string, keep = 4) {
  if (value.length <= keep) return "*".repeat(value.length);
  return `${"*".repeat(Math.max(0, value.length - keep))}${value.slice(-keep)}`;
}

function nonce() {
  return crypto.randomBytes(16).toString("hex");
}

function formatWallytTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function amountToCents(amount: number) {
  return Math.max(1, Math.round(amount * 100));
}

function normalizeValue(value: string | number | undefined | null) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function signWallytParams(params: WallytXml, signatureKey = getWallytConfig().signatureKey) {
  if (!signatureKey) throw new Error("WALLYT_SIGNATURE_KEY is not configured");
  const signString = Object.entries(params)
    .filter(([key, value]) => key !== "sign" && normalizeValue(value) !== "")
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, value]) => `${key}=${normalizeValue(value)}`)
    .join("&");
  return crypto.createHash("md5").update(`${signString}&key=${signatureKey}`, "utf8").digest("hex").toUpperCase();
}

export function verifyWallytSignature(params: Record<string, string>) {
  const sign = params.sign || "";
  if (!sign) return false;
  return signWallytParams(params) === sign.toUpperCase();
}

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toWallytXml(params: WallytXml) {
  const body = Object.entries(params)
    .filter(([, value]) => normalizeValue(value) !== "")
    .map(([key, value]) => `  <${key}>${escapeXml(normalizeValue(value))}</${key}>`)
    .join("\n");
  return `<xml>\n${body}\n</xml>`;
}

function decodeXmlValue(value: string) {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseWallytXml(xml: string) {
  const result: Record<string, string> = {};
  const content = xml
    .trim()
    .replace(/^<xml>/i, "")
    .replace(/<\/xml>$/i, "");
  const tagPattern = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(content))) {
    result[match[1]] = decodeXmlValue(match[2].trim());
  }
  return result;
}

async function postWallytXml(params: WallytXml) {
  const config = getWallytConfig();
  if (!config.gatewayUrl || !config.mchId || !config.signatureKey) {
    throw new Error(`威富通支付未配置完整：${getWallytConfigStatus().missing.join(", ")}`);
  }
  const signedParams = {
    ...params,
    mch_id: params.mch_id || config.mchId,
  };
  const xml = toWallytXml({
    ...signedParams,
    sign: signWallytParams(signedParams, config.signatureKey),
  });
  const response = await fetch(config.gatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/xml;charset=UTF-8" },
    body: xml,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`威富通网关请求失败：HTTP ${response.status}`);
  }
  return parseWallytXml(text);
}

export async function createWallytPayment(input: WallytCreatePaymentInput): Promise<WallytPaymentResult> {
  const config = getWallytConfig();
  const mode = input.mode || "native";
  const service = SERVICE_MAP[input.paymentMethod][mode];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  const params: WallytXml = {
    service: service.service,
    version: "2.0",
    charset: "UTF-8",
    sign_type: "MD5",
    mch_id: config.mchId,
    out_trade_no: input.orderId,
    body: input.body.slice(0, 40),
    total_fee: amountToCents(input.amount),
    mch_create_ip: input.clientIp,
    notify_url: config.notifyUrl,
    time_start: formatWallytTime(now),
    time_expire: formatWallytTime(expiresAt),
    nonce_str: nonce(),
    attach: input.attach || "artx-billing",
  };

  if (input.paymentMethod === "wechat" && mode === "wap") {
    params.appid = config.wxAppId;
    params.payer_client_ip = input.clientIp;
  }
  if (input.paymentMethod === "alipay" && mode === "wap") {
    params.callback_url = input.callbackUrl;
  }
  if (mode === "native") {
    params.product_id = input.orderId;
  }

  const raw = await postWallytXml(params);
  if (raw.status !== "0" || raw.result_code !== "0") {
    throw new Error(raw.err_msg || raw.message || raw.result_msg || "威富通下单失败");
  }
  const payUrl = raw[service.payField] || raw.pay_url || raw.pay_info || "";
  if (!payUrl) {
    throw new Error("威富通下单成功但未返回支付链接");
  }
  return {
    provider: "wallyt",
    channelType: service.channelType,
    service: service.service,
    payUrl,
    payUrlType: service.payUrlType,
    transactionId: raw.transaction_id,
    raw,
  };
}

export async function queryWallytOrder(orderId: string) {
  const config = getWallytConfig();
  const raw = await postWallytXml({
    service: "unified.trade.query",
    version: "2.0",
    charset: "UTF-8",
    sign_type: "MD5",
    mch_id: config.mchId,
    out_trade_no: orderId,
    nonce_str: nonce(),
  });
  return raw;
}

export function isWallytPaymentSuccess(params: Record<string, string>) {
  return params.status === "0" && params.result_code === "0" && params.pay_result === "0";
}

export function getClientIp(headers: Record<string, unknown>, socketAddress?: string | null) {
  const forwarded = typeof headers["x-forwarded-for"] === "string" ? headers["x-forwarded-for"].split(",")[0]?.trim() : "";
  const realIp = typeof headers["x-real-ip"] === "string" ? headers["x-real-ip"].trim() : "";
  return forwarded || realIp || socketAddress || "127.0.0.1";
}
