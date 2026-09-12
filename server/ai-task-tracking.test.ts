import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const indexSource = fs.readFileSync(path.join(process.cwd(), "server/index.ts"), "utf8");
const adminStoreSource = fs.readFileSync(path.join(process.cwd(), "server/admin-store.ts"), "utf8");
const clientSource = fs.readFileSync(
  path.join(process.cwd(), "client/src/pages/AdminPrototypePage.tsx"),
  "utf8"
);

describe("AI 任务追踪：provider 归属", () => {
  it("不再把 orchestrator 的 route 当成厂商名写进任务记录", () => {
    // ⚠️ 这是最核心的一条断言。
    // resolveModelRoute().provider 取值只有 "image" / "text"，
    // 那是「走哪条流水线」的分类，不是厂商名。
    // 历史上它被直接写进 aiTasks[].provider，导致 500 条生产记录里
    // 有 374 条 provider 是 "image"/"text"，后台第三方接口面板
    // 永远看不到腾讯云 VOD / BKEEL 的任何调用数据，且不会报任何错。
    expect(indexSource).not.toMatch(/provider:\s*result\.route\b/);
    expect(indexSource).not.toMatch(/provider:\s*storedResult\.route\b/);
  });

  it("不再出现硬编码的 provider: \"AI\"", () => {
    // "AI" 与健康度列表里任何一个 name 都不相等，
    // 这些记录在成本分组里会变成没有归属的孤儿。
    expect(indexSource).not.toMatch(/provider:\s*"AI",/);
  });

  it("按能力类型解析厂商：文本走 BKEEL，图片按模型判定", () => {
    expect(indexSource).toContain("function resolveProviderByCapability");
    expect(indexSource).toContain('const TEXT_PROVIDER_BKEEL = "BKEEL"');
    // 文本分支必须返回中转站，而不是流水线分类 "text"。
    expect(indexSource).toMatch(
      /if \(capabilityKey === "text_generation"\)\s*\{\s*return TEXT_PROVIDER_BKEEL;/
    );
    // 非文本能力回落到按模型 id 判定 VOD / 中转站。
    expect(indexSource).toMatch(/return resolveImageProviderLabel\(model\);/);
  });

  it("OCR 单独归到中转站，不会被误判成 VOD 出图", () => {
    // /api/images/ocr 走的是中转站视觉模型，不是 VOD 出图链路。
    expect(indexSource).toMatch(
      /if \(capabilityKey === "image_ocr"\)\s*\{\s*return IMAGE_PROVIDER_RELAY;/
    );
  });

  it("解析出来的厂商名必须能在健康度列表里找到对应条目", () => {
    // 两者靠字符串字面相等关联，改名必须两边同步，
    // 否则会出现「有数据没归属」或「有归属没数据」，且不报错。
    const declaredProviders = [
      ...indexSource.matchAll(/const (?:IMAGE_PROVIDER_\w+|TEXT_PROVIDER_\w+) = "([^"]+)"/g),
    ].map((match) => match[1]);
    expect(declaredProviders.length).toBeGreaterThanOrEqual(3);

    const healthNames = [...adminStoreSource.matchAll(/\{ id: "ai_\w+", name: "([^"]+)"/g)].map(
      (match) => match[1]
    );
    for (const provider of declaredProviders) {
      expect(healthNames).toContain(provider);
    }
  });

  it("orchestrate 失败记录复用 preflight 的归属，不退回按请求体猜", () => {
    // 失败记录如果归属错了，厂商维度的失败率永远是 0。
    expect(indexSource).toContain("let preflightTracking: AiRouteTracking | undefined;");
    expect(indexSource).toMatch(/provider: preflightTracking\?\.provider/);
  });
});

describe("AI 任务追踪：执行/输出时间", () => {
  it("任务记录类型带 startedAt / completedAt", () => {
    expect(adminStoreSource).toMatch(/startedAt\?:\s*string;/);
    expect(adminStoreSource).toMatch(/completedAt\?:\s*string;/);
  });

  it("路由层把真实的指令下发时刻透传给落库逻辑", () => {
    // recordAiRouteUsage 本来就持有 startedAt（用于算 latencyMs），
    // 之前算完就丢掉了，现在必须一并落库。
    expect(indexSource).toContain("startedAtMs: input.startedAt");
    expect(adminStoreSource).toMatch(/startedAtMs\?:\s*number;/);
  });

  it("历史记录在出口统一补齐时间轴，前端不用区分新旧数据", () => {
    // 生产上已有的 500 条记录全部缺这两个字段，
    // 必须用 completedAt - latencyMs 反推兜底，并标记 derived。
    expect(adminStoreSource).toContain("function deriveTaskTimeline");
    expect(adminStoreSource).toContain("timelineDerived: timeline.derived");
    expect(adminStoreSource).toMatch(/completedMs - \(Number\(task\.latencyMs\) \|\| 0\)/);
  });

  it("前端任务追踪列表展示执行与输出时间", () => {
    expect(clientSource).toContain("执行指令");
    expect(clientSource).toContain("输出结果");
    // 反推出来的时间要明确标注，避免被当成真实落库值。
    expect(clientSource).toContain("（按耗时推算）");
  });

  it("时间轴信息放在独立的 submeta 行，不会被 meta 的 truncate 截断", () => {
    expect(clientSource).toMatch(/submeta\?:\s*string;/);
    expect(clientSource).toContain("{row.submeta}");
  });
});
