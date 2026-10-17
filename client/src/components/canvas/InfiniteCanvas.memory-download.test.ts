/**
 * 画布输入框检测「我要下载记忆文档」意图，弹原生路径选择器。
 */
import { describe, expect, it } from "vitest";
import { detectMemoryDownloadIntent } from "@/lib/memory-export";

describe("画布提示词 → 记忆文档下载意图", () => {
  it("长提示词（创作指令）不拦截", () => {
    expect(detectMemoryDownloadIntent("帮我写一篇关于如何下载记忆管理系统设计方案的报告")).toBe(false);
    expect(detectMemoryDownloadIntent("下载记忆".repeat(30))).toBe(false); // > 60 字
  });

  it("否定句不拦截", () => {
    expect(detectMemoryDownloadIntent("不要下载记忆")).toBe(false);
    expect(detectMemoryDownloadIntent("别下载记忆文档")).toBe(false);
    expect(detectMemoryDownloadIntent("无需导出记忆")).toBe(false);
  });

  it("命中「动词 + 记忆」立即拦截", () => {
    const prompts = [
      "下载记忆",
      "我要下载记忆的文档",
      "下载记忆文档",
      "导出记忆",
      "保存到本地记忆",
      "存到本地 memory",
      "export memory",
      "download记忆",
    ];
    prompts.forEach(p => expect(detectMemoryDownloadIntent(p), p).toBe(true));
  });

  it("画布 InfiniteCanvas.tsx 调用了意图检测", () => {
    const canvas = require("fs").readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf-8");
    expect(canvas).toContain("detectMemoryDownloadIntent");
    expect(canvas).toContain("saveMarkdownWithPicker");
    expect(canvas).toContain("不发给 AI");
  });
});
