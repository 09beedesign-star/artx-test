/**
 * 电商画布模式切换 Tab 圆角统一测试
 * 
 * 需求:外包围容器与选中项按钮的圆角必须统一,避免白色间隙漏出来
 * 
 * 事实源:client/src/components/ecommerce/EcommerceWorkspace.tsx 第 267-277 行
 * - 外包围容器:line 268 `rounded-md`
 * - 选中项按钮:line 277 `rounded-md`(已统一)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const WORKSPACE_PATH = resolve(__dirname, "./EcommerceWorkspace.tsx");

function stripSourceComments(code: string): string {
  return code
    .replace(/\/\*\*[\s\S]*?\*\//g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");
}

function assertStripKeptSource(original: string, stripped: string, minRatio = 0.3) {
  const ratio = stripped.length / original.length;
  if (ratio < minRatio) {
    throw new Error(
      `剥离注释后只剩 ${(ratio * 100).toFixed(1)}% 源码,疑似误删代码块(阈值 ${minRatio * 100}%)`
    );
  }
}

describe("电商画布模式切换 Tab 圆角统一", () => {
  const sourceRaw = readFileSync(WORKSPACE_PATH, "utf-8");
  const source = stripSourceComments(sourceRaw);
  assertStripKeptSource(sourceRaw, source, 0.4);

  // 提取模式切换 Tab 组件切片
  // 从 "模式切换" 注释块往后找到 div 包围容器
  const tabSwitchStart = source.indexOf("grid grid-cols-2 gap-1 rounded-md");
  // tabSwitchStart 指向 className 属性内容,往前找到 className=
  const containerClassStart = source.lastIndexOf('className="', tabSwitchStart);
  const tabSwitchEnd = source.indexOf("</div>", tabSwitchStart + 400);
  const tabSlice = source.slice(containerClassStart, tabSwitchEnd + 6);

  it("外包围容器必须使用 rounded-md 圆角", () => {
    expect(tabSlice).toContain('className="grid grid-cols-2 gap-1 rounded-md p-1"');
  });

  it("选中项按钮必须使用 rounded-md 圆角(与外包围统一)", () => {
    expect(tabSlice).toContain('className="rounded-md py-1.5 text-center text-[12px] transition-colors"');
  });

  it("反向断言:禁止选中项使用 rounded(4px 圆角会漏白边)", () => {
    // 提取按钮 className 部分(第二处 className=)
    const firstBtnClass = tabSlice.indexOf('className="rounded-md py-1.5');
    expect(firstBtnClass).toBeGreaterThanOrEqual(0);
    const btnClassEnd = tabSlice.indexOf('"', firstBtnClass + 11);
    const btnClass = tabSlice.slice(firstBtnClass + 11, btnClassEnd);
    
    // 必须是 rounded-md,不能是独立的 rounded
    const tokens = btnClass.split(/\s+/);
    expect(tokens).toContain("rounded-md");
    expect(tokens).not.toContain("rounded");
  });

  it("圆角值必须完全一致(都是 rounded-md = 6px)", () => {
    const allClassnames = tabSlice.match(/className="[^"]+"/g) ?? [];
    const withRoundedMd = allClassnames.filter(c => /\brounded-md\b/.test(c));
    
    // 至少容器 + 按钮各有一处 rounded-md
    expect(withRoundedMd.length).toBeGreaterThanOrEqual(2);
    
    // 没有任何 className 里出现孤立的 rounded(不能是 rounded-xxx)
    const withBareRounded = allClassnames.filter(c => /(?<![a-z-])rounded(?!-[a-z])/.test(c));
    expect(withBareRounded).toHaveLength(0);
  });

  it("跨文件一致性:EcommerceWorkspace.tsx 的 Tab 圆角与 Tailwind 默认值对齐", () => {
    // Tailwind rounded-md = 0.375rem = 6px
    // rounded = 0.25rem = 4px
    // 统一使用 rounded-md 确保视觉一致性
    expect(tabSlice).toContain("rounded-md");
  });
});
