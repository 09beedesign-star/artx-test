/**
 * 积分前置检查测试 —— 确保 0 积分时能在发送请求前拦截。
 *
 * 【为什么需要前置检查】
 * 此前逻辑：用户点生成 → 显示"生成中" → 发送请求 → 服务端 402 → 才弹窗。
 * 用户看到的是："明明在生成，怎么突然失败了？"
 *
 * 现在逻辑：点生成 → 前端先查余额 → 0 积分立即弹窗 → 不发送请求。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const AI_CREDIT_GATE_PATH = resolve(__dirname, "./ai-credit-gate.ts");
const AI_PATH = resolve(__dirname, "./ai.ts");
const AI_CLIENT_PATH = resolve(__dirname, "./ai-client.ts");

describe("积分前置检查", () => {
  it("ai-credit-gate.ts 导出 checkUserCreditsBeforeGenerate 函数", () => {
    const source = readFileSync(AI_CREDIT_GATE_PATH, "utf-8");
    expect(source).toContain("export async function checkUserCreditsBeforeGenerate");
    expect(source).toContain("canProceed: boolean");
    expect(source).toContain("balance: number");
  });

  it("checkUserCreditsBeforeGenerate 在余额为 0 时返回 canProceed: false", () => {
    const source = readFileSync(AI_CREDIT_GATE_PATH, "utf-8");
    // 提取整个函数体（从 export 到下一个 export 或文件末尾）
    const functionMatch = source.match(
      /export async function checkUserCreditsBeforeGenerate[\s\S]+?(?=\nexport |$)/
    );
    expect(functionMatch).toBeTruthy();
    const functionBody = functionMatch![0];
    
    expect(functionBody).toContain("balance <= 0");
    expect(functionBody).toContain("emitInsufficientCredits");
    expect(functionBody).toContain("INSUFFICIENT_BALANCE");
    expect(functionBody).toContain("canProceed: false");
  });

  it("generateImages 在入口处调用 checkUserCreditsBeforeGenerate", () => {
    const source = readFileSync(AI_PATH, "utf-8");
    
    // 必须导入这个函数
    expect(source).toContain("import { emitInsufficientCredits, checkUserCreditsBeforeGenerate }");
    
    // 在 generateImages 函数体内调用
    const functionMatch = source.match(
      /export async function generateImages[\s\S]+?(?=export async function|$)/
    );
    expect(functionMatch).toBeTruthy();
    
    const functionBody = functionMatch![0];
    expect(functionBody).toContain("await checkUserCreditsBeforeGenerate()");
    expect(functionBody).toContain("canProceed");
    expect(functionBody).toContain("if (!canProceed)");
  });

  it("generateImages 在前置检查失败时抛出错误，阻止请求", () => {
    const source = readFileSync(AI_PATH, "utf-8");
    const functionMatch = source.match(
      /export async function generateImages[\s\S]+?(?=\nexport async function|$)/
    );
    const functionBody = functionMatch![0];
    
    // 检查失败后必须 throw，否则请求会继续发送
    expect(functionBody).toContain("await checkUserCreditsBeforeGenerate()");
    expect(functionBody).toContain("if (!canProceed)");
    expect(functionBody).toContain("throw new Error");
    expect(functionBody).toContain("当前额度已用尽");
  });

  it("前置检查必须在 requireAiAuth() 之后立即执行，早于任何业务逻辑", () => {
    const source = readFileSync(AI_PATH, "utf-8");
    const functionMatch = source.match(
      /export async function generateImages[\s\S]+?(?=\nexport async function|$)/
    );
    const functionBody = functionMatch![0];
    
    // 找到 requireAiAuth 和 checkUserCreditsBeforeGenerate 的位置
    const authIndex = functionBody.indexOf("requireAiAuth()");
    const checkIndex = functionBody.indexOf("await checkUserCreditsBeforeGenerate()");
    const resolveRatioIndex = functionBody.indexOf("resolveImageRatio");
    
    expect(authIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeGreaterThan(-1);
    expect(resolveRatioIndex).toBeGreaterThan(-1);
    
    // 检查顺序：requireAiAuth → checkUserCreditsBeforeGenerate → 业务逻辑
    expect(checkIndex).toBeGreaterThan(authIndex);
    expect(resolveRatioIndex).toBeGreaterThan(checkIndex);
  });

  it("orchestrateAi 也必须有积分前置检查", () => {
    const source = readFileSync(AI_CLIENT_PATH, "utf-8");
    const functionMatch = source.match(
      /export async function orchestrateAi[\s\S]+?(?=export async function|$)/
    );
    expect(functionMatch).toBeTruthy();
    
    const functionBody = functionMatch![0];
    expect(functionBody).toContain("checkUserCreditsBeforeGenerate");
    expect(functionBody).toContain("canProceed");
    expect(functionBody).toContain("if (!canProceed)");
    expect(functionBody).toContain("当前额度已用尽");
  });

  it("expandImage 也必须有积分前置检查", () => {
    const source = readFileSync(AI_CLIENT_PATH, "utf-8");
    const functionMatch = source.match(
      /export async function expandImage[\s\S]+?(?=export async function|$)/
    );
    expect(functionMatch).toBeTruthy();
    
    const functionBody = functionMatch![0];
    expect(functionBody).toContain("checkUserCreditsBeforeGenerate");
    expect(functionBody).toContain("canProceed");
  });

  it("前置检查的 API base URL 必须与 api-base-url.ts 保持一致", () => {
    const source = readFileSync(AI_CREDIT_GATE_PATH, "utf-8");
    const functionMatch = source.match(
      /export async function checkUserCreditsBeforeGenerate[\s\S]+?(?=\nexport |$)/
    );
    expect(functionMatch).toBeTruthy();
    const functionBody = functionMatch![0];
    
    // 必须使用 backstage.artxsd.com（与 ART_X_TEST_API_BASE_URL 一致）
    expect(functionBody).toContain("backstage.artxsd.com");
    
    // localhost 和 github.io 必须指向生产环境
    expect(functionBody).toContain("hostname.endsWith(\"github.io\")");
  });

  it("网络异常时必须放行，避免因临时断网阻断用户", () => {
    const source = readFileSync(AI_CREDIT_GATE_PATH, "utf-8");
    const functionMatch = source.match(
      /export async function checkUserCreditsBeforeGenerate[\s\S]+?(?=\nexport |$)/
    );
    expect(functionMatch).toBeTruthy();
    const functionBody = functionMatch![0];
    
    // try-catch 结构：网络异常时必须返回 canProceed: true
    expect(functionBody).toContain("} catch {");
    expect(functionBody).toContain("// 网络异常：放行");
    expect(functionBody).toContain("return { canProceed: true, balance: 0 };");
  });
});
