#!/usr/bin/env node
import crypto from "node:crypto";

const backendUrl = (process.env.BACKEND_URL || "https://backstage.artxsd.com").replace(/\/+$/, "");
const publicUrl = (process.env.PUBLIC_URL || backendUrl).replace(/\/+$/, "");
const username = process.env.ARTX_SMOKE_USERNAME || `artx-smoke-${Date.now()}@example.com`;
const password = process.env.ARTX_SMOKE_PASSWORD || `Smoke-${Date.now()}-1234`;
const runAuth = process.env.RUN_AUTH === "1";
const runSkill = process.env.RUN_SKILL_IMAGE === "1";
const runPaymentCallback = process.env.RUN_WALLYT_CALLBACK === "1";
const proxyImageUrl = process.env.PROXY_IMAGE_URL || "https://www.w3.org/Icons/w3c_home.png";
const skillId = process.env.SKILL_ID || "product-photography";
const skillPrompt = process.env.SKILL_PROMPT || "生成一张高端无线耳机的商品摄影图，哑光黑材质，干净背景，适合新品发布。";
const pollTimeoutMs = Number(process.env.SKILL_TIMEOUT_MS || 180000);

const results = [];

function record(name, status, details = "") {
  results.push({ name, status, details });
  const suffix = details ? ` - ${details}` : "";
  console.log(`${status === "ok" ? "OK" : status === "skip" ? "SKIP" : "FAIL"} ${name}${suffix}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body && typeof options.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const body = contentType.includes("application/json") || /^[\[{]/.test(text.trim())
    ? JSON.parse(text || "{}")
    : text;
  return { response, body, text, contentType };
}

function requireOk(condition, message) {
  if (!condition) throw new Error(message);
}

function signWallytParams(params, signatureKey) {
  const signString = Object.entries(params)
    .filter(([key, value]) => key !== "sign" && value !== undefined && value !== null && String(value).trim() !== "")
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, value]) => `${key}=${String(value).trim()}`)
    .join("&");
  return crypto.createHash("md5").update(`${signString}&key=${signatureKey}`, "utf8").digest("hex").toUpperCase();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toXml(params) {
  return `<xml>\n${Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `  <${key}>${escapeXml(value)}</${key}>`)
    .join("\n")}\n</xml>`;
}

async function ensureAuth() {
  if (!runAuth && !runSkill && !runPaymentCallback) {
    record("auth login", "skip", "set RUN_AUTH=1 to create/login a smoke user");
    return "";
  }
  const register = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!register.response.ok && !/已存在|already/i.test(JSON.stringify(register.body))) {
    throw new Error(`register failed: ${register.response.status} ${register.text}`);
  }
  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  requireOk(login.response.ok, `login failed: ${login.response.status} ${login.text}`);
  const token = login.body?.token;
  requireOk(token, "login response did not include token");
  return token;
}

async function verifyHealth() {
  const health = await request("/api/health");
  requireOk(health.response.ok && health.body?.ok === true, `health failed: ${health.response.status} ${health.text}`);
  record("backend /api/health", "ok");
}

async function verifyPublicHealth() {
  if (publicUrl === backendUrl) return;
  const response = await fetch(`${publicUrl}/api/health`);
  const body = await response.json().catch(() => null);
  requireOk(response.ok && body?.ok === true, `public /api/health failed: ${response.status}`);
  record("public /api/health", "ok", publicUrl);
}

async function verifyProxy() {
  const proxied = await fetch(`${backendUrl}/api/images/proxy?url=${encodeURIComponent(proxyImageUrl)}`);
  const contentType = proxied.headers.get("content-type") || "";
  const bytes = Buffer.from(await proxied.arrayBuffer()).byteLength;
  requireOk(proxied.ok, `image proxy failed: ${proxied.status}`);
  requireOk(contentType.startsWith("image/") || contentType === "application/octet-stream", `proxy returned ${contentType}`);
  requireOk(bytes > 100, `proxy returned too few bytes: ${bytes}`);
  record("image proxy", "ok", `${contentType}, ${bytes} bytes`);
}

async function verifySkillImage(token) {
  if (!runSkill) {
    record("Skill image generation", "skip", "set RUN_SKILL_IMAGE=1 to consume AI quota");
    return;
  }
  requireOk(token, "auth token is required for Skill image generation");
  const taskId = `gray-skill-${Date.now()}`;
  const created = await request("/api/images/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      taskId,
      prompt: skillPrompt,
      skillId,
      ratio: "1:1",
      model: process.env.SKILL_MODEL || undefined,
    }),
  });
  requireOk(created.response.ok, `skill task create failed: ${created.response.status} ${created.text}`);
  const deadline = Date.now() + pollTimeoutMs;
  let latest = created.body;
  while (Date.now() < deadline) {
    if (latest.status === "completed" || latest.status === "failed") break;
    await new Promise(resolve => setTimeout(resolve, 3000));
    const polled = await request(`/api/images/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    requireOk(polled.response.ok, `skill task poll failed: ${polled.response.status} ${polled.text}`);
    latest = polled.body;
  }
  requireOk(latest.status === "completed", `skill task did not complete: ${JSON.stringify(latest)}`);
  const imageSrc = latest.images?.[0]?.src || "";
  requireOk(imageSrc, "skill task completed without image src");
  const imageUrl = /^https?:\/\//i.test(imageSrc) ? imageSrc : `${backendUrl}${imageSrc.startsWith("/") ? "" : "/"}${imageSrc}`;
  const imageResponse = await fetch(imageUrl);
  requireOk(imageResponse.ok, `generated image not downloadable: ${imageResponse.status} ${imageUrl}`);
  const bytes = Buffer.from(await imageResponse.arrayBuffer()).byteLength;
  requireOk(bytes > 1000, `generated image too small: ${bytes}`);
  record("Skill image generation", "ok", `${skillId}, ${bytes} bytes`);
  record("generated image download", "ok", imageUrl.replace(/\?.*$/, ""));
}

