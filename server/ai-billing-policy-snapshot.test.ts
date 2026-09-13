import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_CREDIT_POLICIES, AI_PLAN_DISCOUNTS } from "../shared/ai-credit-policy";

/**
 * AI 计费策略「快照固化」防回归测试（2026-09-13 线上事故后新增）
 *
 * ## 事故本体
 *
 * `normalizeDataAsync` 里曾写成：
 *
 *     aiBillingPolicies: Array.isArray(value.aiBillingPolicies)
 *       ? value.aiBillingPolicies
 *       : AI_CREDIT_POLICIES,
 *
 * 这个写法对**业务记录**（orders / credits / aiTasks）是正确的 —— 用户产生的数据
 * 丢了不可复原，必须沿用库里的。但 aiBillingPolicies / aiPlanDiscounts 是
 * **派生数据**：唯一事实源是 shared/ai-credit-policy.ts，库里那份只是投影。
 *
 * 结果：2026-07-01（e12973e）库里还没有这两个字段，本函数拿**当时的**常量填了进去，
 * 随后任意一次后台写操作调用 saveAdminData() 就把快照固化进生产库。此后常量经历
 * 3a0e6a5、c626de5 两轮涨价，而 `value.aiBillingPolicies` 一直是非空数组，
 * 三元表达式永远走左边 —— **代码里的新价格一次都没生效过，且全程零报错。**
 *
 * 扩图端到端验证实测：代码写 200 积分，线上实扣 16。按最坏充值档 170 积分/元换算，
 * 10 项能力里 7 项每次调用净亏（text_to_image 单次净亏 0.341 元）。
 *
 * ## ⚠️ 为什么既有测试一条都没抓到
 *
 * admin-store.readiness.test.ts:1060 用 `quoteAiUsage`（读代码常量）算期望值，
 * 而生产链路走 `quoteAiUsageFromData`（读库）。**测试库为空时两者恒等**，
 * 于是"库里有脏快照"这条分支从来没有被任何用例走到过。
 * 更讽刺的是 scripts/verify-admin-backend.mjs:146-174 反而把"库覆盖代码"
 * 当成**预期行为**在验证 —— 缺陷被当规格写进了校验脚本。
 *
 * 所以本文件的核心用例必须是：**往库里预置一份与代码不一致的脏快照**，
 * 断言 loadAdminData() 之后计价仍以代码为准。测试库为空是抓不到这个缺陷的。
 */

let dataDir = "";

async function loadAdminStore() {
  vi.resetModules();
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  return import("./admin-store");
}

/**
 * 复刻生产库里那份 2026-07-01 的旧快照（`git show e12973e:shared/ai-credit-policy.ts`
 * 与生产库逐条吻合，且审计日志里这两个字段的修改记录为 0 条 —— 坐实是代码快照固化，
 * 不是运营在后台手工配置）。
 *
 * 这里只需要"和当前代码不一致"即可构成有效夹具，但刻意用真实的历史值，
 * 让失败信息能直接对上线上现象（扩图实扣 16）。
 */
const STALE_SNAPSHOT_POLICIES = [
  { capability: "text_to_image", label: "普通图片生成", billingUnit: "per_image", baseCredits: 2, estimatedCostPerUnit: 0.02 },
  { capability: "image_expansion", label: "扩图 / 外延生成", billingUnit: "per_request", baseCredits: 16, estimatedCostPerUnit: 0.02 },
  { capability: "image_ocr", label: "图片识别", billingUnit: "per_request", baseCredits: 4, estimatedCostPerUnit: 0.01 },
];

const STALE_SNAPSHOT_DISCOUNTS = [
  { planId: "lite", multiplier: 1.08, label: "入门加价" },
  { planId: "creator", multiplier: 1, label: "标准" },
  { planId: "pro", multiplier: 0.95, label: "专业折扣" },
  { planId: "studio", multiplier: 0.85, label: "工作室折扣" },
  { planId: "business", multiplier: 0.82, label: "企业折扣" },
];

