import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertStripKeptSource, stripSourceComments } from "../../../shared/strip-source-comments";
import { AI_BILLING_BLOCKED_MESSAGES } from "../../../shared/ai-credit-policy";

/**
 * notifyAiFailure 内部会直接调 toast，所以要先把 sonner 换成假实现。
 * vi.mock 会被提升到 import 之前，模块里那句 `import { toast } from "sonner"`
 * 拿到的就是这个假对象。
 */
vi.mock("sonner", () => ({ toast: vi.fn() }));

import { toast } from "sonner";
import { isAiCreditBlockedMessage, notifyAiFailure } from "./ai-credit-gate";

/**
 * 「计费拦截不留失败节点」的契约测试。
 *
 * ## 背景
 *
 * 画布上的占位框是在请求**发出之前**插进去的（用户要立刻看到"正在生成中"），
 * 402 要等请求回来才知道。此前一律把占位框改成"生成图片失败"留在画布上，
 * 于是未订阅/余额不足的用户点一次生成，就白得一个（批量时是并排 4 个）空失败框：
 * 弹窗说没钱、画布却像出了故障。
 *
 * ## 这条链路为什么必须锁住
 *
 * 判定依据是**文案**：全站 15 处 catch 只把 `error.message` 往下传，
 * 402 的 code 在这一层已经丢了。文案一旦在两端各写一份，
 * 服务端改词 → 画布侧静默失效 → 失败节点重新爬回画布，且没有任何报错。
 * 所以这里同时锁三件事：文案同源、判定函数会认、画布真的调了它。
 *
 * ⚠️ 源码断言一律走 shared/strip-source-comments 的唯一实现，
 *    且必须先 assertStripKeptSource 自检 —— 否则注释被吃多时断言会恒绿。
 */

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * @param maxLossRatio 剥离自检的容忍比例。
 *   ⚠️ 大文件用默认的 0.3；**小契约文件必须放宽**：ai-credit-gate.ts 是
 *   一份「只剩约定」的模块，注释本来就占一多半，按大文件口径测会误报成
 *   「剥离器坏了」。放宽前先确认：这个文件里确实没有 `"image/*"` 这类
 *   会把块注释正则带跑的字符串，否则真坏了也会被当成正常。
 */
