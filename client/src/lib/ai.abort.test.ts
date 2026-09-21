import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AI_ABORTED_ERROR_MESSAGE,
  createAiAbortError,
  isAiAbortError,
} from "./ai";

/**
 * 需求：点「停止」生成图片时，不应弹出
 * 「AI 助手请求失败 / task not found」。
 *
 * 根因链（2026-09-15）：
 *   停止按钮只做 setIsSubmitting(false) → 后台轮询没被掐断
 *   → 服务端 backgroundImageTasks 是内存 Map，会被 prune 清理
 *   → 下一次轮询拿到 404 "Image task not found"
 *   → 该错误不在 isTransientBackgroundTaskPollingError 放行名单里
 *   → 被当致命错误抛出 → 冒泡进 catch → toast 报「失败」。
 *
 * 📌 用户点的是「停止」，看到的却是「失败」，这是误报。
 *
 * 修复有两个必要条件，缺一不可：
 *   A. 中止要能真正掐断轮询（每条会轮询的出口都得接 signal）；
 *   B. 中止导致的错误必须被识别出来，不进 toast。
 */
const here = dirname(fileURLToPath(import.meta.url));
const aiSource = readFileSync(resolve(here, "ai.ts"), "utf8");
const canvasSource = readFileSync(
  resolve(here, "../components/canvas/InfiniteCanvas.tsx"),
  "utf8"
);

describe("中止哨兵本身", () => {
  it("识别我们自己抛的哨兵错误", () => {
    expect(isAiAbortError(createAiAbortError())).toBe(true);
  });

  it("识别浏览器 fetch 原生的 AbortError", () => {
    // fetch 被 abort 时抛的是 name === "AbortError" 的 DOMException，
    // message 完全不同。只按 message 匹配会漏掉这条最常见的路径。
    const nativeAbort = new Error("The operation was aborted.");
    nativeAbort.name = "AbortError";
    expect(isAiAbortError(nativeAbort)).toBe(true);
  });

  it("不把真实失败误判成中止", () => {
    // 这是反向锚点：如果判据写得太宽，真故障会被静默吞掉，
    // 用户点了生成却什么提示都没有 —— 比误报更糟。
    expect(isAiAbortError(new Error("Image task not found"))).toBe(false);
    expect(isAiAbortError(new Error("图像生成失败"))).toBe(false);
    expect(isAiAbortError(null)).toBe(false);
    expect(isAiAbortError(undefined)).toBe(false);
  });

  it("哨兵常量不会与真实错误文案撞车", () => {
    expect(AI_ABORTED_ERROR_MESSAGE).toMatch(/^__/);
  });
});

