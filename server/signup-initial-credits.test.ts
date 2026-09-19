import { describe, expect, it, vi } from "vitest";
import {
  SIGNUP_INITIAL_CREDITS,
  SIGNUP_INITIAL_CREDITS_LIMITS,
  SIGNUP_IP_RATE_LIMIT,
} from "../shared/billing-config";
import { signupRateLimitKeyOf } from "./auth-store";
import { resolveSignupInitialCreditsConfig } from "./admin-store";
import {
  AI_IMAGE_RESOLUTION_POLICIES,
  quoteAiUsage,
  resolveImageResolutionTier,
} from "../shared/ai-credit-policy";

/**
 * 注册初始额度 + 分辨率分档计费的行为测试。
 *
 * 这些断言保护的都是**会静默失效**的逻辑：
 * 幂等判错字段 → 用户无限领积分；落档判错边界 → 少收或多收钱。
 * 两类问题都不会报错，只会安静地让钱流错方向。
 */

describe("注册初始额度配置", () => {
  it("350 积分恰好等于默认档 5 张图", () => {
    const quote = quoteAiUsage({
      capability: "text_to_image",
      model: "vod-og25-sunburst-medium",
      resolutionTier: "1k",
    });
    expect(quote.chargedCredits).toBe(70);
    expect(SIGNUP_INITIAL_CREDITS.credits / quote.chargedCredits).toBe(5);
  });

  it("有效期是 3 天（不是 2 天，避免误伤周末注册的真实用户）", () => {
    expect(SIGNUP_INITIAL_CREDITS.expiryDays).toBe(3);
  });

  it("有效期必须短于默认赠送的 30 天，以制造使用紧迫感", () => {
    expect(SIGNUP_INITIAL_CREDITS.expiryDays).toBeLessThan(30);
  });
});

