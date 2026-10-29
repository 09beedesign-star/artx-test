/**
 * 语音输入提示词 · 前后端共用配置。
 *
 * 计费规则（ericbi 2026-10-28 拍板）：
 *   1. 付费会员免费；Free 用户按识别时长扣积分。
 *   2. 前端**不展示**任何语音扣费文案。后台按时长累计小数积分，
 *      累计满 1 才真实扣 1 分（顶栏随之刷新），不满 1 只在后台记账。
 *   3. 赠送积分（gift 批次）在有效期内可以抵扣语音积分。
 *
 * 成本参考：腾讯云实时语音识别（大模型版）约 0.017 元/分钟；
 * Lite 套餐 39 元 / 8000 积分 → 1 积分 ≈ 0.0049 元 → 成本约 3.5 积分/分钟。
 */

/** Free 用户语音费率：积分 / 分钟（小数累计，满 1 才扣）。 */
export const VOICE_CREDITS_PER_MINUTE = 4;

/** 单次录音上限（秒），到点自动停止。 */
export const VOICE_MAX_SECONDS = 60;

/** 服务端计时容差：网络往返 + 结束包，超出部分不计。 */
export const VOICE_DURATION_GRACE_MS = 5_000;

/** 单用户每日语音会话上限（防刷）。 */
export const VOICE_DAILY_SESSION_LIMIT = 300;

/** 识别采样参数：16k / 16bit / 单声道 PCM，每 200ms 一包 = 6400 字节。 */
export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_CHUNK_SAMPLES = 3_200;

export type VoiceSessionResponse = {
  sessionId: string;
  /** 已签名的腾讯云实时 ASR WebSocket 地址，有效期很短，只用于本次连接。 */
  url: string;
  maxSeconds: number;
};

export type VoiceFinishResponse = {
  /** 本次真实扣除的整数积分（大多数情况为 0）。前端仅在 >0 时刷新顶栏。 */
  chargedCredits: number;
  balance: number;
};

/**
 * 小数累计结算：返回本次应真实扣除的整数积分与新的余数。
 * 纯函数，前后端单测共用。
 */
export function settleVoiceRemainder(previousRemainder: number, durationMs: number, creditsPerMinute = VOICE_CREDITS_PER_MINUTE) {
  const safePrev = Number.isFinite(previousRemainder) && previousRemainder > 0 ? previousRemainder : 0;
  const safeMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const cost = (safeMs / 60_000) * creditsPerMinute;
  const total = safePrev + cost;
  // 余数按 6 位小数存储，多次结转会累积 ~1e-6 的截断误差（3 × 0.333333 = 0.999999），
  // 所以容差必须大于存储精度，取 1e-5（对用户的影响 < 0.00001 积分）。
  const whole = Math.floor(total + 1e-5);
  const remainder = Math.max(0, Number((total - whole).toFixed(6)));
  return { cost, whole, remainder };
}
