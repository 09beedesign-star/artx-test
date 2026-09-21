import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ⚠️ 用相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
// 加载失败并显示「0 test」——不是失败，是压根没跑，极易被误判成通过。
import {
  CREDIT_EXPIRY_RULES,
  CREDIT_RECHARGE_TIERS,
  FIRST_RECHARGE_BONUS,
  quoteCreditRecharge,
} from "../../../shared/billing-config";
import { stripSourceComments } from "../../../shared/strip-source-comments";

const source = () =>
  readFileSync(resolve(__dirname, "CreditsGuidePage.tsx"), "utf-8");

/**
 * ⚠️ 断言「源码里不许出现某个数字」时必须先剥注释，否则会命中我们自己写的
 * 解释性注释（本例注释里举例用了 85,000），表现为「明明没硬编码却红」。
 * 这是本项目反复踩到的同一个坑。
 *
 * ⚠️⚠️ 【2026-09-17】第二个坑：原本内联的贪心块注释正则会把
 * CreditsGuidePage.tsx 里 `"image/*"` 这类字符串中的 /* 当成注释开头，
 * 一口吞掉 5.4% 的源码。被吞掉的部分对断言而言不存在 → 反向断言恒绿。
 * 📌 判据：一个恒绿的检测器等于没有检测器。统一走 shared 唯一事实源。
 */
const sourceWithoutComments = () => stripSourceComments(source());

/**
 * 充值档位展示从「比例」改成「实得积分总数」后的防护。
 *
 * ⚠️ 核心风险：积分总数是「金额 × 比例」的派生值。一旦有人图省事把
 * 85,000 这类数字手写进 JSX，将来调整 creditsPerHkd 时页面不会跟着变，
 * 就成了对用户的虚标承诺（本页是正式对外规则说明，不是营销页）。
 * 所以断言锁的是「必须由 quoteCreditRecharge 计算」，不是「显示了什么数」。
 */
describe("充值档位展示", () => {
  it("积分总数必须由 quoteCreditRecharge 现算，不得硬编码", () => {
    const src = source();
    expect(src).toContain("quoteCreditRecharge(tier.minAmount).credits");

    // 反向断言：任何一档的积分总数都不能以字面量形式出现在**代码**里。
    // 覆盖 85000 / 85,000 两种写法；注释已剥离，不算数。
    const code = sourceWithoutComments();
    for (const tier of CREDIT_RECHARGE_TIERS) {
      const credits = quoteCreditRecharge(tier.minAmount).credits;
      expect(code).not.toContain(String(credits));
      expect(code).not.toContain(credits.toLocaleString("zh-HK"));
    }
  });

  it("保留比例作为副信息，用户要能自己核算", () => {
    // 只给总数不给比例，用户无法验证自己充任意金额能拿多少。
    expect(source()).toContain("tier.creditsPerHkd");
  });

  it("必须说明表中数字是按门槛金额举例，避免被读成固定套餐", () => {
    const src = source();
    expect(src).toContain("上表按各档门槛金额举例");
    expect(src).toContain("实际到账 = 充值金额 × 对应比例");
  });
});

/**
 * 首充赠送说明的防护。
 *
 * ⚠️ 存在原因：用户看完这一页后仍然问「充值到账比例的积分，是不是就是额外
 * 赠送的积分？」——说明「档位=阶梯定价」和「首充=真赠送」这两件事在页面上
 * 完全没有区分。两者的 kind、source、有效期全不同（366 天 vs 30 天，差 12 倍），
 * 混淆会直接导致用户对积分什么时候过期产生错误预期。
 */
describe("首充赠送说明", () => {
  /**
   * ⚠️ 必须把断言锚在首充块**内部**，不能对整份源码 toContain。
   * 教训：`expect(src).toContain("CREDIT_EXPIRY_RULES.gift.days")` 看似有效，
   * 实则命中了页面上方「积分有效期」卡片里的同名表达式 —— 把首充块里的
   * 天数改成写死的 30，测试照样全绿。变异测试当场戳穿了这个假断言。
   */
  const bonusBlock = () => {
    const src = source();
    const start = src.indexOf("首次充值满 HKD");
    expect(start, "找不到首充赠送说明块").toBeGreaterThan(-1);
    const end = src.indexOf("</div>", start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  it("必须展示门槛金额与赠送积分，且从 shared 配置渲染", () => {
    const src = bonusBlock();
    expect(src).toContain("FIRST_RECHARGE_BONUS.minAmount");
    expect(src).toContain("FIRST_RECHARGE_BONUS.credits");

    // 反向断言：这两个数字不得以字面量形式写死。
    // 首充规则是服务端 issueFirstRechargeBonus 的实际行为，
    // 页面写死就会在调整活动门槛时变成虚假承诺。
    const code = sourceWithoutComments();
    expect(code).not.toContain(String(FIRST_RECHARGE_BONUS.minAmount));
    expect(code).not.toContain(String(FIRST_RECHARGE_BONUS.credits));
    expect(code).not.toContain(FIRST_RECHARGE_BONUS.credits.toLocaleString("zh-HK"));
  });

  /**
   * 📌 有效期是本块的存在理由，不是可选补充。
   * 只写「送你 2,500 积分」而不写 30 天，等于把最关键的限制藏起来。
   */
  it("必须写明赠送积分的有效期，并与充值有效期对照", () => {
    expect(bonusBlock()).toContain("CREDIT_EXPIRY_RULES.gift.days");
    expect(
      CREDIT_EXPIRY_RULES.gift.days,
      "赠送有效期必须严格短于充值有效期，否则零成本积分比付费积分活得还久",
    ).toBeLessThan(CREDIT_EXPIRY_RULES.recharge.days);
  });

  it("必须说明每账号仅限一次，避免被理解成每次充值都送", () => {
    expect(bonusBlock()).toContain("每个账号仅限一次");
  });
});