function readSource(relativePath: string, maxLossRatio = 0.3) {
  const filePath = path.join(repoRoot, relativePath);
  const raw = readFileSync(filePath, "utf8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, maxLossRatio);
  return { raw, stripped };
}

describe("计费拦截文案：前后端必须同源", () => {
  it("isAiCreditBlockedMessage 认得出两条服务端文案", () => {
    expect(isAiCreditBlockedMessage(AI_BILLING_BLOCKED_MESSAGES.NO_SUBSCRIPTION)).toBe(true);
    expect(isAiCreditBlockedMessage(AI_BILLING_BLOCKED_MESSAGES.INSUFFICIENT_BALANCE)).toBe(true);
  });

  it("网络/上游类失败不会被误判成计费拦截 —— 那些必须保留失败节点给用户重试", () => {
    for (const message of [
      undefined,
      null,
      "",
      "图像生成超时，请稍后重试",
      "AI 未返回可用图片，请稍后重试",
      "Failed to fetch",
      "当前未订阅套餐，暂无可用创作积分（额外说明）",
    ]) {
      expect(isAiCreditBlockedMessage(message)).toBe(false);
    }
  });

  it("服务端不再自己写一段文案，而是引用 shared 常量", () => {
    const { stripped } = readSource("server/admin-store.ts");

    expect(stripped).toContain("AI_BILLING_BLOCKED_MESSAGES[input.code]");
    // 硬编码回来就等于重新出现第二份真相 —— 前端会跟着静默失效。
    expect(stripped).not.toContain(AI_BILLING_BLOCKED_MESSAGES.NO_SUBSCRIPTION);
    expect(stripped).not.toContain(AI_BILLING_BLOCKED_MESSAGES.INSUFFICIENT_BALANCE);
  });

  it("前端判定层不重复写文案，只从 shared 取", () => {
    // 用未剥离的原文断言：连注释里都不该出现第二份字面量。
    const { raw } = readSource("client/src/lib/ai-credit-gate.ts", 0.6);

    expect(raw).toContain('from "@shared/ai-credit-policy"');
    expect(raw).not.toContain(AI_BILLING_BLOCKED_MESSAGES.NO_SUBSCRIPTION);
    expect(raw).not.toContain(AI_BILLING_BLOCKED_MESSAGES.INSUFFICIENT_BALANCE);
  });
});

describe("画布接线：计费拦截时撤占位框而不是标失败", () => {
  const canvasPath = "client/src/components/canvas/InfiniteCanvas.tsx";

  it("failed 分支按文案识别计费拦截，并调用撤框函数", () => {
    const { stripped } = readSource(canvasPath);

    expect(stripped).toContain("isAiCreditBlockedMessage(detail.error)");
    expect(stripped).toContain("removeGenerationPlaceholders(nds, generationId)");
    /**
     * 撤框必须被 blockedByCredits 包住：无条件撤会把普通的网络失败也变成
     * 「点了生成、画布什么都没发生」，用户连重试的入口都找不到。
     */
    expect(stripped).toMatch(
      /if \(blockedByCredits\) \{[\s\S]{0,300}?removeGenerationPlaceholders\(nds, generationId\)/
    );
  });

  it("占位框在创建处打标记，且全文件只此一处", () => {
    const { stripped } = readSource(canvasPath);

    expect(stripped.match(/placeholderForGeneration: true/g) || []).toHaveLength(1);
  });

  it("撤框逻辑复用的是可测的纯函数模块，不是内联在组件里", () => {
    const { stripped } = readSource(canvasPath);
    expect(stripped).toContain('from "@/lib/canvas-generation-nodes"');
  });
});

describe("notifyAiFailure：缺积分时把话留给弹窗一个人说", () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
  });

  it("两条计费文案都不弹 toast", () => {
    for (const message of [
      AI_BILLING_BLOCKED_MESSAGES.NO_SUBSCRIPTION,
      AI_BILLING_BLOCKED_MESSAGES.INSUFFICIENT_BALANCE,
    ]) {
      notifyAiFailure("图像生成失败", message);
      expect(toast).not.toHaveBeenCalled();
    }
  });

  it("网络/上游类失败照常弹，且原样带出服务端原因", () => {
    notifyAiFailure("图像生成失败", "图像生成超时，请稍后重试");
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("图像生成失败", {
      description: "图像生成超时，请稍后重试",
    });
  });

  it("空 message 也算正常失败 —— 只有认得出的计费文案才静默", () => {
    notifyAiFailure("AI 生成失败", "");
    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe("AI 失败提示必须走统一出口", () => {
  /**
   * 这份白名单 = 已确认「错误来自 AI 请求」的失败 toast 标题。
   *
   * 没收录的（"拖入图片失败" / "导出失败" / "粘贴图片失败" …）是本地操作或参数校验，
   * 它们跟充值弹窗没关系统不该静默 —— 所以这里宁可白名单窄一点，也不要一刀切。
   */
  const AI_FAILURE_TITLES = [
    "Prompt 节点生成失败",
    "全局提示词处理失败",
    "图像生成失败",
    "字体设计生成失败",
    "AI 助手请求失败",
    "AI 生成失败",
    "首页提示词自动处理失败",
    "文案应用失败",
    "再次生成失败",
    "快捷编辑失败",
    "提示词反推失败",
    "智能文案编辑失败",
    "图层分离失败",
    "工作区 AI 生成失败",
    "Chat 节点请求失败",
  ];

  function walkClientSource(): string[] {
    const found: string[] = [];
    const stack = [path.join(repoRoot, "client", "src")];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
          found.push(path.relative(repoRoot, full));
      }
    }
    return found;
  }

  it("各处 AI 失败 toast 都换成了 notifyAiFailure —— 直连 toast 的必须清零", () => {
    const offenders: string[] = [];

    for (const relativePath of walkClientSource()) {
      /**
       * ⚠️ 这里刻意用**未剥离的原文**：本断言是正向匹配（`toast("X", message)` 这种
       * 精确的代码形态），注释里不可能出现这种写法；而走 strip 反而要为每个文件
       * 挑不同的注释容忍度 —— 那些小组件的注释占比天然过半，自检会先误报一轮。
       */
      const raw = readFileSync(path.join(repoRoot, relativePath), "utf8");
      for (const title of AI_FAILURE_TITLES) {
        /**
         * 两种形态都要认得到：
         * - 旧写法 `toast("X失败", { description: message })`
         * - 新写法 `notifyAiFailure("X失败", message)`
         *
         * ⚠️ 只匹配旧的那一版是不够的 —— 那样现状里已经没有旧写法，
         *    关于「不许用 toast」的断言就永远绿。变异测试（把某条改回 toast）
         *    立刻就能证明它是不是真的在拦。
         *
         * 同标题的参数校验分支（description 是固定句，如"当前图片没有可处理的图像来源"）
         * 匹配不到这里，那些不是 AI 失败，该照常显示。
         */
        const pattern = new RegExp(
          `toast\\(\\s*"${title}",\\s*\\{[^}]*description:\\s*(?:message|failureMessage)\\s*\\}\\)` +
            `|notifyAiFailure\\(\\s*"${title}",\\s*(?:message|failureMessage)\\s*\\)`,
          "g"
        );
        for (const call of raw.match(pattern) ?? []) {
          if (call.startsWith("toast")) offenders.push(`${relativePath}: ${call}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("计费拦截撤框后，视角要退回生成前的位置", () => {
  const canvasPath = "client/src/components/canvas/InfiniteCanvas.tsx";

  /**
   * 取一行的前导空白长度当「嵌套深度」。
   * 这比数 tab/空格更稳 —— 这个文件里两种缩进混着用。
   */
  function depthOf(source: string, needle: string) {
    const line = source.split("\n").find(l => l.includes(needle));
    if (!line) return null;
    return { line, depth: line.length - line.trimStart().length };
  }

  it("移视角之前必须先拍快照 —— 事后才拍就已经晚了", () => {
    const { stripped } = readSource(canvasPath);

    const remember = stripped.indexOf("rememberViewportBeforeGeneration(generationId)");
    const focus = stripped.indexOf("focusGeneratedImageCenter(pendingFocusCenter)");
    expect(remember).toBeGreaterThan(-1);
    expect(focus).toBeGreaterThan(-1);
    expect(remember).toBeLessThan(focus);
  });

  it("回弹调用必须落在 setNodes updater 外面 —— 放在里面会被严格模式跑两次", () => {
    const { stripped } = readSource(canvasPath);

    /**
     * setNodes 的 updater 是纯函数的那一句 contract，靠缩进能直接验：
     * updater 内部的行（撤框那句）比分支体深一层，而回弹必须回到分支体这一层。
     * 缩进用「前导空白长度」量 —— 这个文件里 tab 和空格混着用，数字符会算错。
     */
    const branch = depthOf(stripped, "const blockedByCredits = isAiCreditBlockedMessage");
    const restore = depthOf(stripped, "if (shouldRestoreViewport) {");
    const prune = depthOf(stripped, "removeGenerationPlaceholders(nds, generationId)");

    expect(branch).not.toBeNull();
    expect(restore).not.toBeNull();
    expect(prune).not.toBeNull();

    // 撤框在 updater 内（更深），回弹与分支体同级（在 updater 外）。
    expect(prune!.depth).toBeGreaterThan(branch!.depth);
    expect(restore!.depth).toBe(branch!.depth);
  });

  it("只有真的撤到占位框才回弹 —— 原地复活的链路退不动视角", () => {
    const { stripped } = readSource(canvasPath);

    /**
     * 用中间的「标记 -> 分支 -> 外面的副作用」串起来看：
     * pruned 命中才置位，标记再驱动回弹。少了任何一环都会退化成
     * 「不管什么失败都把视角甩回去」（打断用户正在看的别处）。
     */
    expect(stripped).toMatch(
      /shouldRestoreViewport = true;[\s\S]{0,900}?\n\s*\}\);[\s\S]{0,200}?if \(shouldRestoreViewport\) \{[\s\S]{0,200}?restoreViewportBeforeGeneration\(generationId\)/
    );
  });

  it("正常出图会清掉快照，不留会话级泄漏", () => {
    const { stripped } = readSource(canvasPath);
    expect(stripped).toMatch(
      / forgetViewportBeforeGeneration\(generationId\)/
    );
    // 拍/弹/清三个函数必须成套出现，少一个清理就无限增长。
    expect(stripped).toContain("viewportBeforeGenerationRef");
  });
});
