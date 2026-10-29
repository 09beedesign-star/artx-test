#!/usr/bin/env node
/**
 * 语音输入 · 腾讯云 ASR 连通性自检（不打印任何密钥）。
 *
 *   node scripts/verify-voice-asr.mjs [envFile...]
 *
 * 1. 读取 env（默认 .env.local → .env，先读者胜出；生产机传 /opt/artx-gray-backend/.env.gray）
 * 2. 若缺 TENCENT_ASR_APP_ID，用 CAM GetUserAppId（只读）查出 APPID 并提示填写
 * 3. 用与线上同一套签名规则连 wss://asr.cloud.tencent.com，发 1 秒静音 + 结束包，
 *    看握手 code：0 = 可用；4002 鉴权失败；4003 未开通；4004/4005 额度/欠费
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2).length ? process.argv.slice(2) : [".env.local", ".env"];
const env = { ...process.env };
for (const file of files) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || env[m[1]]) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const secretId = env.TENCENT_ASR_SECRET_ID || env.TENCENTCLOUD_SECRET_ID || env.TENCENT_CLOUD_SECRET_ID || env.TENCENT_VOD_SID || "";
const secretKey = env.TENCENT_ASR_SECRET_KEY || env.TENCENTCLOUD_SECRET_KEY || env.TENCENT_CLOUD_SECRET_KEY || env.TENCENT_VOD_SKEY || "";
const engine = env.TENCENT_ASR_ENGINE || "16k_zh_en_2.0";
if (!secretId || !secretKey) {
  console.error("✗ 没有可用的腾讯云密钥（TENCENT_ASR_* / TENCENTCLOUD_* / TENCENT_VOD_*）");
  process.exit(1);
}
console.log(`· 密钥来源：${secretId.slice(0, 6)}…（${secretId.length} 位）`);

function tc3({ service, host, action, version, payload = "{}" }) {
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
  const hmac = (k, s) => crypto.createHmac("sha256", k).update(s).digest();
  const canonical = `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:${host}\n\ncontent-type;host\n${hash(payload)}`;
  const scope = `${date}/${service}/tc3_request`;
  const toSign = `TC3-HMAC-SHA256\n${ts}\n${scope}\n${hash(canonical)}`;
  const kSigning = hmac(hmac(hmac(`TC3${secretKey}`, date), service), "tc3_request");
  const signature = crypto.createHmac("sha256", kSigning).update(toSign).digest("hex");
  return fetch(`https://${host}`, {
    method: "POST",
    headers: {
      Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
      "Content-Type": "application/json; charset=utf-8",
      Host: host,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Timestamp": String(ts),
    },
    body: payload,
  }).then((r) => r.json());
}

let appId = env.TENCENT_ASR_APP_ID || "";
if (!appId) {
  const res = await tc3({ service: "cam", host: "cam.tencentcloudapi.com", action: "GetUserAppId", version: "2019-01-16" });
  if (res?.Response?.Error) {
    console.error(`✗ 查询 APPID 失败：${res.Response.Error.Code} ${res.Response.Error.Message}`);
    console.error("  请到 腾讯云控制台 → 账号信息 手动查看 APPID，填入 TENCENT_ASR_APP_ID");
    process.exit(1);
  }
  appId = String(res.Response.AppId);
  console.log(`· 未配置 TENCENT_ASR_APP_ID，查得 APPID=${appId}（请写入配置）`);
}

const now = Math.floor(Date.now() / 1000);
const params = {
  engine_model_type: engine,
  expired: String(now + 120),
  needvad: "1",
  nonce: String(crypto.randomInt(1, 2_000_000_000)),
  secretid: secretId,
  timestamp: String(now),
  voice_format: "1",
  voice_id: crypto.randomUUID(),
};
const query = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
const plain = `asr.cloud.tencent.com/asr/v2/${appId}?${query}`;
const signature = crypto.createHmac("sha1", secretKey).update(plain).digest("base64");
const url = `wss://${plain}&signature=${encodeURIComponent(signature)}`;

const result = await new Promise((resolve) => {
  const ws = new WebSocket(url);
  const timer = setTimeout(() => resolve({ code: -1, message: "连接超时" }), 10_000);
  let first = null;
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data));
    if (!first) {
      first = msg;
      if (msg.code !== 0) {
        clearTimeout(timer);
        resolve(msg);
        ws.close();
        return;
      }
      ws.send(new Uint8Array(32000).buffer); // 1 秒静音
      ws.send(JSON.stringify({ type: "end" }));
    }
    if (msg.final === 1) {
      clearTimeout(timer);
      resolve(first);
      ws.close();
    }
  };
  ws.onerror = () => {
    clearTimeout(timer);
    resolve({ code: -2, message: "WebSocket 握手被拒（通常是签名或 APPID 错误）" });
  };
});

const hints = { 4002: "鉴权失败：密钥无 ASR 权限或 APPID 不匹配", 4003: "账号未开通实时语音识别", 4004: "资源包/额度不足", 4005: "账户欠费" };
if (result.code === 0) {
  console.log(`✓ 腾讯云实时 ASR 可用（engine=${engine}, APPID=${appId}）`);
} else {
  console.error(`✗ ASR 不可用：code=${result.code} ${hints[result.code] || ""} ${result.message || ""}`);
  process.exit(2);
}
