import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const canvas = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");

/**
 * 🔒 2026-11-17 用户要求：常规对话 / 发起生成一律不弹 toast（太重）。
 * 进度由画布占位框 + 对话流承担；toast 只留给关键结果与报错。
 */
describe("常规对话不弹 toast", () => {
  const banned = [
    "正在生成图像",
    "正在再次生成",
    "AI 判断为生成图片",
    "AI 已回复",
    "AI 已找到参考图",
    "Skill 已开始生成",
    "AI 正在处理图片",
    "AI 正在局部重绘",
    "AI 正在智能优化",
    "注释 AI 修改中",
  ];
  for (const text of banned) {
    it(`不再出现过程类 toast：${text}`, () => {
      expect(canvas).not.toMatch(new RegExp(`toast(\\.\\w+)?\\([^)]*"${text}"`));
    });
  }

  it("就地重绘不弹 toast，但节点上的「AI 局部重绘中」进度文案保留", () => {
    expect(canvas).not.toContain('toast("AI 局部重绘中"');
    expect(canvas).toContain('processingTitle: "AI 局部重绘中"');
  });

  it("报错 toast 仍保留（关键结果 / 失败必须提示）", () => {
    expect(canvas).toContain('toast("图像生成失败"');
  });
});
