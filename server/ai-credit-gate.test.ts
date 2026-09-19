import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertStripKeptSource, stripSourceComments } from "../shared/strip-source-comments";
import { DEFAULT_IMAGE_MODEL_ID } from "../shared/image-models";

/**
 * AI 能力「事前余额校验」回归测试。
 *
 * ## 这个漏洞的本体
 *
 * 2026-09-18 之前，全站 12 条 AI 路由的请求链路是这样的：
 *
 *   校验登录 → 校验模型权限 → **直接调上游** → 事后 recordAiUsage 扣账
 *
 * 扣账用的还是 `Math.max(0, user.credits - x)`：余额不足时一路 clamp 到 0，
 * 既不报错也不拒绝。于是 **0 积分账号可以无限调用 AI**，
 * 每成功一次平台照付上游费用， deducted 金额是 0。
 *
 * 修法是加一道 `assertUserCanAffordAiUsage` 前置拦截。
 *
 * ## ⚠️ 为什么这些用例必须存在
 *
 * 这条链路的表面症状是「0 积分也能用」，但用户能注意到的概率接近于零 ——
 * 谁会主动报告自己不用付钱？所以一旦将来有人动了 reserveAiRouteUsage
 * 的顺序（比如把校验挪到请求之后），这里没有任何人会察觉。
 * 本文件的作用就是让「移除前置校验」变成一记响亮的测试失败。
 *
 * ## 另一个反向约束
 *
 * 校验同时也不能误伤：余额足够时必须放行，测试账号必须交给它自己的日限额机制。
 * 只测「被拦」不测「被放过」的测试，会把平台变成谁也用不了。
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

type SeedUserOverrides = Record<string, unknown>;

/**
 * ⚠️ plan 必须配 planExpiresAt，否则 loadAdminData 的会员惰性维护链
 * （expireMemberships）会把没有到期日的订阅判成已过期并降级回 Free，
 * 于是「已订阅用户」这条用例永远只能走到 NO_SUBSCRIPTION 分支 ——
 * 测试写错了地方，却像通过了。
 */
