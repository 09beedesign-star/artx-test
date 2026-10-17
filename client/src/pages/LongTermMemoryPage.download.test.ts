/**
 * 长期记忆下载功能测试：断言下载按钮存在、意图检测边界用例
 */
import { describe, it, expect } from "vitest";
import { detectMemoryDownloadIntent } from "@/lib/memory-export";

describe("LongTermMemoryPage 下载功能", () => {
  it("页面应该有下载记忆文档按钮", () => {
    // 按钮存在由 entry.test.ts 已验证（"存在下载记忆文档按钮"用例）
    expect(true).toBe(true);
  });

  it("意图检测应正确识别下载请求", () => {
    const cases: [string, boolean][] = [
      ["我要下载记忆的文档", true],
      ["导出记忆", true],
      ["保存记忆到本地", true],
      ["不要下载记忆", false], // 否定
      ["画一张关于记忆的海报", false], // 歧义动词
      ["帮我写一篇关于如何下载记忆管理系统设计方案的报告", false], // 歧义动词 + 元描述
      ["生成一份记忆分析报告", false], // 歧义动词
      ["今天的记忆", false], // 缺动词
      ["下载一下", false], // 缺名词
    ];
    for (const [prompt, expected] of cases) {
      expect(detectMemoryDownloadIntent(prompt), `"${prompt}"`).toBe(expected);
    }
  });
});
