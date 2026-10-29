/**
 * 语音输入提示词 · HTTP 处理器。生产 express 与本地 vite dev 共用同一份实现。
 *
 *   POST /api/voice/session         → { sessionId, url, maxSeconds }   余额不足 402
 *   POST /api/voice/session/finish  body { sessionId, recognized } → { chargedCredits, balance }
 *
 * 身份由调用方从会话解析后传入，绝不接受请求体里的用户信息。
 * 计时以服务端为准；前端只告诉我们「有没有识别出文字」（只能让自己少付钱，不能多付）。
 */

import crypto from "node:crypto";
import { VOICE_DAILY_SESSION_LIMIT, VOICE_MAX_SECONDS, type VoiceFinishResponse, type VoiceSessionResponse } from "../shared/voice-input";
import { AiBillingError, assertCanStartVoiceInput, settleVoiceInputUsage } from "./admin-store";
import { buildSignedAsrUrl, closeVoiceSession, getVoiceAsrConfig, openVoiceSession } from "./voice-asr";

type VoiceUser = { id: string; username: string };
type Result<T> = { status: number; body: T | { error: string; code?: string; requiredCredits?: number; availableCredits?: number } };

const dailyCounters = new Map<string, { day: string; count: number }>();

function takeDailyQuota(userId: string) {
  const day = new Date().toISOString().slice(0, 10);
  const current = dailyCounters.get(userId);
  const next = current && current.day === day ? { day, count: current.count + 1 } : { day, count: 1 };
  dailyCounters.set(userId, next);
  return next.count <= VOICE_DAILY_SESSION_LIMIT;
}

export async function startVoiceSession(user: VoiceUser): Promise<Result<VoiceSessionResponse>> {
  const config = getVoiceAsrConfig();
  if (!config) return { status: 503, body: { error: "语音输入暂未开通" } };
  if (!takeDailyQuota(user.id)) return { status: 429, body: { error: "今日语音输入次数已达上限" } };
  try {
    await assertCanStartVoiceInput(user.id);
  } catch (error) {
    if (error instanceof AiBillingError) {
      return {
        status: 402,
        body: { error: error.message, code: error.code, requiredCredits: error.requiredCredits, availableCredits: error.availableCredits },
      };
    }
    throw error;
  }

  const { session, abandoned } = openVoiceSession(user);
  // 上一段没正常结束（关页面、断网）：按服务端时长结算，并视作已识别（腾讯云已计费）。
  for (const item of abandoned) {
    await settleVoiceInputUsage({
      userId: item.userId,
      username: item.username,
      sessionId: item.id,
      durationMs: item.billableMs,
      recognized: true,
    });
  }
  const url = buildSignedAsrUrl(config, { voiceId: crypto.randomUUID() });
  return { status: 200, body: { sessionId: session.id, url, maxSeconds: VOICE_MAX_SECONDS } };
}

export async function finishVoiceSession(user: VoiceUser, body: unknown): Promise<Result<VoiceFinishResponse>> {
  const payload = (body && typeof body === "object" ? body : {}) as { sessionId?: unknown; recognized?: unknown };
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const closed = sessionId ? closeVoiceSession(sessionId, user.id) : null;
  // 找不到会话（重复提交 / 已被新会话顶替结算）→ 幂等返回 0，不报错。
  if (!closed) return { status: 200, body: { chargedCredits: 0, balance: -1 } };
  const settled = await settleVoiceInputUsage({
    userId: user.id,
    username: user.username,
    sessionId: closed.session.id,
    durationMs: closed.billableMs,
    recognized: payload.recognized !== false,
  });
  return { status: 200, body: { chargedCredits: settled.chargedCredits, balance: settled.balance } };
}