async function seedUser(overrides: SeedUserOverrides = {}) {
  const base = {
    id: "user-1",
    name: "tester",
    email: "tester@example.com",
    account: "tester@example.com",
    registeredAt: "2026-01-01 00:00:00",
    loginMethod: "email",
    role: "viewer",
    status: "normal",
    plan: "Free",
    organization: "个人",
    credits: 0,
    frozenCredits: 0,
    expiredCredits: 0,
    totalRecharge: 0,
    totalConsumed: 0,
    lastSeen: "刚刚",
    risk: "低",
  };
  const payload: Record<string, unknown> = { users: [{ ...base, ...overrides }] };
  if (typeof overrides.creditBatches === "undefined" && overrides.__batches) {
    payload.creditBatches = overrides.__batches;
  }
  /** 垫付日封顶要靠当天已垫付的历史任务来触发，造数据时得能把它们塞进去。 */
  if (overrides.__aiTasks) payload.aiTasks = overrides.__aiTasks;
  await writeFile(
    path.join(dataDir, "admin-data.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

async function expectBillingRejection(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("期望被积分校验拦下，但请求被放行了");
  } catch (error) {
    expect((error as Error).name).toBe("AiBillingError");
    return error as Error & { code: string; requiredCredits: number; availableCredits: number };
  }
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-ai-credit-gate-test-"));
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

describe("AI 事前余额校验：0 积分不得放行", () => {
  it("⭐ 核心回归：0 积分 + 全站默认出图模型，必须被拦下（线上漏洞本体）", async () => {
    await seedUser({ credits: 0, plan: "Free" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    const error = await expectBillingRejection(
      assertUserCanAffordAiUsage({
        userId: "user-1",
        capabilityKey: "text_to_image",
        outputCount: 1,
        model: DEFAULT_IMAGE_MODEL_ID,
      }),
    );

    expect(error.code).toBe("NO_SUBSCRIPTION");
    expect(error.availableCredits).toBe(0);
    expect(error.requiredCredits).toBe(70);
  });

  it("⭐ 0 积分 + 文本能力（提示词反推、AI 助手）同样不得放行", async () => {
    await seedUser({ credits: 0, plan: "Free" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    const error = await expectBillingRejection(
      assertUserCanAffordAiUsage({
        userId: "user-1",
        capabilityKey: "text_generation",
        outputCount: 1,
        model: "claude-opus-5",
      }),
    );

    expect(error.code).toBe("NO_SUBSCRIPTION");
    expect(error.requiredCredits).toBe(20);
  });

  it("额度不够支付多张图时，按多张的总价拦截", async () => {
    await seedUser({ credits: 100, plan: "Pro", planExpiresAt: "2030-01-01 00:00:00" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    const error = await expectBillingRejection(
      assertUserCanAffordAiUsage({
        userId: "user-1",
        capabilityKey: "text_to_image",
        outputCount: 4,
        model: DEFAULT_IMAGE_MODEL_ID,
      }),
    );

    expect(error.code).toBe("INSUFFICIENT_BALANCE");
    expect(error.requiredCredits).toBe(280);
    expect(error.availableCredits).toBe(100);
  });

  it("4K 出图按 2.71 倍估价，1K 够钱不代表 4K 也够", async () => {
    await seedUser({ credits: 130, plan: "Pro", planExpiresAt: "2030-01-01 00:00:00" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    // 1K 只要 70，130 积分够 —— 放行。
    await assertUserCanAffordAiUsage({
      userId: "user-1",
      capabilityKey: "text_to_image",
      outputCount: 1,
      model: DEFAULT_IMAGE_MODEL_ID,
    });

    // 同样这批积分点 4K（2160 短边）就该被拦。
    await expectBillingRejection(
      assertUserCanAffordAiUsage({
        userId: "user-1",
        capabilityKey: "text_to_image",
        outputCount: 1,
        model: DEFAULT_IMAGE_MODEL_ID,
        targetWidth: 3840,
        targetHeight: 2160,
      }),
    );
  });
});

describe("AI 事前余额校验：容差垫付（差一点由平台补足）", () => {
  it("⭐ 差 15 积分（≤20 容差）→ 平台垫付放行，不弹窗", async () => {
    await seedUser({ credits: 55, plan: "Pro", planExpiresAt: "2030-01-01 00:00:00" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    await expect(assertUserCanAffordAiUsage({
      userId: "user-1",
      capabilityKey: "text_to_image",
      outputCount: 1,
      model: DEFAULT_IMAGE_MODEL_ID,
    })).resolves.toBeUndefined();
  });

  it("差价正好 20（容差上限边界）→ 仍然垫付", async () => {
    await seedUser({ credits: 50, plan: "Pro", planExpiresAt: "2030-01-01 00:00:00" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    await expect(assertUserCanAffordAiUsage({
      userId: "user-1",
      capabilityKey: "text_to_image",
      outputCount: 1,
      model: DEFAULT_IMAGE_MODEL_ID,
    })).resolves.toBeUndefined();
  });

  it("⭐ 差 25 积分（>20 容差）→ 拦截，走正常的充值引导", async () => {
    await seedUser({ credits: 45, plan: "Pro", planExpiresAt: "2030-01-01 00:00:00" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    const error = await expectBillingRejection(
      assertUserCanAffordAiUsage({
        userId: "user-1",
        capabilityKey: "text_to_image",
        outputCount: 1,
        model: DEFAULT_IMAGE_MODEL_ID,
      }),
    );

    expect(error.code).toBe("INSUFFICIENT_BALANCE");
    expect(error.availableCredits).toBe(45);
  });

  /**
   * ⭐⭐ 这条是容差策略里最容易踩的坑。
   *
   * text_generation 恰好 20 积分，正好等于容差上限 AI_CREDIT_GRACE_LIMIT。
   * 只要把「用户必须自付一部分」写成 `shortfall <= LIMIT` 而不要求余额 > 0，
   * 0 积分用户的差额就是 20 —— 全额垫付，等于把上一轮刚堵上的
   * 「0 积分不可用 AI」原样开回来，而且是无限次。
   */
  it("⭐⭐ 0 积分 + 文本能力（恰好 20 积分）：不得全额垫付，必须拦截", async () => {
    await seedUser({ credits: 0, plan: "Free" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    const error = await expectBillingRejection(
      assertUserCanAffordAiUsage({
        userId: "user-1",
        capabilityKey: "text_generation",
        outputCount: 1,
        model: "claude-opus-5",
      }),
    );

    expect(error.code).toBe("NO_SUBSCRIPTION");
    expect(error.availableCredits).toBe(0);
  });

  /**
   * 并发放大是容差真正的风险点：垫付在放行之后才结算，没法冻结余额，
   * 所以 N 个并发请求会各自通过事前校验、各自垫一次。没有日上限的话，
   * 余额 50 的用户并发几百次就能让平台垫出去几千积分。
   */
  it("⭐ 当天累计垫付触顶后，不再垫付（挡并发薅羊毛）", async () => {
    await seedUser({
      credits: 55,
      plan: "Pro",
      planExpiresAt: "2030-01-01 00:00:00",
      __aiTasks: [
        {
          id: "task_past_1",
          userId: "user-1",
          createdAt: new Date().toISOString(),
          status: "success",
          chargedCredits: 70,
          platformSubsidizedCredits: 85,
        },
      ],
    });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    // 已垫 85 + 本次差 15 = 100 ≤ 100 尚可；但这里的重点是再下一笔会被拒。
    await expect(assertUserCanAffordAiUsage({
      userId: "user-1",
      capabilityKey: "text_to_image",
      outputCount: 1,
      model: DEFAULT_IMAGE_MODEL_ID,
    })).resolves.toBeUndefined();
  });

  it("⭐ 当天累计垫付超过日上限 → 退化为正常拦截", async () => {
    await seedUser({
      credits: 55,
      plan: "Pro",
      planExpiresAt: "2030-01-01 00:00:00",
      __aiTasks: [
        {
          id: "task_past_1",
          userId: "user-1",
          createdAt: new Date().toISOString(),
          status: "success",
          chargedCredits: 70,
          platformSubsidizedCredits: 100,
        },
      ],
    });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    const error = await expectBillingRejection(
      assertUserCanAffordAiUsage({
        userId: "user-1",
        capabilityKey: "text_to_image",
        outputCount: 1,
        model: DEFAULT_IMAGE_MODEL_ID,
      }),
    );

    expect(error.code).toBe("INSUFFICIENT_BALANCE");
  });
});

describe("AI 事前余额校验：不得误伤正常用户", () => {
  it("余额足够时必须放行", async () => {
    await seedUser({ credits: 500, plan: "Pro", planExpiresAt: "2030-01-01 00:00:00" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    await expect(assertUserCanAffordAiUsage({
      userId: "user-1",
      capabilityKey: "text_to_image",
      outputCount: 2,
      model: DEFAULT_IMAGE_MODEL_ID,
    })).resolves.toBeUndefined();
  });

  it("⭐ 已订阅但额度用尽 → INSUFFICIENT_BALANCE，不是 NO_SUBSCRIPTION", async () => {
    await seedUser({ credits: 0, plan: "Studio", planExpiresAt: "2030-01-01 00:00:00" });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    const error = await expectBillingRejection(
      assertUserCanAffordAiUsage({
        userId: "user-1",
        capabilityKey: "text_to_image",
        outputCount: 1,
        model: DEFAULT_IMAGE_MODEL_ID,
      }),
    );

    /**
     * ⚠️ 这两个 code 直接决定前端把用户送去订阅页还是充值页。
     * 把老用户误判成「没订阅」，等于对着已经付过钱的人推销套餐，
     * 比单纯报错更伤。
     */
    expect(error.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("⭐ 测试账号交给自己的日限额机制，不参与通用余额校验", async () => {
    await seedUser({
      credits: 0,
      plan: "Free",
      accountType: "test",
      testProfile: {
        dailyCreditLimit: 1000,
        expiresAt: "2030-01-01T00:00:00.000Z",
        usageDate: "2026-09-18",
        reservedCredits: 0,
        reservations: {},
      },
    });
    const { assertUserCanAffordAiUsage } = await loadAdminStore();

    /**
     * 测试账号 0 积分也不该在这里被拦：它有 dailyCreditLimit 这套独立配额，
     * 由 reserveTestAccountAiUsage 负责。再按通用余额卡一次，
     * 等于给同一笔消费套两套互不相干的规则。
     */
    await expect(assertUserCanAffordAiUsage({
      userId: "user-1",
      capabilityKey: "text_to_image",
      outputCount: 1,
      model: DEFAULT_IMAGE_MODEL_ID,
    })).resolves.toBeUndefined();
  });
});

/**
 * ⚠️ 用 import.meta.url 定位，不要用 process.cwd()。
 * vitest 的工作目录不保证是仓库根目录，按 cwd 拼路径会在某些执行方式下
 * 读到别的文件（甚至读成功但内容不是 server/index.ts），
 * 表现为源码断言莫名其妙失败，且报错信息长得像"代码不存在"。
 *
 * ⚠️ 注释剥离必须用 shared/strip-source-comments 的唯一实现。
 * 十几个源码断言测试曾各自抄了一份贪心正则，遇上 `"image/*"` 就吞掉大段代码，
 * 让所有 not.toContain 恒绿 —— 抄一份等于把这枚雷再埋一次。
 */
const SERVER_INDEX_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "index.ts",
);

async function readServerIndexSource() {
  const raw = await readFile(SERVER_INDEX_PATH, "utf8");
  const stripped = stripSourceComments(raw);
  // 自检：剥离器没吃多说明断言看到的是真代码，否则下面的结论全是空的。
  assertStripKeptSource(raw, stripped);
  return stripped;
}

describe("server 路由层：402 响应体必须带着 code 与额度", () => {
  /**
   * 前端靠 `code` 分流两种文案（见 InsufficientCreditsDialog），
   * 少了任何一个字段，用户看到的就会退化成一句没头没尾的「生成失败」。
   * 这里用源码断言锁住形状，防止有人顺手在 catch 里重写成 `{ error: message }`。
   */
  it("aiBillingErrorBody 与 402 分支存在于 server/index.ts", async () => {
    const code = await readServerIndexSource();

    expect(code).toContain("function aiBillingErrorBody");
    expect(code).toMatch(/requiredCredits:\s*error\.requiredCredits/);
    expect(code).toMatch(/code:\s*error\.code/);
    expect(code).toContain("instanceof AiBillingError ? error : null");
  });

  it("余额被拦时不计入 AI 用量（不产生 failed 任务、不触发告警）", async () => {
    const code = await readServerIndexSource();

    // 三处 AI catch 分支都必须带 billingError 守卫，漏一处就有一条路由会脏记一笔。
    const guardedBranches = code.match(/successRecorded.*&&\s*!billingError|!successRecorded\s*&&\s*!billingError/g) || [];
    expect(guardedBranches.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * 门禁**覆盖率**：每增加一条 AI 路由都得挂上拦截，否则这次修的洞会以同样的方式重开一次。
 *
 * ## 做法
 * 按 `app.<method>("/api/...")` 把 server/index.ts 切成若干路由块，
 * 凡是块里出现「打 AI 上游」的调用，就要求同一块里出现 `handleTrackedAiRequest`
 * 或 `reserveAiRouteUsage` —— 两者内部都会走到 assertUserCanAffordAiUsage。
 *
 * ## ⚠️ 这个用例最容易变成「恒绿的装饰」
 * 三种失效方式都发生过，逐条防住：
 *   1. **切片正则失配** → 一个块都找不到，下面的循环体一次都不执行，测试全绿。
 *      所以先断言至少扫出 40 条路由，且下面指定的已知路径必须在结果里。
 *   2. **AI 调用清单漏写** → 新路由调了个清单外的 AI 函数，被认为「不打上游」而放行。
 *      清单来自 server/index.ts 的真实 import，新增 AI 能力必须同步这里。
 *   3. **只数不验** → 断言 AI_ROUTES.length === 15 这种常量会在加路由时误报。
 *      这里改成「对每个块单独assert」，加多少都自动覆盖。
 */
function collectApiRoutes(source: string) {
  const lines = source.split("\n");
  const starts: Array<{ line: number; path: string }> = [];
  lines.forEach((line, index) => {
    const matched = line.match(/^\s*app\.(post|get|all|put|delete)\("(\/api\/[^"]*)"/);
    if (matched) starts.push({ line: index + 1, path: matched[2] });
  });
  return starts.map((start, index) => ({
    ...start,
    body: lines.slice(start.line - 1, index + 1 < starts.length ? starts[index + 1].line - 1 : lines.length).join("\n"),
  }));
}

/**
 * 「打 AI 上游」的函数名。锚定 `\s*(` 是为了只认**调用**，
 * 否则 import 语句里那个同名标识符也能把整条路由判成「要计费」。
 */
const AI_UPSTREAM_CALLS = [
  "generateImages",
  "generateText",
  "orchestrator.run",
  "editImageWithPrompt",
  "enhanceImage",
  "eraseImageObjects",
  "expandImageWithVodKling",
  "extractImageText",
  "removeImageBackground",
  "removeImageWatermark",
  "createProductBackground",
  "createElementBackgroundLayer",
  "parseBrandKitFromImage",
  "runBackgroundImageTask",
];

const AI_ROUTE_GATES = ["handleTrackedAiRequest", "reserveAiRouteUsage"];

function findCalledWithin(body: string, names: string[]) {
  return names.filter(name => new RegExp(`${name.replace(".", "\\.")}\\s*\\(`).test(body));
}

describe("AI 路由门禁覆盖率：任何一条会打 AI 上游的路由都必须先过余额校验", () => {
  it("⭐ 扫出的每一条 AI 路由都挂着 handleTrackedAiRequest / reserveAiRouteUsage", async () => {
    const routes = collectApiRoutes(await readServerIndexSource());

    // 切片自检：扫不出路由说明正则与源码写法脱节了，后面的断言全部失去意义。
    expect(routes.length).toBeGreaterThanOrEqual(40);

    const aiRoutes = routes
      .map(route => ({ ...route, calls: findCalledWithin(route.body, AI_UPSTREAM_CALLS) }))
      .filter(route => route.calls.length > 0);

    // ⚠️ 这条断言的存在意义是「清单没漏 + 切片没坏」：
    // 已知的 15 条 AI 路由必须全部被认出来，少一条就说明扫描逻辑失灵了。
    const paths = aiRoutes.map(route => route.path);
    for (const expected of [
      "/api/images/generate",
      "/api/images/tasks",
      "/api/images/remove-background",
      "/api/images/enhance",
      "/api/images/remove-watermark",
      "/api/images/create-background",
      "/api/images/ocr",
      "/api/images/edit",
      "/api/images/text-replace",
      "/api/images/erase",
      "/api/images/expand",
      "/api/llm",
      "/api/ai/orchestrate",
      "/api/brand-kits/parse",
      "/api/mcp",
    ]) {
      expect(paths, `AI 路由扫描没认出 ${expected}`).toContain(expected);
    }

    for (const route of aiRoutes) {
      const gates = AI_ROUTE_GATES.filter(gate => route.body.includes(gate));
      expect(
        gates,
        `${route.path} 会调用 ${route.calls.join(" / ")} 却没有任何计费门禁 —— 0 积分用户依然可以白嫖这条能力。`,
      ).not.toHaveLength(0);
    }
  });

  it("⭐ 品牌包解析曾经连登录都不校验：这类「裸调 LLM」的写法不得复活", async () => {
    const routes = collectApiRoutes(await readServerIndexSource());
    const brandKit = routes.find(route => route.path === "/api/brand-kits/parse");
    if (!brandKit) throw new Error("没扫到 /api/brand-kits/parse，路由切片大概率坏了");

    /**
     * 它调的是 generateText（多模态），一次就要烧 token。
     * 2026-09-18 之前这里完全没有登录校验、没有余额校验、不记用量，
     * 匿名请求也能用平台的大模型账号跑品牌包解析。
     */
    expect(brandKit.body).toContain("capabilityKey: \"text_generation\"");
    expect(brandKit.body).toContain("handleTrackedAiRequest");
  });
});

/**
 * 垫付出去的钱必须在账上看得见。
 *
 * 这里锁的是 `recordAiUsage` 的扣费段：早期只有 high 模型走 `Math.min`，
 * medium 直接全量扣再让 `user.credits` 被 `Math.max(0, …)` 钳住 ——
 * 于是垫付部分既不进账面也不报警，「这个月垫了多少、被谁薅了」永远查不出来。
 */
describe("AI 事后扣费：平台垫付必须落账", () => {
  /**
   * admin-store 没有导出「读全局快照」的入口，直接读盘上的落库文件最直接。
   * ⚠️ 必须重新读盘：recordAiUsage 内部会异步 persist，
   *    复用内存里的旧对象会读到改造前的字段。
   */
  async function readPersisted() {
    const raw = await readFile(path.join(dataDir, "admin-data.json"), "utf8");
    return JSON.parse(raw) as {
      users: Array<Record<string, any>>;
      aiTasks: Array<Record<string, any>>;
      riskEvents: Array<Record<string, any>>;
    };
  }

  async function runUsage(credits: number) {
    await seedUser({ credits, plan: "Pro", planExpiresAt: "2030-01-01 00:00:00" });
    const store = await loadAdminStore();
    await store.recordAiUsage({
      userId: "user-1",
      username: "tester@example.com",
      capability: "普通图片生成",
      capabilityKey: "text_to_image",
      provider: "Tencent VOD",
      model: DEFAULT_IMAGE_MODEL_ID,
      status: "success",
      outputUnits: 1,
      startedAtMs: Date.now(),
    });
  }

  it("⭐ 余额不足时垫付额计入 platformSubsidizedCredits，用户余额归零不穿负", async () => {
    await runUsage(55);
    const snapshot = await readPersisted();

    const task = snapshot.aiTasks.find((item) => item.userId === "user-1");
    expect(task).toBeDefined();
    /** 70 应收 − 55 实扣 = 15 平台垫付。 */
    expect(task.platformSubsidizedCredits).toBe(15);
    expect(task.chargedCredits).toBe(70);

    const user = snapshot.users.find((item) => item.id === "user-1");
    expect(user.credits).toBe(0);
  });

  it("⭐ 容差内的垫付不刷风控事件（否则风控面板会被噪音淹没）", async () => {
    await runUsage(55);
    const snapshot = await readPersisted();
    expect(snapshot.riskEvents || []).toHaveLength(0);
  });

  it("⭐ 超出容差的垫付（并发叠加 / 估价差）必须报风险事件", async () => {
    await runUsage(5);
    const snapshot = await readPersisted();

    const task = snapshot.aiTasks.find((item) => item.userId === "user-1");
    expect(task.platformSubsidizedCredits).toBe(65);
    expect((snapshot.riskEvents || []).some((event) => event.title === "AI 扣费短缺")).toBe(true);
  });
});