describe("A. 每条会轮询的出口都必须接上 signal", () => {
  it("waitForImageGenerationTask 接收 signal 并在每轮开头检查", () => {
    const start = aiSource.indexOf("export async function waitForImageGenerationTask");
    expect(start).toBeGreaterThan(-1);
    const body = aiSource.slice(start, start + 1600);

    expect(body, "缺少 signal 形参").toContain("signal?: AbortSignal");
    // 每轮开头检查：停止后不再发起下一次查询。
    expect(body, "轮询开头没有检查中止").toContain(
      "if (signal?.aborted) throw createAiAbortError();"
    );
    // 等待期间也要能被打断，否则最长卡 3 秒才响应停止。
    expect(body, "3 秒等待没有接 abort 监听").toContain(
      'signal?.addEventListener("abort"'
    );
  });

  it("⚠️ generateImages 这条出口不能漏 —— AI 助手面板实际走的是它", () => {
    // 这条断言是这个文件里最重要的一条。
    //
    // 修这个 bug 时第一反应是给 runImageGenerationTask 加 signal，
    // 但 AI 助手面板调的是 generateAiImages（即 generateImages），
    // 它内部**另有一次** waitForImageGenerationTask 调用。
    // 只接一条，停止照样弹错，而且零报错、无从察觉。
    const start = aiSource.indexOf("async function generateImages");
    expect(start).toBeGreaterThan(-1);
    const body = aiSource.slice(start, start + 2200);

    expect(body, "generateImages 没有接收 signal").toContain(
      "signal?: AbortSignal"
    );
    expect(body, "generateImages 内部的轮询没有透传 signal").toContain(
      "waitForImageGenerationTask(generationId, signal)"
    );
  });

  it("⚠️ 中止必须先于「后端连接错误」判定返回", () => {
    // generateImages 的 catch 里有一句
    // `if (!isAiBackendConnectionError(error)) throw error;`，
    // 它的本意是「连不上后端就回落到同步 orchestrate 再跑一次」。
    // 中止错误如果落进这个分支，就会**又跑一次生成** ——
    // 用户点了停止，结果反而多扣一次费。
    const start = aiSource.indexOf("async function generateImages");
    const body = aiSource.slice(start, start + 2200);
    const abortCheck = body.indexOf("if (isAiAbortError(error)) throw error;");
    const connectionCheck = body.indexOf("isAiBackendConnectionError(error)");
    expect(abortCheck, "catch 里没有中止判断").toBeGreaterThan(-1);
    expect(connectionCheck).toBeGreaterThan(-1);
    expect(
      abortCheck,
      "中止判断必须写在连接错误判定之前，否则停止会触发重跑"
    ).toBeLessThan(connectionCheck);
  });

  it("runImageGenerationTask 也要透传 signal", () => {
    const start = aiSource.indexOf("export async function runImageGenerationTask");
    const body = aiSource.slice(start, start + 400);
    expect(body).toContain("signal?: AbortSignal");
    expect(body).toContain("waitForImageGenerationTask(input.taskId, signal)");
  });
});

describe("B. 组件侧：停止要真掐断，且中止不进 toast", () => {
  it("停止按钮必须调用 stopAssistantSubmission，而不是只改 isSubmitting", () => {
    expect(canvasSource, "缺少中止句柄").toContain("assistantAbortRef");
    expect(canvasSource, "缺少停止处理函数").toContain(
      "const stopAssistantSubmission"
    );
    // 反向断言：旧实现 `onClick={() => setIsSubmitting(false)}` 必须消失。
    // 它是整个 bug 的起点 —— 看着停了，其实轮询还在跑。
    expect(
      canvasSource,
      "停止按钮仍是只改 isSubmitting 的旧实现，轮询不会被掐断"
    ).not.toContain("onClick={() => setIsSubmitting(false)}");
  });

  it("提交时把 signal 传给生成调用，且不能塞进会被持久化的 payload", () => {
    const signalUsages =
      canvasSource.match(/generateAiImages\(\{\s*\.\.\.payload,\s*signal:/g) || [];
    expect(
      signalUsages.length,
      "两条生成分支（技能 / 引用编辑）都必须传 signal"
    ).toBe(2);

    // AbortSignal 不可序列化。塞进 payload 会跟着任务一起被写进
    // localStorage / 任务记录，轻则报错重则把整条记录写坏。
    expect(canvasSource).not.toContain("payload.signal");
  });

  it("catch 里中止必须静默返回，不弹「AI 助手请求失败」", () => {
    const abortGuards =
      canvasSource.match(/if \(isAiAbortError\(error\)\) return;/g) || [];
    expect(
      abortGuards.length,
      "handleSubmit 与 runAssistantCapability 两处 catch 都要挡住中止"
    ).toBeGreaterThanOrEqual(2);

    // 正向锚点：真实失败仍然要报，别把提示整个删掉。
    expect(canvasSource, "真实失败必须仍然有提示").toContain(
      '"AI 助手请求失败"'
    );
  });

  it("finally 只能清理「本轮」的状态", () => {
    // 用户可能已经发起了新一轮提交。旧一轮的 finally 若无条件
    // setIsSubmitting(false)，会把新一轮的 loading 态吃掉 ——
    // 界面看着空闲，其实正在生成。
    expect(canvasSource).toContain(
      "if (assistantAbortRef.current === submissionAbortController)"
    );
  });
});
