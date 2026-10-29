import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { settleVoiceRemainder, VOICE_MAX_SECONDS } from "../shared/voice-input";
import {
  __resetVoiceSessionsForTest,
  buildSignedAsrUrl,
  closeVoiceSession,
  computeBillableMs,
  getVoiceAsrConfig,
  openVoiceSession,
} from "./voice-asr";
import { applyAsrResult } from "../client/src/lib/voice-ws-client";
import { downsampleToInt16 } from "../client/src/hooks/useVoiceInput";
import { joinVoiceText } from "../client/src/components/VoiceInputButton";

describe("语音输入 · 小数累计计费", () => {
  it("不满 1 分只记余数，不真实扣分", () => {
    const r = settleVoiceRemainder(0, 10_000); // 10s × 4/min = 0.6667
    expect(r.whole).toBe(0);
    expect(r.remainder).toBeCloseTo(0.666667, 5);
  });

  it("累计满 1 才扣 1 分，余数结转", () => {
    const first = settleVoiceRemainder(0, 10_000);
    const second = settleVoiceRemainder(first.remainder, 10_000);
    expect(second.whole).toBe(1);
    expect(second.remainder).toBeCloseTo(0.333333, 5);
  });

  it("浮点边界：3 × 5s 恰好 1 分不会漏扣", () => {
    let rem = 0;
    let charged = 0;
    for (let i = 0; i < 3; i += 1) {
      const r = settleVoiceRemainder(rem, 5_000);
      rem = r.remainder;
      charged += r.whole;
    }
    expect(charged).toBe(1);
    expect(rem).toBe(0);
  });

  it("非法输入按 0 处理", () => {
    expect(settleVoiceRemainder(Number.NaN, -1)).toEqual({ cost: 0, whole: 0, remainder: 0 });
  });
});

describe("语音输入 · 腾讯云签名", () => {
  const config = { appId: "1250000000", secretId: "AKIDtest", secretKey: "secretkey", engine: "16k_zh" };

  it("签名 = base64(hmac_sha1(去掉 wss:// 的 URL)) 并 urlencode", () => {
    const url = buildSignedAsrUrl(config, { voiceId: "v1", nowSeconds: 1_700_000_000, nonce: 42 });
    expect(url.startsWith("wss://asr.cloud.tencent.com/asr/v2/1250000000?")).toBe(true);
    const [plainWithScheme, sig] = url.split("&signature=");
    const plain = plainWithScheme.replace(/^wss:\/\//, "");
    const expected = crypto.createHmac("sha1", "secretkey").update(plain).digest("base64");
    expect(decodeURIComponent(sig)).toBe(expected);
  });

  it("参数按字典序且包含 60s 上限与过期时间", () => {
    const url = buildSignedAsrUrl(config, { voiceId: "v1", nowSeconds: 100, nonce: 1 });
    const keys = url.split("?")[1].split("&signature=")[0].split("&").map((p) => p.split("=")[0]);
    expect(keys).toEqual([...keys].sort());
    expect(url).toContain(`max_speak_time=${VOICE_MAX_SECONDS * 1000}`);
    expect(url).toContain("expired=220");
  });

  it("密钥缺省回退到 TENCENTCLOUD_*，缺 APPID 视为未开通", () => {
    expect(getVoiceAsrConfig({ TENCENTCLOUD_SECRET_ID: "a", TENCENTCLOUD_SECRET_KEY: "b" } as NodeJS.ProcessEnv)).toBeNull();
    expect(
      getVoiceAsrConfig({ TENCENT_ASR_APP_ID: "1", TENCENTCLOUD_SECRET_ID: "a", TENCENTCLOUD_SECRET_KEY: "b" } as NodeJS.ProcessEnv),
    ).toEqual({ appId: "1", secretId: "a", secretKey: "b", engine: "16k_zh_en_2.0" });
    // 显式配置时以配置为准（可回退到标准版）。
    expect(
      getVoiceAsrConfig({ TENCENT_ASR_APP_ID: "1", TENCENT_VOD_SID: "a", TENCENT_VOD_SKEY: "b", TENCENT_ASR_ENGINE: "16k_zh" } as NodeJS.ProcessEnv)?.engine,
    ).toBe("16k_zh");
  });
});

describe("语音输入 · 服务端计时", () => {
  beforeEach(() => __resetVoiceSessionsForTest());

  it("时长以服务端为准，扣除握手开销并封顶 60s", () => {
    expect(computeBillableMs(0, 400)).toBe(0);
    expect(computeBillableMs(0, 10_600)).toBe(10_000);
    expect(computeBillableMs(0, 999_999)).toBe(VOICE_MAX_SECONDS * 1000);
  });

  it("只有本人能结束会话；重复结束返回 null（幂等）", () => {
    const { session } = openVoiceSession({ id: "u1", username: "a" }, 0);
    expect(closeVoiceSession(session.id, "u2", 5_000)).toBeNull();
    expect(closeVoiceSession(session.id, "u1", 5_600)?.billableMs).toBe(5_000);
    expect(closeVoiceSession(session.id, "u1", 6_000)).toBeNull();
  });

  it("同一用户新开会话时，旧会话被交出按放弃结算", () => {
    const first = openVoiceSession({ id: "u1", username: "a" }, 0);
    const second = openVoiceSession({ id: "u1", username: "a" }, 3_600);
    expect(second.abandoned.map((s) => s.id)).toEqual([first.session.id]);
    expect(second.abandoned[0].billableMs).toBe(3_000);
  });
});

describe("语音输入 · 前端纯函数", () => {
  it("按句 index 拼接，同一句的临时结果被覆盖", () => {
    const map = new Map<number, string>();
    applyAsrResult(map, { code: 0, result: { index: 0, slice_type: 1, voice_text_str: "一只" } });
    applyAsrResult(map, { code: 0, result: { index: 0, slice_type: 2, voice_text_str: "一只猫，" } });
    expect(applyAsrResult(map, { code: 0, result: { index: 1, slice_type: 1, voice_text_str: "赛博朋克" } })).toBe("一只猫，赛博朋克");
  });

  it("48k → 16k 降采样长度正确且值域在 Int16", () => {
    const input = new Float32Array(4800).fill(1);
    const out = downsampleToInt16(input, 48_000);
    expect(out.length).toBe(1600);
    expect(out[0]).toBe(0x7fff);
  });

  it("识别文本追加到原有提示词后，英文之间补空格", () => {
    expect(joinVoiceText("", "你好")).toBe("你好");
    expect(joinVoiceText("赛博朋克", "城市")).toBe("赛博朋克城市");
    expect(joinVoiceText("a cat", "on mars")).toBe("a cat on mars");
  });
});