async function verifyPaymentCallback(token) {
  const config = await request("/api/billing/config");
  requireOk(config.response.ok, `billing config failed: ${config.response.status} ${config.text}`);
  record("billing config", "ok", config.body?.configured ? "configured" : `missing: ${(config.body?.missing || []).join(", ")}`);

  if (!runPaymentCallback) {
    record("Wallyt callback", "skip", "set RUN_WALLYT_CALLBACK=1 on the server to create a small test order and signed callback");
    return;
  }
  requireOk(token, "auth token is required for Wallyt callback smoke test");
  const signatureKey = process.env.WALLYT_SIGNATURE_KEY || "";
  const mchId = process.env.WALLYT_MCH_ID || "";
  requireOk(signatureKey && mchId, "WALLYT_SIGNATURE_KEY and WALLYT_MCH_ID are required for callback smoke test");

  const orderResult = await request("/api/billing/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: "recharge", amount: 10, paymentMethod: "wechat" }),
  });
  requireOk(orderResult.response.ok, `create recharge order failed: ${orderResult.response.status} ${orderResult.text}`);
  const order = orderResult.body?.order;
  requireOk(order?.id && Number(order.amount) > 0, `invalid order response: ${orderResult.text}`);

  const callbackParams = {
    status: "0",
    result_code: "0",
    pay_result: "0",
    mch_id: mchId,
    out_trade_no: order.id,
    total_fee: String(Math.round(Number(order.amount) * 100)),
    transaction_id: `smoke_${Date.now()}`,
    nonce_str: crypto.randomBytes(8).toString("hex"),
  };
  const xml = toXml({ ...callbackParams, sign: signWallytParams(callbackParams, signatureKey) });
  const callback = await fetch(`${backendUrl}/api/billing/wallyt/callback`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml,
  });
  const text = await callback.text();
  requireOk(callback.ok && text.trim() === "success", `callback failed: ${callback.status} ${text}`);
  record("Wallyt callback", "ok", `order ${order.id}`);
}

async function main() {
  try {
    await verifyHealth();
    await verifyPublicHealth();
    await verifyProxy();
    const token = await ensureAuth();
    if (token) record("auth login", "ok", username);
    await verifyPaymentCallback(token);
    await verifySkillImage(token);
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
    record("smoke suite", "fail", `${error instanceof Error ? error.message : String(error)}${cause}`);
  }

  const failed = results.filter(result => result.status === "fail");
  const skipped = results.filter(result => result.status === "skip");
  console.log();
  console.log(`Summary: ${results.length - failed.length - skipped.length} ok, ${skipped.length} skipped, ${failed.length} failed`);
  if (failed.length) process.exit(1);
}

await main();
