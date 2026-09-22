/*
 * 局部重绘画幅锁的测试。
 *
 * 本文件头部刻意使用块注释说明背景：源码扫描类断言会连注释一起扫，
 * 把理由写在被扫文件的正文里会污染断言（详见 REF-testing.md「注释污染」）。
 *
 * 守的两件事：
 *   1. 纯函数 resolveEditAspectLock 的裁决优先级正确；
 *   2. ⚠️⚠️ 它**真的被接到了**每一个局部重绘出口上 —— 测纯函数 ≠ 测修复，
 *      本项目已因「函数对了但没接上」踩过多次坑。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_EDIT_LOCK_LONG_SIDE,
  MIN_EDIT_LOCK_LONG_SIDE,
  clampToMaxLongSide,
  parseExplicitRatioFromPrompt,
  parseRatioToDimensions,
  resolveEditAspectLock,
  scaleToMinLongSide,
} from "../shared/edit-aspect-lock";
import { SUPPORTED_IMAGE_RATIOS } from "../shared/image-ratios";

const CANVAS_PATH = path.resolve(
  __dirname,
  "../client/src/components/canvas/InfiniteCanvas.tsx"
);

const IMAGE_GENERATION_PATH = path.resolve(__dirname, "./image-generation.ts");

/** 只剥「整行都是块注释」的行，避免贪婪正则吃掉真实代码。 */
function stripLineComments(source: string) {
  return source
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("局部重绘默认锁定原图比例", () => {
  it("没有任何显式指定时，锁底图的真实宽高比", () => {
    const lock = resolveEditAspectLock({
      sourceWidth: 1200,
      sourceHeight: 1600,
    });
    expect(lock.source).toBe("source-image");
    expect(lock.ratio).toBe("3:4");
    // 原样沿用：不是「比例对就行」，是逐像素相等
    expect(lock.width).toBe(1200);
    expect(lock.height).toBe(1600);
  });

  it("⚠️ 竖图绝不会被悄悄变成方图（本次 bug 的直接症状）", () => {
    const lock = resolveEditAspectLock({
      sourceWidth: 1024,
      sourceHeight: 1536,
    });
    expect(lock.ratio).not.toBe("1:1");
    expect(lock.width).not.toBe(lock.height);
    expect(lock.height).toBeGreaterThan(lock.width);
  });

  it("⚠️ 也不会被拉成 9:16（DEFAULT_AUTO_RATIO 不该管到重绘）", () => {
    // 3:4 = 0.75，9:16 = 0.5625，若被 9:16 盖住会明显变形
    const lock = resolveEditAspectLock({
      sourceWidth: 1500,
      sourceHeight: 2000,
    });
    expect(lock.ratio).toBe("3:4");
    expect(lock.width / lock.height).toBeCloseTo(0.75, 10);
    expect(lock.width / lock.height).not.toBeCloseTo(0.5625, 2);
  });

  it("提示词里显式写比例时优先级最高", () => {
    const lock = resolveEditAspectLock({
      sourceWidth: 1200,
      sourceHeight: 1600,
      prompt: "把裤子改成红色，输出 16:9",
    });
    expect(lock.source).toBe("prompt");
    expect(lock.ratio).toBe("16:9");
    expect(lock.width / lock.height).toBeCloseTo(16 / 9, 10);
  });

  it("比例选择器选了非 auto 时覆盖原图比例", () => {
    const lock = resolveEditAspectLock({
      sourceWidth: 1200,
      sourceHeight: 1600,
      selectedRatio: "4:5",
    });
    expect(lock.source).toBe("selector");
    expect(lock.ratio).toBe("4:5");
  });

  it("选择器是 auto 时不参与裁决，仍锁原图", () => {
    for (const value of ["auto", "AUTO", "  auto  ", "", null, undefined]) {
      const lock = resolveEditAspectLock({
        sourceWidth: 800,
        sourceHeight: 600,
        selectedRatio: value,
      });
      expect(lock.source).toBe("source-image");
      expect(lock.ratio).toBe("4:3");
    }
  });

  it("提示词优先于选择器（同时存在时）", () => {
    const lock = resolveEditAspectLock({
      sourceWidth: 1200,
      sourceHeight: 1600,
      prompt: "改成 21:9 的宽幅",
      selectedRatio: "4:5",
    });
    expect(lock.source).toBe("prompt");
    expect(lock.ratio).toBe("21:9");
  });

  it("拿不到底图尺寸才回落 1:1", () => {
    for (const [w, h] of [
      [0, 0],
      [undefined, undefined],
      [null, null],
      [NaN, NaN],
      [-100, 200],
    ] as Array<[unknown, unknown]>) {
      const lock = resolveEditAspectLock({
        sourceWidth: w as number,
        sourceHeight: h as number,
      });
      expect(lock.source).toBe("fallback");
      expect(lock.ratio).toBe("1:1");
    }
  });
});

describe("⚠️⚠️⚠️ auto + 引用图时逐像素沿用原图尺寸（锁比例 ≠ 锁尺寸）", () => {
  it("小图不被放大到 1536（本轮 bug 的直接症状）", () => {
    const lock = resolveEditAspectLock({
      sourceWidth: 900,
      sourceHeight: 1200,
    });
    // 旧实现会返回 1152×1536：内容对、比例对、尺寸被悄悄改了
    expect(lock.width).toBe(900);
    expect(lock.height).toBe(1200);
    expect(lock.preserveSourcePixels).toBe(true);
  });

  it("各种奇怪尺寸都逐像素沿用", () => {
    for (const [w, h] of [
      [1237, 1653],
      [640, 480],
      [1920, 1080],
      [333, 333],
      [2048, 1024],
    ]) {
      const lock = resolveEditAspectLock({ sourceWidth: w, sourceHeight: h });
      expect(lock.width).toBe(w);
      expect(lock.height).toBe(h);
      expect(lock.preserveSourcePixels).toBe(true);
    }
  });

  it("⚠️ 超过上限才等比缩小，且只缩不变形", () => {
    const lock = resolveEditAspectLock({
      sourceWidth: 12000,
      sourceHeight: 9000,
    });
    expect(Math.max(lock.width, lock.height)).toBe(MAX_EDIT_LOCK_LONG_SIDE);
    expect(lock.width / lock.height).toBeCloseTo(12000 / 9000, 6);
    // 仍算「保持原图」——只是被安全上限截断，没有被换成别的画幅
    expect(lock.preserveSourcePixels).toBe(true);
  });

  it("clampToMaxLongSide 只缩不放", () => {
    expect(clampToMaxLongSide(600, 800)).toEqual({ width: 600, height: 800 });
    expect(clampToMaxLongSide(1, 1)).toEqual({ width: 1, height: 1 });
    const shrunk = clampToMaxLongSide(16384, 8192);
    expect(shrunk.width).toBe(MAX_EDIT_LOCK_LONG_SIDE);
    expect(shrunk.height).toBe(MAX_EDIT_LOCK_LONG_SIDE / 2);
  });

  it("⚠️ 用户主动指定画幅时不保持原图尺寸，仍走 1536 基准", () => {
    const byPrompt = resolveEditAspectLock({
      sourceWidth: 900,
      sourceHeight: 1200,
      prompt: "输出 16:9",
    });
    expect(byPrompt.preserveSourcePixels).toBe(false);
    expect(Math.max(byPrompt.width, byPrompt.height)).toBe(
      MIN_EDIT_LOCK_LONG_SIDE
    );

    const bySelector = resolveEditAspectLock({
      sourceWidth: 900,
      sourceHeight: 1200,
      selectedRatio: "4:5",
    });
    expect(bySelector.preserveSourcePixels).toBe(false);
    expect(Math.max(bySelector.width, bySelector.height)).toBe(
      MIN_EDIT_LOCK_LONG_SIDE
    );

    const fallback = resolveEditAspectLock({});
    expect(fallback.preserveSourcePixels).toBe(false);
  });

  it("⚠️⚠️ 锁原图时产出的 ratio 必须落在白名单内（否则被静默兜底成 9:16）", () => {
    // 曾经用最大公约数约简，1237×1653 会算出白名单外的 "1237:1653"，
    // resolveImageRatio 对白名单外的值静默回落 —— 锁原图当场变成改画幅。
    const whitelist = new Set<string>(SUPPORTED_IMAGE_RATIOS);
    for (const [w, h] of [
      [1237, 1653],
      [1001, 997],
      [3000, 1000],
      [777, 1000],
      [1080, 1920],
    ]) {
      const lock = resolveEditAspectLock({ sourceWidth: w, sourceHeight: h });
      expect(whitelist.has(lock.ratio)).toBe(true);
    }
  });

  it("吸附到的是**最接近**的白名单比例，不是随便挑一个", () => {
    expect(
      resolveEditAspectLock({ sourceWidth: 1080, sourceHeight: 1920 }).ratio
    ).toBe("9:16");
    expect(
      resolveEditAspectLock({ sourceWidth: 1920, sourceHeight: 1080 }).ratio
    ).toBe("16:9");
    expect(
      resolveEditAspectLock({ sourceWidth: 1000, sourceHeight: 1000 }).ratio
    ).toBe("1:1");
    expect(
      resolveEditAspectLock({ sourceWidth: 1237, sourceHeight: 1653 }).ratio
    ).toBe("3:4");
  });
});

describe("提示词比例解析不会误伤普通数字", () => {
  it("识别常见写法", () => {
    expect(parseExplicitRatioFromPrompt("输出 16:9")).toBe("16:9");
    expect(parseExplicitRatioFromPrompt("改成 4：5 竖版")).toBe("4:5");
    expect(parseExplicitRatioFromPrompt("9 : 16")).toBe("9:16");
  });

  it("⚠️ 不把时间、比分、超大数字当画幅比", () => {
    // 时间 —— 分钟数超过 32 的上限
    expect(parseExplicitRatioFromPrompt("下午 3:45 之前交付")).toBeUndefined();
    // 超出合理画幅范围
    expect(parseExplicitRatioFromPrompt("比例 99:1")).toBeUndefined();
    // 没有比例时不误报
    expect(parseExplicitRatioFromPrompt("把裤子改成红色")).toBeUndefined();
    expect(parseExplicitRatioFromPrompt("")).toBeUndefined();
    expect(parseExplicitRatioFromPrompt(null)).toBeUndefined();
  });

  it("⚠️ 刻意不把「竖版/横版」当作画幅指令", () => {
    // 用户说"竖版"时意思是"别给我变横"，锁原图已经满足；
    // 若在这里把它解析成 9:16，反而会把 3:4 的原图改形。
    expect(parseExplicitRatioFromPrompt("竖版输出")).toBeUndefined();
    expect(parseExplicitRatioFromPrompt("横版")).toBeUndefined();
  });
});

describe("等比放大不制造变形", () => {
  it("宽高乘同一系数，比例严格守恒", () => {
    const scaled = scaleToMinLongSide(600, 800);
    expect(scaled.height).toBe(MIN_EDIT_LOCK_LONG_SIDE);
    expect(scaled.width / scaled.height).toBeCloseTo(600 / 800, 6);
  });

  it("长边已够大时不动", () => {
    const scaled = scaleToMinLongSide(3000, 2000);
    expect(scaled).toEqual({ width: 3000, height: 2000 });
  });

  it("parseRatioToDimensions 拒绝非法值", () => {
    expect(parseRatioToDimensions("16:9")).toEqual({ width: 16, height: 9 });
    expect(parseRatioToDimensions("abc")).toBeUndefined();
    expect(parseRatioToDimensions("0:5")).toBeUndefined();
    expect(parseRatioToDimensions(undefined)).toBeUndefined();
  });
});

describe("⚠️⚠️ 画幅锁真的被接到了每个重绘出口（测纯函数 ≠ 测修复）", () => {
  const raw = readFileSync(CANVAS_PATH, "utf8");
  const source = stripLineComments(raw);

  it("剥注释确实生效（自证，防止断言守着一份残缺源码）", () => {
    expect(raw.length).toBeGreaterThan(source.length);
  });

  it("已引入 resolveEditAspectLock", () => {
    expect(source).toContain("resolveEditAspectLock");
    expect(source).toContain('from "@shared/edit-aspect-lock"');
  });

  it("⚠️ 反向断言：重绘分支不再出现写死的 ratio: \"1:1\"", () => {
    // 这正是本次 bug 的原始写法，必须彻底消失
    expect(source).not.toMatch(
      /ratio:\s*shouldEditTargetReference\s*\?\s*["']1:1["']/
    );
  });

  it("⚠️ 反向断言：重绘的 targetWidth 不再取画布显示尺寸", () => {
    // targetReference.width 是被 minNodeSide 钳制过的显示尺寸，
    // 用它当目标画幅正是比例被污染的源头。
    expect(source).not.toMatch(/targetWidth:\s*targetReference\.width/);
    expect(source).not.toMatch(/targetHeight:\s*targetReference\.height/);
  });

  it("两个重绘出口都用画幅锁的宽高", () => {
    const widthAssignments = source.match(/targetWidth:\s*[^,\n]+/g) || [];
    const editLockAssignments = widthAssignments.filter(line =>
      /AspectLock\.width/.test(line)
    );
    /*
     * 6 个出口 = 3 条重绘路径 × 2（backgroundTaskInput + 真实调用）：
     *   ① 右侧助手无技能分支  referenceEditAspectLock
     *   ② 右侧助手技能分支    skillEditAspectLock
     *   ③ 底部输入框技能分支  bottomSkillAspectLock
     * ⚠️ 这个数字是防漏网的基数：新增重绘入口时会失败，逼你显式确认有没有接锁。
     */
    expect(editLockAssignments.length).toBe(6);
  });

  it("底图尺寸来自真实像素而非节点尺寸", () => {
    expect(source).toContain("getImageNaturalSize");
    expect(source).toContain("naturalWidth");
  });

  it("⚠️⚠️ 每个出口都下发了 preserveSourceSize（漏一个 = 那条路仍会改尺寸）", () => {
    const assignments = source.match(/preserveSourceSize:\s*[\s\S]{0,80}?,/g) || [];
    const fromLock = assignments.filter(chunk =>
      /AspectLock\.preserveSourcePixels/.test(chunk)
    );
    /*
     * 与上面的 targetWidth 基数严格同数：6 = 3 条重绘路径 × 2 个出口。
     * ⚠️ 用计数而非 toContain —— 同一模式多次出现时 toContain 会让变异漏网。
     */
    expect(fromLock.length).toBe(6);
  });

  it("⚠️⚠️⚠️ 后端编辑入口的**默认值是保持**，不是放大", () => {
    /*
     * 线上产物实探发现：编辑类入口远不止三条重绘路径，还有 camera_view
     * （视角变换）、annotation_edit（智能注释）、矢量化/高清、asset-erase（擦除）。
     * 它们都不传 preserveSourceSize，若默认值是「放大」就会悄悄改尺寸。
     * ⚠️ 必须是 `!== false`（默认保持），而不是 `=== true`（默认放大）。
     */
    const backend = stripLineComments(
      readFileSync(IMAGE_GENERATION_PATH, "utf8")
    );
    expect(backend).toMatch(
      /shouldPreserveSourceSize\s*=\s*[\s\S]{0,60}input\.preserveSourceSize\s*!==\s*false/
    );
    expect(backend).not.toMatch(
      /shouldPreserveSourceSize\s*=\s*[\s\S]{0,60}input\.preserveSourceSize\s*===\s*true/
    );
  });

  it("⚠️ 反向断言：不存在只传尺寸却漏传保持标记的重绘出口", () => {
    const widthCount = (source.match(/targetWidth:\s*\w*AspectLock\.width/g) || [])
      .length;
    const preserveCount = (
      source.match(/preserveSourceSize:\s*[\s\S]{0,80}?AspectLock\.preserveSourcePixels/g) ||
      []
    ).length;
    expect(preserveCount).toBe(widthCount);
  });
});