async function seedStaleSnapshot() {
  await writeFile(
    path.join(dataDir, "admin-data.json"),
    `${JSON.stringify({
      aiBillingPolicies: STALE_SNAPSHOT_POLICIES,
      aiPlanDiscounts: STALE_SNAPSHOT_DISCOUNTS,
    }, null, 2)}\n`
  );
}

/**
 * 源码层断言前必须先剥注释。
 *
 * ⚠️ 本仓库刚踩过「注释污染」：修复注释里原样引用了那段错误代码
 * （作为事故复盘的反面教材），`toContain` / `not.toMatch` 扫全文会直接命中注释，
 * 让反向断言**恒失败**、正向断言**假通过**。断言必须只看真正会被执行的代码。
 */
function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-ai-billing-snapshot-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD;
});

describe("AI 计费策略：库里的历史快照不得覆盖代码常量", () => {
  it("库里存着旧价快照时，扩图仍按代码的 200 积分计价（线上实扣 16 的那条）", async () => {
    await seedStaleSnapshot();
    const { quoteAdminAiUsage } = await loadAdminStore();

    const quote = await quoteAdminAiUsage({
      capability: "image_expansion",
      planId: "lite",
    });

    const expected = AI_CREDIT_POLICIES.find((item) => item.capability === "image_expansion");
    expect(expected).toBeTruthy();
    expect(quote.policy.baseCredits).toBe(expected?.baseCredits);
    // 直接把线上那个错误值点名写死：一旦又退回读库，这里会变回 16。
    expect(quote.chargedCredits).not.toBe(16);
    expect(quote.chargedCredits).toBe(expected?.baseCredits);
  });

  it("每一项能力的计价都以代码为准，不止扩图一项", async () => {
    await seedStaleSnapshot();
    const { quoteAdminAiUsage } = await loadAdminStore();

    for (const policy of AI_CREDIT_POLICIES) {
      // text_to_image 走模型单价表（getAiImageModelCreditPolicy），
      // 不传 model 时才回落到 policy.baseCredits，这里统一不传，锁的是策略本身。
      const quote = await quoteAdminAiUsage({
        capability: policy.capability,
        planId: "creator",
      });
      expect(
        quote.policy.baseCredits,
        `能力 ${policy.capability} 的 baseCredits 被库里的旧快照覆盖了`
      ).toBe(policy.baseCredits);
      expect(quote.policy.estimatedCostPerUnit).toBe(policy.estimatedCostPerUnit);
    }
  });

  it("任意一次后台写操作就会把脏快照冲回代码值，无需人工清库", async () => {
    await seedStaleSnapshot();
    const { recordRiskEvent } = await loadAdminStore();

    /**
     * 这里刻意用一个**与计费毫不相干**的写操作（记一条风控事件）来触发落盘。
     * 脏快照当初就是这么进生产库的：normalizeDataAsync 填好字段，随便哪次
     * saveAdminData 顺手固化。既然进来的路是这条，出去的路也必须是这条 ——
     * 这正是"代码修复能顺带修数据"的依据，否则还得单独写一个清库脚本上生产。
     */
    await recordRiskEvent({
      title: "测试事件",
      detail: "用于触发一次落盘",
      severity: "low",
      target: "test",
    });

    const persisted = JSON.parse(await readFile(path.join(dataDir, "admin-data.json"), "utf-8"));
    const expansion = persisted.aiBillingPolicies.find(
      (item: { capability: string }) => item.capability === "image_expansion"
    );
    expect(expansion.baseCredits).toBe(
      AI_CREDIT_POLICIES.find((item) => item.capability === "image_expansion")?.baseCredits
    );
    expect(expansion.baseCredits).not.toBe(16);
    expect(persisted.aiPlanDiscounts).toEqual(AI_PLAN_DISCOUNTS);
  });

  it("库里的旧折扣系数不得复活：lite 不再被暗自加价 8%", async () => {
    await seedStaleSnapshot();
    const { quoteAdminAiUsage } = await loadAdminStore();

    const lite = await quoteAdminAiUsage({ capability: "image_expansion", planId: "lite" });
    const studio = await quoteAdminAiUsage({ capability: "image_expansion", planId: "studio" });

    expect(lite.discount.multiplier).toBe(1);
    expect(studio.discount.multiplier).toBe(1);
    // 展示价 = 实扣价：前台读的是 shared 常量，两边必须算出同一个数。
    expect(lite.chargedCredits).toBe(studio.chargedCredits);
  });
});

