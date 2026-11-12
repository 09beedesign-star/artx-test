/**
 * 电商画布模式切换 Tab 圆角统一测试
 *
 * 需求:外包围容器与选中项按钮的圆角必须统一,避免白色间隙漏出来
 *
 * 事实源:client/src/components/ecommerce/EcommerceWorkspace.tsx 第 267-277 行
 * - 外包围容器:line 268 `rounded-md`
 * - 选中项按钮:line 277 `rounded-md`(已统一)
 *
 * ⚠️ 圆角真实值不是 Tailwind 默认的 6px:
 *   client/src/index.css:838-846 的 @layer utilities 把
 *   .rounded-md/.rounded-lg/.rounded-xl/.rounded-2xl/.rounded-3xl
 *   全部强制成 var(--radius-md-design),:root(line 146) = 16px。
 *   只有 .artx-canvas-composer(line 1136-1144) 作用域内才覆盖成 6px,
 *   电商工作台不在该作用域,所以这里是 16px。
 *   而独立的 .rounded(4px)不在覆盖名单里 —— 这正是原来的 bug:
 *   容器 16px / 选中项 4px,差 12px,白色间隙就是这么漏出来的。
 *
 * 浏览器 A/B 实测(.tmp-probe/ab-tab-radius.py):
 *   修复前 rounded   → 容器 16px / 选中项 4px
 *   修复后 rounded-md → 容器 16px / 选中项 16px
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

  it("圆角值必须完全一致(都用 rounded-md,项目全局覆盖为 16px)", () => {
    const allClassnames = tabSlice.match(/className="[^"]+"/g) ?? [];
    const withRoundedMd = allClassnames.filter(c => /\brounded-md\b/.test(c));

    // 至少容器 + 按钮各有一处 rounded-md
    expect(withRoundedMd.length).toBeGreaterThanOrEqual(2);

    // 没有任何 className 里出现孤立的 rounded(不能是 rounded-xxx)
    const withBareRounded = allClassnames.filter(c => /(?<![a-z-])rounded(?!-[a-z])/.test(c));
    expect(withBareRounded).toHaveLength(0);
  });

  it("根因锁:index.css 的全局覆盖必须包含 rounded-md 且不含独立 rounded", () => {
    // 这条覆盖是「rounded-md 与 rounded 不等价」的原因。
    // 若有人把独立 .rounded 也加进覆盖名单,两者会变成同值,
    // 本测试的口径就得重新评估(而不是继续假定必须写成 rounded-md)。
    const cssPath = resolve(__dirname, "../../index.css");
    const css = readFileSync(cssPath, "utf-8");
    const layerStart = css.indexOf("@layer utilities");
    expect(layerStart).toBeGreaterThanOrEqual(0);
    const layer = css.slice(layerStart, layerStart + 400);
    expect(layer).toContain(".rounded-md");
    expect(layer).toContain("var(--radius-md-design)");
    expect(layer).not.toMatch(/(?<![a-z-])\.rounded\s*,/);
  });

  it("跨文件一致性:Tab 圆角口径与项目设计变量对齐", () => {
    // :root 的 --radius-md-design = 16px;电商工作台不在 .artx-canvas-composer 作用域
    const css = readFileSync(resolve(__dirname, "../../index.css"), "utf-8");
    expect(css).toMatch(/--radius-md-design:\s*16px/);
    expect(tabSlice).toContain("rounded-md");
  });
});
