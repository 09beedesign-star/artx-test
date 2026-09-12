import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ⚠️ 用相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
// 加载失败并显示「0 test」——不是失败，是压根没跑，极易被误判成通过。
import {
  CREDIT_RECHARGE_TIERS,
  quoteCreditRecharge,
} from "../../../shared/billing-config";

const source = () =>
  readFileSync(resolve(__dirname, "CreditsGuidePage.tsx"), "utf-8");

/**
 * ⚠️ 断言「源码里不许出现某个数字」时必须先剥注释，否则会命中我们自己写的
 * 解释性注释（本例注释里举例用了 85,000），表现为「明明没硬编码却红」。
 * 这是本项目反复踩到的同一个坑。
 */
const sourceWithoutComments = () =>
  source()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

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
