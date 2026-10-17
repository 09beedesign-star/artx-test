import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { __testBuildPrompt } from "./ai-orchestrator";
import { __testBuildImagePrompt } from "./image-generation";
import { parsePromptSizeIntent } from "../shared/prompt-size-intent";
import { buildUserMemoryContext } from "../shared/user-memory";

const read = (relative: string) =>
  readFileSync(path.resolve(import.meta.dirname, relative), "utf8");

describe("记忆真的被拼进了发给上游的提示词", () => {
  /*
   * ⚠️ 本项目踩过十四次的「透传但没被消费」：
   *    类型上加了字段、请求里也带了，但下游从没读过它 ——
   *    表现是「个人中心写了习惯，出图完全不理」且零报错。
   *    这两条断言就是防这个。
   */
  it("编排器的 buildPrompt 消费 userMemory", () => {
    const prompt = __testBuildPrompt(
      { prompt: "画一只橘猫", userMemory: "【用户长期设计习惯】偏好极简北欧风" },
      "",
      ""
    );
    expect(prompt).toContain("极简北欧风");
    expect(prompt).toContain("画一只橘猫");
  });

  it("generateImages 的 buildPrompt 消费 userMemory", () => {
    const prompt = __testBuildImagePrompt({
      prompt: "白色马克杯",
      userMemory: "【用户长期设计习惯】偏好极简北欧风",
    });
    expect(prompt).toContain("极简北欧风");
    expect(prompt).toContain("白色马克杯");
  });

  it("本次指令排在记忆之后，保证用户当次要求压过记忆", () => {
    /*
     * 上游对最靠后的指令权重更高。顺序写反会出现
     * 「我这次明说不要蓝色，它还是给蓝色」。
     */
    const prompt = __testBuildPrompt(
      { prompt: "这次不要蓝色", userMemory: "【用户长期设计习惯】主色用蓝" },
      "",
      ""
    );
    expect(prompt.indexOf("主色用蓝")).toBeLessThan(prompt.indexOf("这次不要蓝色"));
  });

  it("没有记忆时提示词与改造前逐字一致", () => {
    // 没开记忆的用户一个字符都不该变，否则等于给全站悄悄改了提示词。
    expect(__testBuildImagePrompt({ prompt: "白色马克杯" })).toBe("白色马克杯");
    expect(__testBuildPrompt({ prompt: "画一只橘猫" }, "", "")).toBe("画一只橘猫");
  });
});

describe("记忆不能污染尺寸意图解析", () => {
  it("长期记忆里写「我习惯 4K」不会被当成本次尺寸要求", () => {
    /*
     * ⚠️⚠️⚠️ 这是本功能最贵的一个坑：
     *    shared/prompt-size-intent.ts 会从提示词里正则扫 4K / 高清 / A4。
     *    若把记忆拼进 prompt 字段再送去解析，用户记忆里一句
     *    「我习惯出 4K 图」就会让**每一张**图都按 4K 出、按 4K 计费
     *    （2.71 倍），而界面报价仍是 1K。零报错，账单翻三倍。
     *
     * ✅ 解法：记忆走独立的 userMemory 字段，尺寸解析只看用户原话。
     *    这条测试断言「记忆内容不出现在被解析的那个字符串里」。
     */
    const memory = buildUserMemoryContext({
      document: {
        longTerm: "我习惯出 4K 高清图，A4 尺寸",
        projects: [],
        recentPrompts: [],
      },
    });
    expect(memory).toContain("4K");

    // 用户本次原话没提尺寸 → 解析结果必须为空。
    const userPrompt = "白色马克杯，简约北欧风";
    expect(parsePromptSizeIntent(userPrompt)).toBeNull();

    // 拼起来之后确实会被误判 —— 正是不能拼进 prompt 的原因。
    const polluted = `${memory}\n\n${userPrompt}`;
    expect(parsePromptSizeIntent(polluted)).not.toBeNull();
  });
});

describe("注入收口在服务端，且不信客户端传值", () => {
  const indexSource = read("./index.ts");

  it("handleTrackedAiRequest 里注入了记忆（13 条 AI 路由共用的收口）", () => {
    const tracked = indexSource.slice(
      indexSource.indexOf("async function handleTrackedAiRequest"),
      indexSource.indexOf("async function recordBillingPaymentFailureAndNotify")
    );
    expect(tracked).toContain("withUserMemory");
  });

  it("orchestrate 路由单独注入（它不走 handleTrackedAiRequest）", () => {
    const route = indexSource.slice(
      indexSource.indexOf('app.post("/api/ai/orchestrate"'),
      indexSource.indexOf('app.post("/api/brand-kits"')
    );
    expect(route).toContain("withUserMemory");
  });

  it("withUserMemory 先剥掉客户端传来的 userMemory", () => {
    /*
     * ⚠️ 不剥掉的话，任何人都能伪造一段记忆注入自己的提示词，
     *    甚至借它越过「长期记忆只能本人写」的边界。
     */
    const fn = indexSource.slice(
      indexSource.indexOf("async function withUserMemory"),
      indexSource.indexOf("async function rememberPromptQuietly")
    );
    expect(fn).toMatch(/userMemory:\s*_ignored/);
  });

  it("接口身份取自会话，不读请求体里的 userId", () => {
    const routes = indexSource.slice(
      indexSource.indexOf('app.get("/api/user/memory"'),
      indexSource.indexOf('app.get("/api/uploads/expiry"')
    );
    expect(routes).toContain("requireSessionUser");
    expect(routes).not.toContain("body.userId");
  });
});
