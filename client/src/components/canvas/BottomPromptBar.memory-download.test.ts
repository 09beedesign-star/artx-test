/**
 * 画布底部提示词输入框记忆下载触发测试
 */
import { describe, it, expect } from "vitest";
import { detectMemoryDownloadIntent } from "@/lib/memory-export";

describe("BottomPromptBar 记忆下载触发", () => {
  it("handleSend 应在检测到意图时触发下载流程（不发送给 AI）", () => {
    // 实现逻辑已在 InfiniteCanvas.tsx::BottomPromptBar 内联
    // 此测试锁定意图检测规则
    expect(detectMemoryDownloadIntent("我要下载记忆的文档")).toBe(true);
    expect(detectMemoryDownloadIntent("导出当前项目记忆")).toBe(true);
    expect(detectMemoryDownloadIntent("帮我画一张关于记忆的海报")).toBe(false);
  });
});
