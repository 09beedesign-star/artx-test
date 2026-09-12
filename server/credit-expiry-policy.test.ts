import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 积分有效期口径的防护测试。
 *
 * 三类积分的有效期是产品规则，改动必须是有意识的决策而不是顺手调参，
 * 所以把数字和调用方式一起锁在测试里。时间口径对齐 Lovart 官方 FAQ：
 * https://www.lovart.ai/zh/statement/lovart-subscribe-faq
 */
describe("积分有效期规则（时间口径对齐 Lovart）", () => {
  const adminStoreSource = readFileSync("server/admin-store.ts", "utf-8");

  it("充值积分有效期为 366 天，不是 365", () => {
    // ⚠️ Lovart 官方口径是 366 天（覆盖闰年，避免用户在闰年少拿一天）。
    // 我们此前写的是 365，看似等价，实则和对标平台差一天。
    expect(adminStoreSource).toMatch(/const RECHARGE_CREDIT_VALID_DAYS = 366;/);
  });

  it("充值批次必须用常量而不是字面量写有效期", () => {
    // 直接写 addDaysIso(paidAt, 365) 会让规则散落在代码里，
    // 将来调整时漏改某一处且不报错。
    const rechargeBlock = adminStoreSource.match(
      /kind: "recharge",[\s\S]{1,600}?\n    \}\);/,
    );
    expect(rechargeBlock).toBeTruthy();
    expect(rechargeBlock![0]).toMatch(/addDaysIso\(paidAt, RECHARGE_CREDIT_VALID_DAYS\)/);
    expect(rechargeBlock![0]).not.toMatch(/addDaysIso\(paidAt,\s*\d+\)/);
  });

  it("赠送积分有效期为 30 天，短于充值积分", () => {
    // 赠送积分获取成本为零，有效期必须严格短于充值积分，
    // 否则「赠送比充值更划算」会诱发薅羊毛。
    //
    // ⚠️ 这里刻意读源码而不是 import { DEFAULT_GIFT_EXPIRY_DAYS }：
    // credit-gifting.ts 目前只在 feature/credit-gifting 分支上，
    // main 上没有该文件，import 会让整个测试套件加载失败（0 test）。
    const giftDays = Number(
      adminStoreSource.match(/const FIRST_RECHARGE_BONUS_VALID_DAYS = (\d+);/)?.[1],
    );
    expect(giftDays).toBe(30);
    expect(giftDays).toBeLessThan(366);
  });

  it("会员积分按月发放，首期只发一个月额度而不是整个周期", () => {
    // ⚠️ 这是本次规则变更的核心。旧实现一次性发 monthlyCredits × cycle.months
    // （Pro 年卡 336,000 一个批次），既把递延负债长期挂在最高点，
    // 又让「单价最低且永不过期」的会员积分成为囤积工具。
    const membershipBlock = adminStoreSource.match(
      /kind: "membership",\s*\n\s*amount: monthlyCredits,[\s\S]{1,600}?\n\s*\}\);/,
    );
    expect(membershipBlock).toBeTruthy();
    // 反向断言：绝不能退回「一次性发全周期」的写法。
    expect(adminStoreSource).not.toMatch(/amount: order\.expectedCredits,\s*\n\s*source: order\.id,\s*\n\s*reason: "会员套餐积分入账"/);
  });

  it("会员批次有效期必须比滚存上限多一期，否则滚存等于没实现", () => {
    // ⚠️ 写成 MEMBERSHIP_ROLLOVER_PERIODS（而不是 +1）会让第 N 期积分
    // 在第 N+1 期发放的同一刻就失效，用户根本用不到结转额度。
    expect(adminStoreSource).toMatch(
      /const MEMBERSHIP_BATCH_VALID_MONTHS = MEMBERSHIP_ROLLOVER_PERIODS \+ 1;/,
    );
  });

  it("后端滚存期数与前端展示口径必须一致", () => {
    // 两边不一致 = 对用户的承诺和实际扣费行为对不上，属于合规风险。
    const backendMatch = adminStoreSource.match(/const MEMBERSHIP_ROLLOVER_PERIODS = (\d+);/);
    const sharedSource = readFileSync("shared/billing-config.ts", "utf-8");
    const sharedMatch = sharedSource.match(/export const MEMBERSHIP_ROLLOVER_MONTHS = (\d+);/);
    expect(backendMatch).toBeTruthy();
    expect(sharedMatch).toBeTruthy();
    expect(backendMatch![1]).toBe(sharedMatch![1]);
  });

  it("计费周期文案不得再声称「到期不结转」", () => {
    // 历史教训：creditRule 长期写着「未使用积分到期不结转」，代码却是余额保留，
    // 承诺与实现不一致很久没人发现。现在实现是「可结转 1 个月」，
    // 文案必须同步，否则又回到两边对不上的状态。
    const sharedSource = readFileSync("shared/billing-config.ts", "utf-8");
    const creditRules = sharedSource.match(/creditRule: "[^"]+"/g) || [];
    expect(creditRules.length).toBeGreaterThanOrEqual(3);
    for (const rule of creditRules) {
      expect(rule).not.toMatch(/到期不结转/);
      expect(rule).toMatch(/结转/);
    }
  });

  it("退款必须能扣回按期发放的会员批次", () => {
    // ⚠️ 会员批次的 source 带 :mN 后缀，只按 order.id 全等匹配会一条都匹配不到，
    // 退款时积分扣不回来且零报错。
    expect(adminStoreSource).toMatch(/batchSource\.startsWith\(`\$\{source\}:m`\)/);
  });

  it("退款必须终止后续期数的发放", () => {
    // 否则用户退了款，issueDueMembershipCredits 下个月还继续发积分。
    expect(adminStoreSource).toMatch(
      /user\.membership\.issuedPeriods = user\.membership\.totalPeriods;/,
    );
  });

  it("批次截断不得淘汰仍有余额的 active 批次", () => {
    // ⚠️ 按月发放让批次产生速度涨约 12 倍。无条件 slice 会截掉 active 批次，
    // 导致 credits 余额还在、批次没了 → 扣费找不到批次、过期不触发，
    // 积分变成永不过期的游离额度且零报错。
    // ⚠️ 终止符不能写 `\n\}` —— 函数的**参数对象字面量**里就有一个
    // 顶格 `}`，非贪婪匹配会在那里截断，只截到函数签名，
    // 后面的断言全部落空（报错信息里只看到参数列表就是这个原因）。
    // 锚到函数真正的结尾 `return batch;\n}`。
    const createBlock = adminStoreSource.match(
      /function createCreditBatch\([\s\S]*?return batch;\n\}/,
    );
    expect(createBlock).toBeTruthy();
    expect(createBlock![0]).toMatch(/item\.status !== "active" && item\.remainingCredits <= 0/);
    expect(createBlock![0]).not.toMatch(/\.slice\(0, 1000\)/);
  });

  it("扣费顺序按到期日升序，保证先消耗快过期的批次", () => {
    // FIFO 是新增过期类型能零改动接入的前提：
    // 无到期日的批次排 POSITIVE_INFINITY 最后，带过期的自动被优先消耗。
    const sortBlock = adminStoreSource.match(
      /function sortCreditBatchesForDeduction[\s\S]{1,800}?\n\}/,
    );
    expect(sortBlock).toBeTruthy();
    expect(sortBlock![0]).toMatch(/POSITIVE_INFINITY/);
  });
});
