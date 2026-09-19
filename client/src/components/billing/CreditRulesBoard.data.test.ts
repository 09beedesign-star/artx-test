import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⚠️ 用相对路径，不用 @shared 别名：vitest 一旦要走 vite.config 之外的配置
 * 就会解析失败，报「Does the file exist?」而不是断言失败，
 * 看起来像文件不存在，极易被误判成通过。
 */
import {
  REFERENCE_IMAGE_CREDITS,
  buildFreeCreditChannels,
  buildFreeCreditTotal,
  buildImageQualityLadder,
  buildPlanValueRows,
  buildRechargeRows,
  buildResolutionLadder,
  buildUnitCreditRows,
  getWelcomePackage,
  imagesFromCredits,
} from "../../../../shared/credit-rules";
import {
  AI_IMAGE_RESOLUTION_POLICIES,
  quoteAiUsage,
} from "../../../../shared/ai-credit-policy";
import {
  CREDIT_EXPIRY_RULES,
  CREDIT_RECHARGE_TIERS,
  FIRST_RECHARGE_BONUS,
  INVITE_REWARD_CONFIG,
  MEMBERSHIP_PLANS,
  SIGNUP_INITIAL_CREDITS,
  SUBSCRIPTION_PLAN_IDS,
} from "../../../../shared/billing-config";

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const readBoard = () =>
  stripComments(readFileSync(resolve(__dirname, "CreditRulesBoard.tsx"), "utf-8"));

describe("注册礼包的三天有效期不对外展示", () => {
  /**
   * 📌 产品决策（2026-09-19）：三天这个数字会劝退注册，Hero 与三条通道
   * 里 signup 那一条都不再写明天数。
   *
   * 但**服务端照旧到期回收**，所以这里要同时锁两件事：
   *   - 数据层的数字仍必须追溯到 SIGNUP_INITIAL_CREDITS.expiryDays（上一段的断言）
   *   - 展示层不许把这个数字渲染出来（本段断言）
   * 只锁一边会出事：写了 UI 却删了数据源，前端就没人知道真相是这个值；
   * 留了数据源却不管 UI，下次有人顺手加回来也不会有人发现。
   */
  it("板块源码不得渲染注册礼包的有效期天数", () => {
    const src = readBoard();
    expect(src).not.toContain("welcome.expiryDays");
    expect(src).not.toContain("天有效期");
  });

  it("三条通道里只有 signup 被跳过天数，其余照常写", () => {
    const src = readBoard();
    expect(src).toContain('channel.id !== "signup"');
    // 反面：不能图省事把整行天数都删掉，首充/邀请那两条是对用户有利的信息
    expect(src).toContain("到账后 ${channel.validDays} 天内有效");
  });
});

describe("注册礼包的换算必须来自真相源", () => {
  it("新用户礼包的额度与有效期取自注册配置", () => {
    const welcome = getWelcomePackage();
    expect(welcome.credits).toBe(SIGNUP_INITIAL_CREDITS.credits);
    expect(welcome.expiryDays).toBe(SIGNUP_INITIAL_CREDITS.expiryDays);
    expect(welcome.imageCredits).toBe(REFERENCE_IMAGE_CREDITS);
    expect(welcome.imageCredits).toBe(
      quoteAiUsage({ capability: "text_to_image", model: "vod-og25-sunburst-medium" }).chargedCredits,
    );
  });

  /**
   * 📌「够出 5 张」是注册额度定档的原始依据（见 SIGNUP_INITIAL_CREDITS 注释）。
   * 这里锁的是**换算结果**：改错inq linea 会得到 6 张，而第 6 张实际会被 402 拦下。
   */
  it("张数向下取整，不四舍五入", () => {
    const welcome = getWelcomePackage();
    expect(welcome.freeImages).toBe(Math.floor(welcome.credits / welcome.imageCredits));
    expect(welcome.freeImages * welcome.imageCredits).toBeLessThanOrEqual(welcome.credits);
    // 差一点点就该是 0 张，不是 1 张
    expect(imagesFromCredits(welcome.imageCredits - 1, welcome.imageCredits)).toBe(0);
    expect(imagesFromCredits(welcome.imageCredits * 2, welcome.imageCredits)).toBe(2);
  });

  it("活动截止日透传给用户但不写死在展示层", () => {
    expect(getWelcomePackage().activeUntil).toBe(SIGNUP_INITIAL_CREDITS.activeUntil);
  });
});