describe("注册初始额度只发一次", () => {
  /**
   * 【为什么值得单独测】
   * 额度是「注册时发」而不是「建号时给默认值」，这两者一旦同时存在
   * 就会变成 350 + 350 = 700，而且不会有任何报错 —— 后台看到的
   * 只是「这个新号余额 700」，看不出是多发了一份。
   *
   * 同样地，同一账号重复触发发放路径（重放注册请求、重登补发、MQ 重投）
   * 必须靠幂等键挡住。这个用例盯的就是这两个数都不能变成 700。
   */
  it("连发三次只到账 350，批次也只有一条", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "artx-signup-once-"));
    const previous = process.env.ARTX_DATA_DIR;
    process.env.ARTX_DATA_DIR = dir;
    try {
      /**
       * 必须打破模块缓存：admin-store 的 DATA_DIR 是模块顶层常量，
       * 复用已加载的模块会写到默认目录而不是这里的临时目录。
       */
      vi.resetModules();
      const store = await import("./admin-store");

      const first = await store.grantSignupInitialCredits({ userId: "u1", username: "u1@test" });
      const second = await store.grantSignupInitialCredits({ userId: "u1", username: "u1@test" });
      const third = await store.grantSignupInitialCredits({ userId: "u1", username: "u1@test" });

      const raw = JSON.parse(await fs.readFile(path.join(dir, "admin-data.json"), "utf8"));
      const user = raw.users.find((item: { id: string }) => item.id === "u1");
      const activeBatches = (raw.creditBatches || []).filter(
        (batch: { userId: string; status: string }) => batch.userId === "u1" && batch.status === "active",
      );

      expect(first).toBe(SIGNUP_INITIAL_CREDITS.credits);
      expect(second).toBe(0);
      expect(third).toBe(0);
      // ⭐ 关键：不是 700。
      expect(user.credits).toBe(SIGNUP_INITIAL_CREDITS.credits);
      // 批次与余额是同一笔钱的两种记账，不能各算一份。
      expect(activeBatches).toHaveLength(1);
      expect(activeBatches[0].remainingCredits).toBe(SIGNUP_INITIAL_CREDITS.credits);
    } finally {
      if (previous === undefined) delete process.env.ARTX_DATA_DIR;
      else process.env.ARTX_DATA_DIR = previous;
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("注册 IP 限频", () => {
  it("必须带时间窗，绝不能是永久限制", () => {
    // 永久限 3 次会把共享出口 IP（公司/学校/基站 NAT）的真实用户全挡死。
    expect(SIGNUP_IP_RATE_LIMIT.windowHours).toBeGreaterThan(0);
    expect(SIGNUP_IP_RATE_LIMIT.windowHours).toBe(24);
    expect(SIGNUP_IP_RATE_LIMIT.maxPerWindow).toBe(3);
  });

  it("IPv4 按 /24 网段归约，末段漂移仍算同一段", () => {
    expect(signupRateLimitKeyOf("203.0.113.7")).toBe("v4:203.0.113");
    expect(signupRateLimitKeyOf("203.0.113.200")).toBe(signupRateLimitKeyOf("203.0.113.7"));
    // 不同网段必须区分开，否则误伤面积过大
    expect(signupRateLimitKeyOf("203.0.114.7")).not.toBe(signupRateLimitKeyOf("203.0.113.7"));
  });

  it("兼容 IPv4-mapped IPv6 形式（express 在部分环境下给的就是这个）", () => {
    expect(signupRateLimitKeyOf("::ffff:203.0.113.7")).toBe("v4:203.0.113");
  });

  it("IPv6 按前 4 组（≈/64）归约", () => {
    expect(signupRateLimitKeyOf("2001:db8:1234:5678:9abc:def0:1234:5678"))
      .toBe("v6:2001:db8:1234:5678");
  });

  it("取不到 IP 时返回空串，调用方须放行而不是拦死", () => {
    expect(signupRateLimitKeyOf(undefined)).toBe("");
    expect(signupRateLimitKeyOf("")).toBe("");
    expect(signupRateLimitKeyOf("garbage")).toBe("");
  });

  it("网段配额必须显著宽于精确 IP 配额", () => {
    /**
     * 一个 /24 有 254 个地址，可能是整栋写字楼。
     * 若网段配额等于精确 IP 配额（3），「同事互邀注册」第 4 个人就会被拦 ——
     * invite-refund-rate-ban.test.ts 正是这样抓出这个缺陷的。
     */
    expect(SIGNUP_IP_RATE_LIMIT.maxPerSubnetWindow).toBeGreaterThan(
      SIGNUP_IP_RATE_LIMIT.maxPerWindow * 3,
    );
  });
});

describe("注册初始额度：后台可编辑配置的版本化补齐", () => {
  /**
   * 这一组测试守的是本项目**踩过两次**的坑：
   * 配置被快照进生产库后，代码里的新值永远生效不了，且全程零报错。
   * 事故复盘见 admin-store.ts:2602（扩图代码写 200 积分、实际只扣 16）。
   */

  it("库里没有配置时回落到代码默认值", () => {
    const resolved = resolveSignupInitialCreditsConfig(undefined);
    expect(resolved.credits).toBe(SIGNUP_INITIAL_CREDITS.credits);
    expect(resolved.expiryDays).toBe(SIGNUP_INITIAL_CREDITS.expiryDays);
    expect(resolved.configVersion).toBe(SIGNUP_INITIAL_CREDITS.configVersion);
  });

  it("⭐ 库值版本低于代码版本时必须被丢弃（否则旧快照永久盖住代码）", () => {
    const stale = {
      enabled: true,
      credits: 9999,
      expiryDays: 365,
      activeUntil: "2020-01-01",
      configVersion: SIGNUP_INITIAL_CREDITS.configVersion - 1,
    };
    const resolved = resolveSignupInitialCreditsConfig(stale);
    expect(resolved.credits).toBe(SIGNUP_INITIAL_CREDITS.credits);
    expect(resolved.expiryDays).toBe(SIGNUP_INITIAL_CREDITS.expiryDays);
  });

  it("版本号缺失或非数字的脏数据同样按过期处理", () => {
    for (const dirty of [{ credits: 9999 }, { credits: 9999, configVersion: "abc" }]) {
      expect(resolveSignupInitialCreditsConfig(dirty).credits).toBe(SIGNUP_INITIAL_CREDITS.credits);
    }
  });

  it("库值版本不低于代码版本时采用库值（后台改动能生效）", () => {
    const fresh = {
      enabled: false,
      credits: 500,
      expiryDays: 7,
      activeUntil: "2026-12-31",
      configVersion: SIGNUP_INITIAL_CREDITS.configVersion,
    };
    const resolved = resolveSignupInitialCreditsConfig(fresh);
    expect(resolved.enabled).toBe(false);
    expect(resolved.credits).toBe(500);
    expect(resolved.expiryDays).toBe(7);
    expect(resolved.activeUntil).toBe("2026-12-31");
  });

  it("半残对象要逐字段兜底，绝不能读出 undefined 参与算术", () => {
    // 只有 credits 没有 expiryDays —— 手改库或旧版本写入都可能造成。
    const partial = { credits: 500, configVersion: SIGNUP_INITIAL_CREDITS.configVersion };
    const resolved = resolveSignupInitialCreditsConfig(partial);
    expect(resolved.credits).toBe(500);
    expect(resolved.expiryDays).toBe(SIGNUP_INITIAL_CREDITS.expiryDays);
    expect(Number.isFinite(resolved.expiryDays)).toBe(true);
  });

  it("activeUntil 留空表示永久发放，必须归一成 undefined", () => {
    for (const blank of ["", "   ", null, undefined]) {
      const resolved = resolveSignupInitialCreditsConfig({
        credits: 350,
        expiryDays: 3,
        activeUntil: blank,
        configVersion: SIGNUP_INITIAL_CREDITS.configVersion,
      });
      expect(resolved.activeUntil).toBeUndefined();
    }
  });

  it("⭐ seed 分支也必须带上配置字段（首次建库路径不经过 normalize）", async () => {
    /**
     * loadAdminData 的 seed 分支会**绕过 normalizeDataAsync** 直接 saveAdminData，
     * 所以 seedAdminData() 里漏写字段 = 首次建库后配置为空。
     * 这个 bug 是端到端验证抓出来的（单测全绿但真跑一遍库里没有该字段）。
     *
     * 用真实的隔离数据目录跑一次首次初始化，确认字段真的落了库。
     */
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "artx-seed-"));
    const previous = process.env.ARTX_DATA_DIR;
    process.env.ARTX_DATA_DIR = dir;
    try {
      /**
       * 必须打破模块缓存重新 import：admin-store 的 DATA_DIR 是模块顶层常量，
       * 复用已加载的模块会写到默认目录而不是这里的临时目录。
       * vi.resetModules() 比动态 import 的 query 参数干净（后者会触发 vite 警告）。
       */
      vi.resetModules();
      const store = await import("./admin-store");
      await store.grantSignupInitialCredits({ userId: "seed-probe", username: "seed@test" });
      const raw = JSON.parse(await fs.readFile(path.join(dir, "admin-data.json"), "utf8"));
      expect(raw.signupInitialCredits).toBeTruthy();
      expect(raw.signupInitialCredits.configVersion).toBe(SIGNUP_INITIAL_CREDITS.configVersion);
    } finally {
      if (previous === undefined) delete process.env.ARTX_DATA_DIR;
      else process.env.ARTX_DATA_DIR = previous;
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("安全上限必须存在且不至于把注册链路变成提款机", () => {
    // 1000 积分 ≈ 14 张默认档图 ≈ ¥1.1/人；再高就该先补注册门槛。
    expect(SIGNUP_INITIAL_CREDITS_LIMITS.maxCredits).toBeLessThanOrEqual(1000);
    expect(SIGNUP_INITIAL_CREDITS_LIMITS.maxCredits).toBeGreaterThanOrEqual(
      SIGNUP_INITIAL_CREDITS.credits,
    );
    expect(SIGNUP_INITIAL_CREDITS_LIMITS.maxExpiryDays).toBeLessThanOrEqual(30);
  });
});

describe("分辨率分档计费", () => {
  it("不传分辨率时与改造前逐位一致（1K 系数为 1）", () => {
    const base = quoteAiUsage({
      capability: "text_to_image",
      model: "vod-og25-sunburst-medium",
    });
    expect(base.chargedCredits).toBe(70);
  });

  it("落档按短边判定，极端长条不会被误升档", () => {
    // 1024×4096 的长边是 4096，但短边只有 1024 → 仍是 1k
    expect(resolveImageResolutionTier(1024, 4096)).toBe("1k");
    // 2160×3840 短边 2160 > 2048 → 4k
    expect(resolveImageResolutionTier(2160, 3840)).toBe("4k");
  });

  it("OG 系列 1K 放宽到 1088", () => {
    expect(resolveImageResolutionTier(1088, 1088)).toBe("1k");
    expect(resolveImageResolutionTier(1089, 1089)).toBe("2k");
  });

  it("各档积分单调递增，且都取整到十位", () => {
    const tiers = ["1k", "2k", "4k", "8k"] as const;
    let previous = 0;
    for (const tier of tiers) {
      const quote = quoteAiUsage({
        capability: "text_to_image",
        model: "vod-og25-sunburst-medium",
        resolutionTier: tier,
      });
      expect(quote.chargedCredits % 10).toBe(0);
      expect(quote.chargedCredits).toBeGreaterThan(previous);
      previous = quote.chargedCredits;
    }
  });

  it("积分涨幅低于成本涨幅，让用户觉得升档划算", () => {
    for (const policy of AI_IMAGE_RESOLUTION_POLICIES) {
      if (policy.tier === "1k") continue;
      if (!policy.nativeUpstream) continue; // 8K 是本地放大，成本不涨，不适用
      expect(policy.creditsMultiplier).toBeLessThan(policy.costMultiplier);
    }
  });

  it("所有档位毛利率守住 55% 红线", () => {
    // 最保守口径：Pro 年卡 331 积分/元人民币（全站最优惠汇率）
    const WORST_RATE = 331;
    for (const model of ["vod-og25-sunburst-low", "vod-og25-sunburst-medium", "vod-og25-sunburst-high"]) {
      for (const tier of ["1k", "2k", "4k", "8k"]) {
        const quote = quoteAiUsage({ capability: "text_to_image", model, resolutionTier: tier });
        const revenue = quote.chargedCredits / WORST_RATE;
        const margin = (revenue - quote.estimatedCost) / revenue;
        expect(margin, `${model} @ ${tier}`).toBeGreaterThan(0.55);
      }
    }
  });

  it("非出图能力不受分辨率影响（上游报价与分辨率无关）", () => {
    const plain = quoteAiUsage({ capability: "background_removal" });
    for (const tier of ["2k", "4k", "8k"]) {
      const scaled = quoteAiUsage({ capability: "background_removal", resolutionTier: tier });
      expect(scaled.chargedCredits).toBe(plain.chargedCredits);
      expect(scaled.estimatedCost).toBe(plain.estimatedCost);
    }
  });
});
