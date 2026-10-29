/**
 * 语音输入提示词 · 腾讯云实时语音识别（WebSocket）签名 + 会话计时。
 *
 * 架构：浏览器拿到本文件签好的 wss 地址后**直连腾讯云**推流，音频不经过、不落地本服务器。
 * 服务端只做三件事：鉴权签名、记会话起止时间、结束时交给 admin-store 做隐形计费。
 *
 * 文档：https://cloud.tencent.com/document/product/1093/48982
 *   签名原文 = 去掉 wss:// 的完整 URL（参数按字典序，不含 signature）
 *   signature = urlencode(base64(hmac_sha1(原文, SecretKey)))
 *
 * 环境变量：
 *   TENCENT_ASR_APP_ID        必填，腾讯云账号 APPID（数字）
 *   TENCENT_ASR_SECRET_ID     缺省回退 TENCENTCLOUD_SECRET_ID → TENCENT_VOD_SID
 *   TENCENT_ASR_SECRET_KEY    缺省回退 TENCENTCLOUD_SECRET_KEY → TENCENT_VOD_SKEY
 *   TENCENT_ASR_ENGINE        引擎，默认 16k_zh
 */

import crypto from "node:crypto";
import { VOICE_DURATION_GRACE_MS, VOICE_MAX_SECONDS } from "../shared/voice-input";

const SIGN_TTL_SECONDS = 120;
/** 握手 / 结束包的固定开销，从服务端计时里扣掉，避免把连接时间算给用户。 */
const HANDSHAKE_OVERHEAD_MS = 600;

export type VoiceAsrConfig = {
  appId: string;
  secretId: string;
  secretKey: string;
  engine: string;
};

export function getVoiceAsrConfig(env: NodeJS.ProcessEnv = process.env): VoiceAsrConfig | null {
  const appId = (env.TENCENT_ASR_APP_ID || "").trim();
  // 回退链：ASR 专用 → 通用（短信那组）→ VOD 那组（生产 .env.gray 目前只有这组）。
  const secretId = (env.TENCENT_ASR_SECRET_ID || env.TENCENTCLOUD_SECRET_ID || env.TENCENT_CLOUD_SECRET_ID || env.TENCENT_VOD_SID || "").trim();
  const secretKey = (env.TENCENT_ASR_SECRET_KEY || env.TENCENTCLOUD_SECRET_KEY || env.TENCENT_CLOUD_SECRET_KEY || env.TENCENT_VOD_SKEY || "").trim();
  if (!appId || !secretId || !secretKey) return null;
  return { appId, secretId, secretKey, engine: (env.TENCENT_ASR_ENGINE || "16k_zh").trim() };
}

/** 生成已签名的实时识别 wss 地址。纯函数（时间、随机数可注入），便于单测对拍官方示例。 */
export function buildSignedAsrUrl(
  config: VoiceAsrConfig,
  options: { voiceId: string; nowSeconds?: number; nonce?: number; maxSpeakMs?: number },
) {
  const timestamp = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const params: Record<string, string> = {
    convert_num_mode: "1",
    engine_model_type: config.engine,
    expired: String(timestamp + SIGN_TTL_SECONDS),
    filter_dirty: "1",
    filter_modal: "1",
    max_speak_time: String(options.maxSpeakMs ?? VOICE_MAX_SECONDS * 1000),
    needvad: "1",
    nonce: String(options.nonce ?? crypto.randomInt(1, 2_000_000_000)),
    secretid: config.secretId,
    timestamp: String(timestamp),
    voice_format: "1",
    voice_id: options.voiceId,
  };
  const query = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const plain = `asr.cloud.tencent.com/asr/v2/${config.appId}?${query}`;
  const signature = crypto.createHmac("sha1", config.secretKey).update(plain).digest("base64");
  return `wss://${plain}&signature=${encodeURIComponent(signature)}`;
}

type VoiceSession = {
  id: string;
  userId: string;
  username: string;
  startedAt: number;
};

/**
 * 进行中的会话只放内存：生产是单实例 fork（ecosystem.config.cjs instances=1）。
 * 进程重启会丢掉未结束的会话 = 少收几秒的钱，可接受；不会多收。
 */
const sessions = new Map<string, VoiceSession>();

export function openVoiceSession(user: { id: string; username: string }, now = Date.now()) {
  // 同一用户同时只允许一个会话：上一个没结束的先取出来交给调用方按「被放弃」结算。
  const abandoned: Array<VoiceSession & { billableMs: number }> = [];
  sessions.forEach((session, id) => {
    const expired = now - session.startedAt > VOICE_MAX_SECONDS * 1000 + VOICE_DURATION_GRACE_MS * 4;
    if (session.userId === user.id || expired) {
      sessions.delete(id);
      abandoned.push({ ...session, billableMs: computeBillableMs(session.startedAt, now) });
    }
  });
  const session: VoiceSession = { id: `vs_${crypto.randomUUID()}`, userId: user.id, username: user.username, startedAt: now };
  sessions.set(session.id, session);
  return { session, abandoned };
}

/** 结束会话。只认本人；时长一律以服务端计时为准，不信任前端上报。 */
export function closeVoiceSession(sessionId: string, userId: string, now = Date.now()) {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return null;
  sessions.delete(sessionId);
  return { session, billableMs: computeBillableMs(session.startedAt, now) };
}

export function computeBillableMs(startedAt: number, now: number) {
  const elapsed = Math.max(0, now - startedAt - HANDSHAKE_OVERHEAD_MS);
  return Math.min(elapsed, VOICE_MAX_SECONDS * 1000);
}

/** 测试专用。 */
export function __resetVoiceSessionsForTest() {
  sessions.clear();
}