describe("单位消耗表", () => {
  it("每一项的价格与 quoteAiUsage 逐条一致", () => {
    const rows = buildUnitCreditRows();
    expect(rows.length).toBeGreaterThan(4);
    for (const row of rows) {
      expect(Number.isFinite(row.credits)).toBe(true);
      expect(row.credits).toBeGreaterThan(0);
    }
    // 出图那行必须等于默认档单价，而不是 AI_CREDIT_POLICIES 的兜底价
    const image = rows.find(row => row.id === "text_to_image");
    expect(image?.credits).toBe(REFERENCE_IMAGE_CREDITS);
    expect(image?.unit).toBe("张");
    expect(image).not.toBeUndefined();
    // 逐条与服务端同一条计价链路核对
    for (const row of rows) {
      const quote = quoteAiUsage({
        capability: row.id as Parameters<typeof quoteAiUsage>[0]["capability"],
        model: row.id === "text_to_image" ? "vod-og25-sunburst-medium" : undefined,
      });
      expect(row.credits).toBe(quote.chargedCredits);
    }
  });
});

describe("出图与分辨率阶梯", () => {
  it("三档依次为 low / medium / high，单价取自真实模型定价", () => {
    const ladder = buildImageQualityLadder();
    expect(ladder.map(item => item.id)).toEqual(["low", "medium", "high"]);
    const medium = ladder.find(item => item.id === "medium");
    expect(medium?.credits).toBe(REFERENCE_IMAGE_CREDITS);
    const low = ladder.find(item => item.id === "low");
    const high = ladder.find(item => item.id === "high");
    expect(low!.credits).toBeLessThan(medium!.credits);
    expect(high!.credits).toBeGreaterThan(medium!.credits);
    // 一份礼包在 cheapest 档能出的图一定不少于默认档
    expect(low!.welcomeImages).toBeGreaterThanOrEqual(medium!.welcomeImages);
  });

  /**
   * 📌 锁的是 ai-credit-policy 里的核心产品决策：
   * 真实上调 stream 的档位（2K / 4K），**积分倍率刻意低于成本倍率**，
   * 差额由平台承担。若哪天被改成 creditsMultiplier >= costMultiplier，
   * 「升档是平台补贴」这句面向用户的承诺就成了假的 —— 必须当场炸。
   *
   * ⚠️ 8K **刻意不在断言范围内**：它与 4K 共用上游成本却是本地放大实现，
   * multiplier 高于成本是刻意的溢价（注释见 ai-credit-policy.ts）。
   * 第一次写这条断言时把四档全算进去，测试直接红了 —— 不是断言写错，
   * 是它逼出了「8K 不能称作补贴」这个事实，UI 文案因此才跟着改。
   */
  it("原生高分辨率档的积分倍率必须低于成本倍率", () => {
    const ladder = buildResolutionLadder();
    const nativeHigh = ladder.filter(rung => rung.nativeUpstream && rung.id !== "1k");
    expect(nativeHigh.map(rung => rung.id)).toEqual(["2k", "4k"]);
    for (const rung of nativeHigh) {
      expect(rung.creditsMultiplier).toBeLessThan(rung.costMultiplier);
      expect(rung.isSubsidized).toBe(true);
    }
    // 反过来：本地放大的那一档不许被标成补贴
    const upscaled = ladder.find(rung => !rung.nativeUpstream);
    expect(upscaled).toBeTruthy();
    expect(upscaled?.isSubsidized).toBe(false);
  });

  it("每档实际积分等于同一条计价链路的结果", () => {
    for (const policy of AI_IMAGE_RESOLUTION_POLICIES) {
      const quote = quoteAiUsage({
        capability: "text_to_image",
        model: "vod-og25-sunburst-medium",
        resolutionTier: policy.tier,
      });
      const row = buildResolutionLadder().find(item => item.id === policy.tier);
      expect(row?.credits).toBe(quote.chargedCredits);
    }
  });
});

describe("订阅与充值的「汇率」表", () => {
  /**
   * 📌 必须是真的在卖的三档。MEMBERSHIP_PLANS 里还有 Creator / Business
   * 这两条**不在货架上**的历史定价，混进来等于拿买不到的东西做对比。
   */
  it("只包含 SUBSCRIPTION_PLAN_IDS 里的在售套餐", () => {
    const rows = buildPlanValueRows();
    expect(rows.map(row => row.id)).toEqual(SUBSCRIPTION_PLAN_IDS);
    expect(rows).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "creator" })]));
  });

  it("每 HKD 换到的积分由月度额度与月费现算", () => {
    for (const row of buildPlanValueRows()) {
      const plan = MEMBERSHIP_PLANS.find(item => item.id === row.id)!;
      expect(row.monthlyCredits).toBe(plan.monthlyCredits);
      expect(row.monthlyPrice).toBe(plan.monthlyPrice);
      expect(row.creditsPerHkd).toBe(Math.round(plan.monthlyCredits / plan.monthlyPrice));
      expect(row.imagesPerMonth).toBe(Math.floor(plan.monthlyCredits / REFERENCE_IMAGE_CREDITS));
    }
  });

  /**
   * 📌 这条是「订阅比充值划算」这句主张的地基：
   * 最低档会员的汇率也必须高于最高的充值汇率，否则板块里那句话就是虚标。
   */
  it("入门套餐的汇率高于充值最高档", () => {
    const lowestPlanRate = Math.min(...buildPlanValueRows().map(row => row.creditsPerHkd));
    const highestRechargeRate = Math.max(...buildRechargeRows().map(row => row.creditsPerHkd));
    expect(lowestPlanRate).toBeGreaterThan(highestRechargeRate);
  });

  it("充值阶梯的汇率与 boost 取自 CREDIT_RECHARGE_TIERS", () => {
    const rows = buildRechargeRows();
    expect(rows.map(row => row.creditsPerHkd).sort((a, b) => b - a)).toEqual(
      CREDIT_RECHARGE_TIERS.map(tier => tier.creditsPerHkd).sort((a, b) => b - a),
    );
    for (const row of rows) {
      const tier = CREDIT_RECHARGE_TIERS.find(item => item.minAmount === row.minAmount)!;
      expect(row.exampleCredits).toBe(row.minAmount * tier.creditsPerHkd);
    }
    expect(rows.find(row => row.boostPercent === 0)).toBeTruthy();
  });
});

