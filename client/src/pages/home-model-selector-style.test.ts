import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 首页模型选择器的**视觉一致性**防护（2026-09-16）。
 *
 * 用户要求：选择器的默认态/hover 态要和它左边的「添加参考图」按钮完全同一套
 * 风格，去掉 hover 的黑色底托，图标默认色也要一致。
 *
 * 【为什么值得一条测试】
 * 这类约束是「两个控件之间的关系」，不是某个控件自己的属性 ——
 * 改动其中任一侧都会悄悄打破它，而且没有任何报错，只有肉眼能发现。
 */

const HOME_PAGE_PATH = "client/src/pages/HomePage.tsx";
const MODEL_SELECTOR_PATH =
  "client/src/components/canvas/ModelSelector.tsx";

function stripComments(source: string) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** 截取首页 ModelSelector 的调用点。 */
function readHomeSelectorCall() {
  const source = stripComments(readFileSync(HOME_PAGE_PATH, "utf8"));
  const start = source.indexOf("<ModelSelector");
  expect(start, "首页 ModelSelector 调用点没找到").toBeGreaterThan(0);
  const end = source.indexOf("/>", start);
  expect(end).toBeGreaterThan(start);
  const body = source.slice(start, end);
  expect(body.length).toBeGreaterThan(120);
  return body;
}

describe("首页模型选择器必须与上传图片 icon 同款", () => {
  it("hover 不得有黑色底托", () => {
    const body = readHomeSelectorCall();

    /**
     * 左边的「添加参考图」按钮 hover 只是文字变白，没有任何背景块。
     * 选择器若套一层深色底托，两个并排控件的反馈完全不是一套语言。
     */
    expect(body, "hover 底托没去掉").toMatch(
      /hoverBackground:\s*"transparent"/
    );
    expect(body, "展开时的描边没去掉").toMatch(/openBorder:\s*"transparent"/);
  });

  it("默认态与 hover 态的颜色要和上传按钮一致", () => {
    const body = readHomeSelectorCall();
    // 参考图按钮：默认 #7d7d7d（继承自父级 text-[#7d7d7d]）、hover 转白。
    expect(body).toMatch(/text:\s*"#7d7d7d"/);
    expect(body).toMatch(/hoverText:\s*"#ffffff"/);
  });

  it("⚠️ 图标颜色必须跟随按钮文字色，不能恒为白", () => {
    const source = stripComments(readFileSync(MODEL_SELECTOR_PATH, "utf8"));

    /**
     * ⚠️ 品牌图标走 CSS mask，颜色由 backgroundColor 决定、**不吃 color**。
     *    只在外层 span 上改 color 只能管住线框图（它用 currentColor 描边），
     *    品牌图标会继续是白的 —— 这就是「同一份视觉的多个出口」在图标上的形态，
     *    本项目已在图标三层映射上踩过一次。
     *
     * 所以两处都要断言：外层 color + mask 的 backgroundColor。
     */
    expect(source, "触发按钮图标颜色没跟随文字色").toContain(
      "const triggerIconColor = open || buttonHover ? selectedText : text"
    );
    expect(source, "品牌图标的 mask 底色没接上 color").toMatch(
      /<ModelBrandIconMask[^>]*style=\{\{ backgroundColor: color \}\}/
    );
    // 外层 span 也不能再写死白色。
    expect(source).not.toMatch(/style=\{\{ color: "#FFFFFF", display: "inline-flex"/);
  });

  it("首页展开栏向上弹，不遮挡提示词", () => {
    const body = readHomeSelectorCall();

    /**
     * 这一行贴着玻璃面板底部，向下弹会被面板边缘截断，
     * 用户要滚动才看得到后面的模型。
     */
    expect(body).toMatch(/placement="up"/);
  });

  it("画布侧的默认外观不得被首页的定制改掉", () => {
    const source = stripComments(readFileSync(MODEL_SELECTOR_PATH, "utf8"));

    /**
     * 这是从 InfiniteCanvas 搬迁来的共享组件，画布侧不传这些新字段。
     * 用 ?? 兜底而不是直接替换，才能保证画布行为逐像素不变 ——
     * 搬迁/扩展都不是让另一侧产生视觉回归的借口。
     */
    expect(source).toMatch(/surface\?\.hoverBackground\s*\?\?/);
    expect(source).toMatch(/surface\?\.hoverText\s*\?\?\s*"white"/);
    expect(source).toMatch(/surface\?\.openBorder\s*\?\?/);
  });
});

describe("首页选好的模型要带进画布", () => {
  it("选择器与画布共用同一份偏好存储", () => {
    const source = stripComments(readFileSync(HOME_PAGE_PATH, "utf8"));

    /**
     * 「记住选项并带入画布」靠的是两处共用 assistant-model-preference，
     * 而不是首页自己存一份 —— 后者必然与画布对不上。
     */
    expect(source).toMatch(/readPreferredImageModelId/);
    expect(source).toMatch(/writePreferredImageModelId/);
    // 切换时立刻落盘，而不是等发送时才存（用户可能选完就走）。
    expect(source).toMatch(
      /setHomeImageModelId\(modelId\);\s*writePreferredImageModelId\(modelId\)/
    );
  });
});

describe("画布存储告警不得刷屏（2026-09-16 用户反馈）", () => {
  it("⚠️ 去重标记必须是模块级，放函数内等于没去重", () => {
    const source = stripComments(
      readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8")
    );

    /**
     * safeWriteCanvasState 每次 nodes 变化都会被调用。
     * 标记若声明在函数内部，每次都会重置成 false，用户照样被刷屏 ——
     * 这正是用户投诉的「总会出现」。
     */
    expect(source).toMatch(/^let canvasStorageWarningShown = false;/m);
  });

  it("存储恢复后要能重新提醒一次", () => {
    const source = stripComments(
      readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8")
    );
    // 一次性 ≠ 一辈子只提一次：写成功后要清标记。
    expect(source).toMatch(/canvasStorageWarningShown = false;/);
    expect(source).toMatch(/canvasStorageWarningShown = true;/);
  });
});
