/**
 * 全站「发送 / 生成」按钮统一性检测器（2026-11-10 用户点名）。
 *
 * 需求原话：「全站内所有的发送或者生成按钮统一为这个样式」——参考图是
 * 黑色圆形 + 白色纸飞机描边。
 *
 * 【为什么用"扫全站"而不是逐个文件断言】
 * 这类按钮改版前有 7 份独立实现（紫色方钮 / 荧光绿方钮 / 黑方钮 / 渐变钮 /
 * 纯图标…）。逐个文件写断言，等于把"当时改过的那些"锁住，
 * 下一次有人在别的页面新写一个自制发送键，测试照样全绿。
 * 📌 只有"扫一遍全库、发现新的自制实现就报红"才是真的锁住"全站"。
 *
 * ⚠️ 扫全站必须防止「扫错范围 = 0 个文件 = 恒绿」：
 *    所以先断言扫到的文件数下限，再断言使用统一组件的文件数下限。
 *    📌 「没量到」和「没问题」的输出必须不一样。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(__dirname, "../..");

/** 允许保留裸 <Send> 的文件：它们不是"发送/生成"按钮，白名单必须写清理由 */
const ALLOWED_RAW_SEND: Record<string, string> = {
  // 反馈弹窗的「提交」是带文字的整宽按钮，不是图标发送键
  "components/layout/AppShell.tsx": "带文字的提交按钮，不属于发送/生成钮",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!entry.endsWith(".tsx")) continue;
    // 备份文件不参与编译，也不该被当成"线上实现"
    if (entry.endsWith(".backup")) continue;
    out.push(full);
  }
  return out;
}

const files = walk(SRC_ROOT).filter(file => !file.endsWith("send-action-button.tsx"));

describe("全站发送 / 生成按钮收口", () => {
  it("扫描范围有效（不是空集恒绿）", () => {
    expect(
      files.length,
      "扫到的 tsx 文件太少 —— 路径写错会让下面每条断言恒真"
    ).toBeGreaterThan(80);
  });

  it("没有任何文件还在自己写裸 <Send> 图标按钮", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(SRC_ROOT.length + 1);
      if (ALLOWED_RAW_SEND[rel]) continue;
      const source = readFileSync(file, "utf8");
      // 只认 JSX 里的图标标签，别把 import { Send } 也算进来
      if (/<Send[\s/>]/.test(source)) offenders.push(rel);
    }
    expect(
      offenders,
      `这些文件还在自己拼发送按钮，应该改用 @/components/ui/send-action-button：\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("首页、画布主输入框、悬浮输入框都已经换成统一组件", () => {
    const adopters = files.filter(file =>
      readFileSync(file, "utf8").includes("<SendActionButton")
    );
    /*
     * 现状是 4 个文件 / 8 个出口：
     *   首页提示词面板 1、画布 InfiniteCanvas 4（主输入框 / 悬浮框 / 图片节点 / 提示词卡）、
     *   对话节点 1（CanvasNodes）、电商画布 1（带「生成」文字的胶囊形态）。
     * 少了任何一个都说明有人把入口删掉或退回了自制实现。
     */
    expect(
      adopters.map(file => file.slice(SRC_ROOT.length + 1)).sort(),
      "使用统一组件的文件清单变了 —— 有入口漏掉或退回了自制实现"
    ).toEqual([
      "components/canvas/CanvasNodes.tsx",
      "components/canvas/InfiniteCanvas.tsx",
      "components/ecommerce/EcommerceWorkspace.tsx",
      "components/home/CenteredPromptPanel.tsx",
    ]);

    const usageCount = files.reduce(
      (sum, file) => sum + (readFileSync(file, "utf8").match(/<SendActionButton/g)?.length ?? 0),
      0
    );
    expect(usageCount, "统一按钮的出口数量变少了").toBeGreaterThanOrEqual(8);
  });
});

describe("统一按钮的视觉口径", () => {
  const source = readFileSync(join(__dirname, "send-action-button.tsx"), "utf8");

  it("黑底 + 白色图标 + 圆形", () => {
    expect(source).toContain('background: "#161616"');
    expect(source).toContain('color: "#ffffff"');
    expect(source).toContain("rounded-full");
  });

  it("图标尺寸跟着直径走，不是写死一个数", () => {
    // 写死 iconSize 的话，大按钮里会是个小得发空的小图标
    expect(source).toContain("iconSize ?? Math.max(11, Math.round(size * 0.46))");
  });
});
