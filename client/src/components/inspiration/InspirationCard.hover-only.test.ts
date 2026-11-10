import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments } from "../../../../shared/strip-source-comments";

/**
 * 灵感模板卡：右上角「一键同款」只在 hover 时出现；卡片中间不再有任何按钮。
 *
 * 【为什么要有这条】2026-11-10 用户明确要求：
 *   1. 右上角的「一键同款」**不要一直显示**，鼠标移上去才出现；
 *   2. hover 时中间那两枚胶囊（一键同款 / 复制提示词）**不要** —— 与右上角入口重复。
 *
 * ⚠️ 两条要求都是「少一个东西」，而少东西的回归是**零报错**的：
 *    将来谁把 opacity 写回常驻、或者在 hover 层里补回按钮，页面照样能跑，
 *    只有肉眼能发现。所以这里两个方向都要锁：
 *    · 正向：hover 才可见 + 隐藏时连点击一起关掉；
 *    · 反向：不允许回到 `opacity: hovered ? 0 : 1` 那种常驻写法。
 */

/*
  ⚠️ 断言文案是否存在时必须先剥注释：本次改动正好在文件头注释里写了
     「复制提示词的入口在详情弹窗里」，不剥就会把解释当成实现来判。
*/
const cardSource = stripSourceComments(readFileSync(resolve(__dirname, "InspirationCard.tsx"), "utf-8"));
const pageSource = stripSourceComments(
  readFileSync(resolve(__dirname, "../../pages/InspirationPage.tsx"), "utf-8")
);

describe("一键同款胶囊：仅 hover 出现", () => {
  it("默认不可见且不接收点击，hover 才淡入", () => {
    expect(cardSource).toContain("opacity: hovered ? 1 : 0");
    expect(cardSource).toContain('pointerEvents: hovered ? "auto" : "none"');
    // 隐藏态不可聚焦，否则 Tab 会停在看不见的按钮上（悬空焦点）。
    expect(cardSource).toContain("tabIndex={hovered ? 0 : -1}");
    // 反向：常驻写法（原来是 hover 时反而淡出）必须消失。
    expect(cardSource).not.toContain("opacity: hovered ? 0 : 1");
  });

  it("hover 层只剩压暗，不再渲染居中按钮", () => {
    // 居中两枚胶囊的文案必须从卡片里消失（复制入口留在详情弹窗内）。
    expect(cardSource).not.toContain("复制提示词");
    expect(cardSource).not.toContain("actions={[");
    // 没有按钮的压暗层仍然要在：否则卡片 hover 只剩图片微放大，看不出被选中。
    expect(cardSource).toContain("<CardHoverOverlay visible={hovered} dim={0.18} />");
  });

  it("编辑精选轮播与网格卡保持同一套行为", () => {
    // 轮播卡是页面里手写的一份（不是共享组件），最容易漏改。
    expect(pageSource).toContain('aria-label="一键同款"');
    expect(pageSource).not.toContain('label: "复制提示词"');
    expect(pageSource).not.toContain('label: "一键同款"');
    // 详情弹窗里的复制按钮仍在（不是被误删光的恒绿）
    expect(pageSource).toContain('aria-label="复制提示词"');
  });
});