describe("三条白拿通道", () => {
  it("金额来自注册/首充/邀请三份配置", () => {
    const channels = buildFreeCreditChannels();
    expect(channels.map(channel => channel.id)).toEqual(["signup", "first-recharge", "invite"]);

    const signup = channels[0];
    expect(signup.credits).toBe(SIGNUP_INITIAL_CREDITS.credits);
    // 注册礼包的 3 天有效期与通用赠送的 30 天不是一回事，别被统一口径抹平
    expect(signup.validDays).toBe(SIGNUP_INITIAL_CREDITS.expiryDays);
    expect(signup.validDays).not.toBe(CREDIT_EXPIRY_RULES.gift.days);

    const recharge = channels[1];
    expect(recharge.credits).toBe(FIRST_RECHARGE_BONUS.credits);
    expect(recharge.condition).toContain(String(FIRST_RECHARGE_BONUS.minAmount));
    expect(recharge.validDays).toBe(CREDIT_EXPIRY_RULES.gift.days);

    const invite = channels[2];
    expect(invite.credits).toBe(
      INVITE_REWARD_CONFIG.inviterCredits + INVITE_REWARD_CONFIG.inviteeCredits,
    );
    expect(invite.maxCredits).toBe(
      invite.credits * INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser,
    );
    expect(invite.validDays).toBe(CREDIT_EXPIRY_RULES.gift.days);
  });

  it("累计上限等于三条通道上限之和", () => {
    expect(buildFreeCreditTotal()).toBe(
      buildFreeCreditChannels().reduce((sum, channel) => sum + channel.maxCredits, 0),
    );
  });
});

describe("展示层不许硬编码经营数字", () => {
  /**
   * 📌 锚在剥掉注释的源码上 —— 本项目反复踩过：
   * not.toContain 命中的其实是自己写的解释性注释，
   * 于是测试挂在一个不存在的问题上，真正的硬编码反而畅通无阻。
   */
  const bannedInBoard = () => {
    const src = readBoard();
    return {
      src,
      banned: [
        String(SIGNUP_INITIAL_CREDITS.credits),
        String(REFERENCE_IMAGE_CREDITS),
        String(FIRST_RECHARGE_BONUS.credits),
        String(INVITE_REWARD_CONFIG.inviterCredits + INVITE_REWARD_CONFIG.inviteeCredits),
        String(Math.max(...CREDIT_RECHARGE_TIERS.map(tier => tier.creditsPerHkd))),
      ],
    };
  };

  it("CreditRulesBoard 里不出现任何 pricing 字面量", () => {
    const { src, banned } = bannedInBoard();
    for (const value of banned) {
      expect(
        src,
        `数字 ${value} 被写死在积分规则板块里，定价一改文案不会跟着变。请从 @shared/credit-rules 取。`,
      ).not.toContain(value);
    }
  });

  it("板块自身带 #credit-rules 锚点，页头入口才能滚到它", () => {
    const raw = readFileSync(resolve(__dirname, "CreditRulesBoard.tsx"), "utf-8");
    expect(raw).toContain('id="credit-rules"');
  });

  it("/billing 页同时具备规则板块与页头入口", () => {
    const raw = readFileSync(resolve(__dirname, "../../pages/BillingPage.tsx"), "utf-8");
    expect(raw).toContain("<CreditRulesBoard");
    // 入口必须真的能把用户送到板块，而不是一个装饰性文案
    expect(raw).toContain('getElementById("credit-rules")');
    expect(raw).toContain("scrollToCreditRules");
  });

  it("规则页复用同一个板块且不再给跳出自己的入口", () => {
    const raw = readFileSync(resolve(__dirname, "../../pages/CreditsGuidePage.tsx"), "utf-8");
    expect(raw).toContain("<CreditRulesBoard");
    expect(raw).toContain("showFullGuideLink={false}");
  });
});
