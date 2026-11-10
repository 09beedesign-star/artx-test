/**
 * 电商画布「记忆提示条」改黑底白字回归（2026-11-10）。
 *
 * 用户原话：把这个样式改成与画布提示词输入框中上下文记忆的样式一样，
 *          文字用白色文字。
 *
 * 旧样式：浅绿底 + 绿描边 + 荧光绿文字 + default 黑轨开关。
 * 新样式：与画布一致的黑药丸 + 白 Brain + 白文字 + sm/lime 小开关。
 *
 * 三层守：
 *   1. 配色事实源是纯常量 → 直接断言色值，并用 WCAG 亮度差量化「白字看得清」；
 *   2. 组件确实接上了事实源 → 剥注释 + 切片后的源码断言（含反向断言）；
 *   3. 画布参照物与事实源不跑偏 → 从 InfiniteCanvas 药丸切片反查色值与尺寸档。
 *      ⚠️ 画布侧目前仍是字面量，没有 import 这个 token；这条跨文件锁就是
 *         「两个出口」的护栏：哪天画布换了色，测试先红，提醒两边一起改。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  stripSourceComments,
  assertStripKeptSource,
} from "@shared/strip-source-comments";
import {
  MEMORY_SWITCH_SURFACE,
  MEMORY_SWITCH_SIZE,
  MEMORY_SWITCH_TONE,
} from "@/lib/memory-switch-tokens";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function raw(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

function code(rel: string, maxLossRatio = 0.3): string {
  const src = raw(rel);
  const stripped = stripSourceComments(src);
  assertStripKeptSource(src, stripped, maxLossRatio);
  return stripped;
}

/** sRGB 相对亮度（0=纯黑，1=纯白），只吃 #rrggbb */
function luminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`无法解析颜色：${hex}`);
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const ecommerceFile = "client/src/components/ecommerce/EcommerceWorkspace.tsx";
const canvasFile = "client/src/components/canvas/InfiniteCanvas.tsx";

/** 电商提示条切片：从 testid 到开关之后的收尾 div */
const notice = (() => {
  const src = raw(ecommerceFile);
  const start = src.indexOf('data-testid="ecommerce-memory-notice"');
  const end = src.indexOf(
    "</div>",
    src.indexOf('data-testid="ecommerce-memory-switch"'),
  );
  return start === -1 || end === -1 ? "" : stripSourceComments(src.slice(start, end));
})();

/** 画布参照物切片：锚点在注释里，所以先用 raw 定位，再剥注释 */
const canvasPill = (() => {
  const src = raw(canvasFile);
  const start = src.indexOf("上下文记忆开关 —— 输入框右上角");
  const end = src.indexOf("{contextLabel && (", start);
  return start === -1 || end === -1 ? "" : stripSourceComments(src.slice(start, end));
})();

describe("检测器自检（切片空了下面会集体恒绿）", () => {
  it("电商提示条与画布药丸切片都有效", () => {
    expect(notice.length).toBeGreaterThan(400);
    expect(canvasPill.length).toBeGreaterThan(600);
  });
});

describe("配色事实源：黑底白字白图标", () => {
  it("底色接近纯黑，图标与文字是纯白", () => {
    expect(luminance(MEMORY_SWITCH_SURFACE.background)).toBeLessThan(0.02);
    expect(MEMORY_SWITCH_SURFACE.iconColor).toBe("#ffffff");
    expect(MEMORY_SWITCH_SURFACE.textColor).toBe("#ffffff");
  });

  it("白字/白图标压在黑底上对比度 ≥ 7（WCAG AAA）", () => {
    expect(contrast(MEMORY_SWITCH_SURFACE.background, MEMORY_SWITCH_SURFACE.textColor)).toBeGreaterThan(7);
    expect(contrast(MEMORY_SWITCH_SURFACE.background, MEMORY_SWITCH_SURFACE.iconColor)).toBeGreaterThan(7);
    // 旧的荧光绿描边/底色亮度远高于黑底，改回去会被上面两条抓红
    expect(luminance("#B2ED9A")).toBeGreaterThan(0.5);
  });

  it("尺寸与色调档与画布一致", () => {
    expect(MEMORY_SWITCH_SIZE).toBe("sm");
    expect(MEMORY_SWITCH_TONE).toBe("lime");
  });
});

describe("组件接线：提示条真的用了事实源", () => {
  it("import 了 token 模块", () => {
    expect(code(ecommerceFile)).toContain('from "@/lib/memory-switch-tokens"');
  });

  it("底色、描边、文字、图标四项都取自 token", () => {
    expect(notice).toContain("background: MEMORY_SWITCH_SURFACE.background");
    expect(notice).toContain("MEMORY_SWITCH_SURFACE.borderDark");
    expect(notice).toContain("MEMORY_SWITCH_SURFACE.borderLight");
    expect(notice).toContain("color: MEMORY_SWITCH_SURFACE.textColor");
    expect(notice).toContain("MEMORY_SWITCH_SURFACE.iconColor");
  });

  it("胶囊圆角与画布同源（--radius-pill）", () => {
    expect(notice).toContain("rounded-[var(--radius-pill)]");
  });

  it("旧的绿底 / 绿描边 / 绿字 / 状态切换底色全部退场", () => {
    expect(notice).not.toContain("brand-green-light");
    expect(notice).not.toContain("#B2ED9A");
    expect(notice).not.toContain("color: lime");
    expect(notice).not.toContain("color: palette.sub");
    expect(notice).not.toContain("border: `1px solid ${palette.border}`");
    // 底色恒黑：跟着状态切成浅底，白字会直接消失
    expect(notice).not.toMatch(/style=\{\s*memoryActive/);
  });

  it("开关走 sm/lime 常量，没有在调用方压轨道", () => {
    expect(notice).toContain("size={MEMORY_SWITCH_SIZE}");
    expect(notice).toContain("tone={MEMORY_SWITCH_TONE}");
    expect(notice).not.toMatch(/className="h-\[14px\] w-\[26px\]"/);
  });
});

describe("跨文件一致性：画布参照物没和事实源跑偏", () => {
  it("画布药丸的黑底 / 白图标与 token 同色", () => {
    expect(canvasPill).toContain(`? "${MEMORY_SWITCH_SURFACE.background}"`);
    expect(canvasPill).toContain(`? "${MEMORY_SWITCH_SURFACE.iconColor}" : sub`);
  });

  it("画布开关也是同一组 size / tone", () => {
    expect(canvasPill).toContain(`size="${MEMORY_SWITCH_SIZE}"`);
    expect(canvasPill).toContain(`tone="${MEMORY_SWITCH_TONE}"`);
  });

  it("switch.tsx 里 sm 与 lime 档还在（常量不是空指向）", () => {
    const sw = code("client/src/components/ui/switch.tsx");
    expect(sw).toContain('sm: { root: "h-4 w-7 p-[2px]"');
    expect(sw).toContain('lime: "data-[state=checked]:bg-[#C5ED47]');
  });
});