describe("AI 计费策略：折扣系数统一 1.0 是产品决策", () => {
  it("所有档位的 multiplier 都是 1.0", () => {
    // ⚠️ 用户 2026-09-13 拍板「展示价 = 实扣价」。
    // 这里点名写死 1，不用区间断言 —— 区间断言挡不住有人把 1.08 改回来。
    for (const discount of AI_PLAN_DISCOUNTS) {
      expect(discount.multiplier, `档位 ${discount.planId} 的折扣系数被改动了`).toBe(1);
    }
    // 反向断言：历史上那四个具体值一个都不许再出现。
    const multipliers = AI_PLAN_DISCOUNTS.map((item) => item.multiplier);
    expect(multipliers).not.toContain(1.08);
    expect(multipliers).not.toContain(0.95);
    expect(multipliers).not.toContain(0.85);
    expect(multipliers).not.toContain(0.82);
  });

  it("档位覆盖 lite / pro / studio 三个在售档，漏一个就有人按默认档计价", async () => {
    const ids = AI_PLAN_DISCOUNTS.map((item) => item.planId);
    expect(ids).toEqual(expect.arrayContaining(["lite", "pro", "studio"]));
  });
});

describe("源码层：填充语义不得被改回三元表达式", () => {
  it("normalizeDataAsync 里这两个字段是无条件重算", async () => {
    const source = await readFile(path.join(import.meta.dirname, "admin-store.ts"), "utf-8");
    const code = stripComments(source);

    const start = code.indexOf("async function normalizeDataAsync");
    expect(start, "normalizeDataAsync 不见了，本测试的定位锚点失效").toBeGreaterThan(-1);
    // 到下一个顶层 function 声明为止，避免整文件 toContain 形同虚设。
    const rest = code.slice(start + 1);
    const nextFn = rest.search(/\n(?:export )?(?:async )?function /);
    const block = nextFn === -1 ? rest : rest.slice(0, nextFn);

    // 正向：必须是裸赋值。
    expect(block).toMatch(/aiBillingPolicies:\s*AI_CREDIT_POLICIES\s*,/);
    expect(block).toMatch(/aiPlanDiscounts:\s*AI_PLAN_DISCOUNTS\s*,/);

    // 反向：任何"先看库里有没有"的写法都不许出现 —— 这才是真正守住缺陷的那一条。
    expect(block).not.toMatch(/aiBillingPolicies:\s*[^,\n]*value\.aiBillingPolicies/);
    expect(block).not.toMatch(/aiPlanDiscounts:\s*[^,\n]*value\.aiPlanDiscounts/);
    expect(block).not.toMatch(/Array\.isArray\(value\.aiBillingPolicies\)/);
    expect(block).not.toMatch(/Array\.isArray\(value\.aiPlanDiscounts\)/);
  });

  it("stripComments 确实剥掉了注释里那段反面教材，否则上面的反向断言是假的", async () => {
    const source = await readFile(path.join(import.meta.dirname, "admin-store.ts"), "utf-8");
    // 注释里确有这段错误代码（事故复盘），不剥注释的话反向断言会恒失败 ——
    // 这条用例就是用来证明 stripComments 没有白写的。
    expect(source).toContain("Array.isArray(value.aiBillingPolicies)");
    expect(stripComments(source)).not.toContain("Array.isArray(value.aiBillingPolicies)");
  });
});
