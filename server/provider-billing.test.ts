import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const billingSource = fs.readFileSync(
  path.join(process.cwd(), "server/provider-billing.ts"),
  "utf8"
);
const adminStoreSource = fs.readFileSync(
  path.join(process.cwd(), "server/admin-store.ts"),
  "utf8"
);
const clientSource = fs.readFileSync(
  path.join(process.cwd(), "client/src/pages/AdminPrototypePage.tsx"),
  "utf8"
);

describe("provider billing 接口接入", () => {
  it("佐糖余额用的是实测可用路径，不是官方文档里那个 404 路径", () => {
    // 官方文档写的是 /tech/customers/package-credits，实测返回
    // 404 {"status":404,"message":"wxtech.aoscdn.com not found"}。
    // 真实可用的是 /api/customers/package-credits。
    expect(billingSource).toContain("https://techsz.aoscdn.com/api/customers/package-credits");
    expect(billingSource).not.toMatch(/fetch\(\s*["']https:\/\/techsz\.aoscdn\.com\/tech\//);
  });

  it("佐糖鉴权用 X-API-KEY 头，与图片处理链路一致", () => {
    expect(billingSource).toContain('"X-API-KEY": key');
  });

  it("腾讯云计费复用 VOD 凭据，不额外要求新密钥", () => {
    // TENCENT_VOD_SID 就是标准腾讯云 SecretId（AKID 开头），
    // 可直接用于 billing.tencentcloudapi.com，无需单独申请。
    expect(billingSource).toContain("process.env.TENCENT_VOD_SID");
    expect(billingSource).toContain("process.env.TENCENT_VOD_SKEY");
    expect(billingSource).toContain("billing.tencentcloudapi.com");
    expect(billingSource).toContain("DescribeAccountBalance");
  });

  it("腾讯云签名走 TC3-HMAC-SHA256", () => {
    expect(billingSource).toContain("TC3-HMAC-SHA256");
    expect(billingSource).toContain("tc3_request");
  });

  it("美图被明确标记为无余额接口，不做盲猜式探测", () => {
    // 美图开放平台未公开任何账户余额/用量查询 API。
    // 这里必须显式返回「无 API」，不能伪造一个看起来能用的端点。
    expect(billingSource).toContain("未公开账户余额/用量查询 API");
    expect(adminStoreSource).toMatch(/ai_meitu:\s*\{[^}]*billingApi:\s*false/);
  });

  it("余额查询有超时降级，不会拖垮后台面板", () => {
    expect(billingSource).toContain("withTimeout");
    expect(billingSource).toContain("TIMEOUT_MS");
    expect(billingSource).toContain("CACHE_TTL_MS");
  });
});

describe("供应商最近调用详情", () => {
  it("provider 匹配用前缀而非全等，能兜住带后缀的变体", () => {
    // server/index.ts 里存在 "PicWish/佐糖 r-background" 这种带后缀的写法，
    // 用全等匹配会让这些调用变成「有数据但没归属」的孤儿记录。
    expect(adminStoreSource).toContain("function matchProviderId");
    expect(adminStoreSource).toContain("task.startsWith(`${name} `)");
  });

  it("最近调用从 aiTasks 派生，不额外落库", () => {
    expect(adminStoreSource).toContain("function enrichProvidersWithUsage");
    expect(adminStoreSource).toContain("lastCall:");
    expect(adminStoreSource).toContain("recentStats:");
  });

  it("有真实延迟样本时覆盖硬编码基线", () => {
    // 改造前 latencyMs 全是硬编码常量（220/812/1450…），
    // 看着像实时数据其实从来没变过。
    expect(adminStoreSource).toContain("avgLatencyMs > 0 ? avgLatencyMs : provider.latencyMs");
  });

  it("providers 接口返回的是 enrich 之后的数据", () => {
    expect(adminStoreSource).toMatch(
      /route === "providers"\) return \{ status: 200, body: \{ providers: await buildEnrichedProviders\(data\)/
    );
    // ⚠️ 必须用 [\s\S] 而不是 .：ai-tasks 分支已从单行 return 扩成多行块
    // （出口要补 startedAt/completedAt），. 默认不跨行会误判成回归。
    expect(adminStoreSource).toMatch(
      /route === "ai-tasks"\)[\s\S]*providers: await buildEnrichedProviders\(data\)/
    );
  });

  it("余额查询失败不影响面板主流程", () => {
    expect(adminStoreSource).toContain("provider billing query failed");
  });
});

describe("前端结算入口", () => {
  it("面板组件已替换掉原先的单行列表", () => {
    expect(clientSource).toContain("function ProviderHealthPanel");
    expect(clientSource).toContain("<ProviderHealthPanel providers={adminData.providers} />");
  });

  it("展示最近调用详情与近 24h 统计", () => {
    expect(clientSource).toContain("最近一次调用");
    expect(clientSource).toContain("近 24h：");
    expect(clientSource).toContain("上游任务号");
  });

  it("结算入口按钮存在且外链安全", () => {
    expect(clientSource).toContain("settlement.consoleUrl");
    expect(clientSource).toContain('rel="noreferrer"');
  });

  it("无余额接口的厂商要如实说明，不能假装在查", () => {
    expect(clientSource).toContain("该厂商未开放余额查询接口");
  });
});
