import { describe, expect, it } from "vitest";
import {
  InMemoryRateLimiter,
  evaluateRateLimit,
  readRuleFromEnv,
  resolveClientIp,
} from "./ai-rate-limit";

/**
 * 生图接口防刷限流的行为锁。
 *
 * 全部是**真行为断言**（纯函数 + 类），没有源码字符串断言 ——
 * 本项目的判据是「能测真行为就不要去 grep 源码」。
 */

const RULE = { limit: 3, windowMs: 60_000 };

describe("限流内核：每 IP 每分钟 3 次", () => {
  it("前 3 次放行，第 4 次拒绝", () => {
    const limiter = new InMemoryRateLimiter(RULE);
    const t0 = 1_000_000;
    expect(limiter.check("1.1.1.1", t0).allowed).toBe(true);
    expect(limiter.check("1.1.1.1", t0 + 100).allowed).toBe(true);
    expect(limiter.check("1.1.1.1", t0 + 200).allowed).toBe(true);
    expect(limiter.check("1.1.1.1", t0 + 300).allowed).toBe(false);
  });

  it("remaining 逐次递减到 0，不会出现负数", () => {
    const limiter = new InMemoryRateLimiter(RULE);
    const t0 = 2_000_000;
    expect(limiter.check("a", t0).remaining).toBe(2);
    expect(limiter.check("a", t0 + 1).remaining).toBe(1);
    expect(limiter.check("a", t0 + 2).remaining).toBe(0);
    expect(limiter.check("a", t0 + 3).remaining).toBe(0);
  });

  it("⚠️⚠️ 不同 IP 互不影响（桶必须按 IP 分开）", () => {
    const limiter = new InMemoryRateLimiter(RULE);
    const t0 = 3_000_000;
    for (let i = 0; i < 3; i += 1) limiter.check("1.1.1.1", t0 + i);
    // A 已耗尽，B 必须还是满配额 —— 若共用桶，这里会是 false
    expect(limiter.check("1.1.1.1", t0 + 10).allowed).toBe(false);
    expect(limiter.check("2.2.2.2", t0 + 10).allowed).toBe(true);
  });

  it("窗口过期后配额重置", () => {
    const limiter = new InMemoryRateLimiter(RULE);
    const t0 = 4_000_000;
    for (let i = 0; i < 3; i += 1) limiter.check("x", t0 + i);
    expect(limiter.check("x", t0 + 59_000).allowed).toBe(false);
    // 满 60s 后是新窗口
    expect(limiter.check("x", t0 + 60_000).allowed).toBe(true);
  });

  it("⚠️⚠️⚠️ 被拒的请求不能计数，否则正常用户会被永久挡住", () => {
    /*
     * 若把被拒也累加：恶意方在窗口内狂发 1000 次，count 变成 1003；
     * 窗口过期判定用的是 startedAt 所以还能重置，但在**同一窗口内**
     * 该 IP 后续所有请求都被拒 —— 相当于把「限流」升级成了「封禁」。
     * 这里锁住：连续被拒 5 次后，used 必须仍停在 limit。
     */
    const limiter = new InMemoryRateLimiter(RULE);
    const t0 = 5_000_000;
    for (let i = 0; i < 3; i += 1) limiter.check("y", t0 + i);
    let last = limiter.check("y", t0 + 10);
    for (let i = 0; i < 5; i += 1) last = limiter.check("y", t0 + 20 + i);
    expect(last.used).toBe(3);
    // 窗口一到就必须恢复，证明没被无限推高
    expect(limiter.check("y", t0 + 60_000).allowed).toBe(true);
  });

  it("retryAfterSec 至少为 1（报 0 会让客户端立刻重试再吃一个 429）", () => {
    const limiter = new InMemoryRateLimiter(RULE);
    const t0 = 6_000_000;
    for (let i = 0; i < 3; i += 1) limiter.check("z", t0 + i);
    const denied = limiter.check("z", t0 + 59_999);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("纯函数内核不依赖真实时钟（同一个 now 反复调用结果可预测）", () => {
    const first = evaluateRateLimit(undefined, RULE, 100);
    expect(first.decision.allowed).toBe(true);
    expect(first.nextState).toEqual({ startedAt: 100, count: 1 });
    const second = evaluateRateLimit(first.nextState, RULE, 100);
    expect(second.nextState.count).toBe(2);
  });
});

describe("内存回收：过期桶必须被清掉", () => {
  it("大量 IP 过期后 Map 不会无限膨胀", () => {
    const limiter = new InMemoryRateLimiter(RULE);
    const t0 = 7_000_000;
    for (let i = 0; i < 50; i += 1) limiter.check(`ip-${i}`, t0);
    expect(limiter.size).toBe(50);
    // 越过一个窗口后再来一个请求，触发惰性清理
    limiter.check("fresh", t0 + 120_000);
    expect(limiter.size).toBeLessThanOrEqual(2);
  });
});

describe("⚠️⚠️⚠️ 真实客户端 IP 解析（最容易静默失效的一环）", () => {
  it("信任反代时取 X-Forwarded-For 的第一段", () => {
    const ip = resolveClientIp(
      { "x-forwarded-for": "203.0.113.9, 10.0.0.1, 127.0.0.1" },
      "127.0.0.1",
      true
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("不信任反代时必须忽略 XFF（否则客户端可伪造绕过限流）", () => {
    const ip = resolveClientIp(
      { "x-forwarded-for": "1.2.3.4" },
      "198.51.100.7",
      false
    );
    expect(ip).toBe("198.51.100.7");
  });

  it("⚠️⚠️ 没有 XFF 时回落 socket 地址，绝不能返回空串", () => {
    // 返回空串会让所有无 XFF 的请求落进同一个 "" 桶，等于全站共享配额
    expect(resolveClientIp({}, "198.51.100.7", true)).toBe("198.51.100.7");
    expect(resolveClientIp({}, undefined, true)).toBe("unknown");
  });

  it("IPv6 映射的 IPv4 要归一化，否则同一用户占两个桶", () => {
    expect(resolveClientIp({}, "::ffff:203.0.113.9", false)).toBe("203.0.113.9");
    expect(
      resolveClientIp({ "x-forwarded-for": "::ffff:203.0.113.9" }, "127.0.0.1", true)
    ).toBe("203.0.113.9");
  });

  it("XFF 为空串/空白时不能当成有效 IP", () => {
    expect(resolveClientIp({ "x-forwarded-for": "   " }, "198.51.100.7", true)).toBe(
      "198.51.100.7"
    );
  });

  it("x-real-ip 作为 XFF 缺失时的备选（nginx 两个头都发）", () => {
    expect(resolveClientIp({ "x-real-ip": "203.0.113.5" }, "127.0.0.1", true)).toBe(
      "203.0.113.5"
    );
  });
});

describe("环境变量配置", () => {
  it("默认每分钟 12 次（档位理由见 ai-rate-limit.ts 的 DEFAULT_LIMIT_PER_WINDOW 注释）", () => {
    expect(readRuleFromEnv({})).toEqual({ limit: 12, windowMs: 60_000 });
  });

  it("可被环境变量覆盖", () => {
    expect(
      readRuleFromEnv({ AI_RATE_LIMIT_PER_MINUTE: "10", AI_RATE_LIMIT_WINDOW_SEC: "30" })
    ).toEqual({ limit: 10, windowMs: 30_000 });
  });

  it("⚠️⚠️ 显式配 0（临时关停限流）必须被尊重，不能被兜底成 3", () => {
    /*
     * 若实现写成 `parseInt(x) || 3`，配 0 会因为 0 是 falsy 而被吃掉，
     * 运维以为关停了限流、实际仍在限 3 次 —— 零报错的配置陷阱。
     */
    expect(readRuleFromEnv({ AI_RATE_LIMIT_PER_MINUTE: "0" }).limit).toBe(0);
  });

  it("非法值回落默认，不能变成 NaN（NaN 比较恒 false → 限流彻底失效）", () => {
    expect(readRuleFromEnv({ AI_RATE_LIMIT_PER_MINUTE: "abc" }).limit).toBe(12);
    expect(readRuleFromEnv({ AI_RATE_LIMIT_WINDOW_SEC: "-5" }).windowMs).toBe(60_000);
  });
});

/*
 * 下面这组是**业务账的回归防线**，不是在重测算法。
 *
 * 限流阈值调得太低会**误伤付费用户**，表现是「用到一半突然报错」，
 * 排查时几乎不会有人想到去看限流配置。所以把「一次产品操作到底发几个请求」
 * 这笔账钉成测试：以后有人把默认值改小，这里会先变红。
 */
describe("默认档位必须能撑住真实产品用量（误伤防线）", () => {
  /** 实测：智能文案编辑一次操作 = /api/images/ocr + /api/images/edit。 */
  const REQUESTS_PER_SMART_TEXT_EDIT = 2;

  it("⚠️⚠️⚠️ 一分钟内要能完成至少 5 次智能文案编辑（每次 2 个请求）", () => {
    const rule = readRuleFromEnv({});
    const limiter = new InMemoryRateLimiter(rule);
    const t0 = 1_000_000;

    let completedEdits = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const decisions = Array.from({ length: REQUESTS_PER_SMART_TEXT_EDIT }, () =>
        limiter.check("203.0.113.9|ai", t0),
      );
      // 一次操作的两个请求**都**得过，只过一个等于操作失败
      if (decisions.every(d => d.allowed)) completedEdits += 1;
    }

    expect(completedEdits).toBeGreaterThanOrEqual(5);
  });

  it("但仍然是个真闸门：无限刷下去一定会被拦", () => {
    const limiter = new InMemoryRateLimiter(readRuleFromEnv({}));
    const t0 = 2_000_000;
    const results = Array.from({ length: 100 }, () => limiter.check("198.51.100.4|ai", t0));
    const blocked = results.filter(r => !r.allowed).length;

    // 恒绿的检测器等于没有检测器 —— 必须真的拦到了东西
    expect(blocked).toBeGreaterThan(0);
    expect(results.filter(r => r.allowed).length).toBe(readRuleFromEnv({}).limit);
  });
});
