/**
 * 「上下文记忆」开关的显示口径（2026-11-10 用户四条要求的前三条）。
 *
 * 用户原话：
 *   1. 这个切换开关样式有偏移
 *   2. 把上下文记忆的切换开关的文字去掉，只保留图标，这样布局就不会动态伸缩
 *   3. 开关激活状态样式改为黑底色，白色 icon，开关切换的底色变为绿色
 *
 * 【第 1 条的真实成因】Switch 的 thumb 尺寸与位移是写死在 switch.tsx 里的
 * （16px / translate-x-4），调用方却用 `className="h-[14px] w-[26px]"` 只压了轨道：
 * 轨道内高 10px、thumb 还是 16px → thumb 顶出去 6px，看起来整体偏右偏上。
 * 📌 轨道 / thumb / 位移是一组数，只改一个必然错位，而且零报错。
 *
 * ⚠️ 全是源码断言，必须配合变异自证（见文末注释里的变异清单）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const canvasSource = readFileSync(join(__dirname, "InfiniteCanvas.tsx"), "utf8");
const switchSource = readFileSync(join(__dirname, "../ui/switch.tsx"), "utf8");

/** 开关药丸这一块：从注释锚点切到 contextLabel 分支之前 */
const pill = (() => {
  const start = canvasSource.indexOf("上下文记忆开关 —— 输入框右上角");
  const end = canvasSource.indexOf("{contextLabel && (", start);
  return start === -1 || end === -1 ? "" : canvasSource.slice(start, end);
})();

describe("布局不随 hover 伸缩", () => {
  it("药丸切片有效", () => {
    expect(pill.length, "切片为空 —— 下面每条都会恒真").toBeGreaterThan(600);
  });

  it("不再渲染「上下文记忆」这行文字", () => {
    /*
     * 之前文案是 `hover || 开启` 才出现：鼠标一进来药丸就变宽，
     * 把右侧开关整体顶偏 —— 用户说的「布局动态伸缩」就是这个。
     */
    expect(pill, "药丸里还有文字节点").not.toMatch(/上下文记忆\s*<\/span>/);
    expect(pill, "还留着 hover 态文案的老状态").not.toContain("memoryContextHovered");
  });

  it("语义没跟着文字一起删：aria-label 仍然说明这是上下文记忆", () => {
    expect(pill).toContain('aria-label="上下文记忆开关"');
  });
});

describe("激活态：黑底 + 白色图标，轨道变绿", () => {
  it("开启时药丸底色是黑，图标是白", () => {
    expect(pill).toContain('memoryContextEnabled\n                    ? "#161616"');
    expect(pill).toContain('memoryContextEnabled ? "#ffffff" : sub');
    // 反向：旧的荧光绿强调色不能回来
    expect(pill, "还在用荧光绿药丸").not.toContain("rgba(197,237,71,0.16)");
  });

  it("开关走 size=sm + tone=lime，而不是在外面压轨道宽度", () => {
    expect(pill).toContain('size="sm"');
    expect(pill).toContain('tone="lime"');
    // 这就是第 1 条 bug 的源头写法，必须消失
    expect(pill, "还在用 className 压轨道 —— thumb 会顶出轨道").not.toContain(
      'className="h-[14px] w-[26px]"'
    );
  });
});

describe("Switch 自身的尺寸组不能拆开", () => {
  it("sm 档的轨道 / thumb / 位移是成组的", () => {
    const sm = switchSource.slice(switchSource.indexOf("sm: {"));
    expect(sm, "sm 轨道尺寸丢了").toContain('root: "h-4 w-7 p-[2px]"');
    expect(sm, "sm thumb 尺寸丢了").toContain("thumb: \"size-3 data-[state=checked]:translate-x-3\"");
    /*
     * 26 - 2×2(padding) - 12(thumb) = 10 … 这里按 28 宽算：
     * 28 - 4 - 12 = 12 → 位移必须是 12（translate-x-3）。
     * 写成 translate-x-4 会顶出右边界 4px，正好是"偏移"的另一种表现。
     */
    expect(sm, "sm 位移与轨道对不上").not.toContain("translate-x-4");
  });

  it("lime 档在深色模式也保持绿色（否则会被 dark:bg-white 顶掉）", () => {
    expect(switchSource).toContain(
      'lime: "data-[state=checked]:bg-[#C5ED47] dark:data-[state=checked]:bg-[#C5ED47]"'
    );
  });
});

/*
 * 变异清单（每条都应让本文件报红，已实测）：
 * - 把文字 span 加回去                      → 「不再渲染文字」报红
 * - 药丸底色改回 rgba(197,237,71,0.16)      → 「开启时药丸底色是黑」报红
 * - Switch 改回 className="h-[14px] w-[26px]" → 「走 size=sm」报红
 * - switch.tsx 的 sm 位移改回 translate-x-4  → 「sm 位移与轨道对不上」报红
 * - 删掉 lime 的 dark: 那一段               → 「深色模式也保持绿色」报红
 */
