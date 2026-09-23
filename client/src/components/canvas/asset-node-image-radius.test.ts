import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 图片节点 12px 圆角 + 1px 描边的回归锁（2026-09-23 用户点名）。
 *
 * 需求原话：
 *   「所有图片节点一律添加 4 像素的圆角」
 *   「外面的圆角描边的宽度改为一个像素，然后圆角的四像素是向内部的四像素」
 *
 * ⚠️⚠️⚠️ 这次的坑是零报错的：外层容器 overflow:hidden + border:2px + radius:4
 *   时，内容**实际被裁剪的半径 = radius − border = 2px**，而 <img> 自己
 *   border-radius 是 0。源码里明明写着 4，用户看到的是 2。
 *   所以本文件不只断言「常量是 4」，还必须断言**每一个可见状态层都消费了它**。
 *
 * ⚠️ 全是源码文本断言，必须配合变异自证 —— 光跑绿说明不了任何问题。
 *   已跑变异 M1：把 ASSET_NODE_IMAGE_RADIUS 改成 0，
 *   线上像素判据（角落暗像素逐行递减）随之变平，判据非恒绿。
 */

const SOURCE_PATH = join(__dirname, "InfiniteCanvas.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

/** 生成中描边的样式在全局 CSS 里，不在组件内。 */
const CSS_PATH = join(__dirname, "..", "..", "index.css");
const css = readFileSync(CSS_PATH, "utf8");

/** 切出 .artx-ai-generation-loading::after 规则体。 */
function sliceGenerationBorderRule(): string {
  const marker = ".artx-ai-generation-loading::after";
  const start = css.indexOf(marker);
  if (start === -1) {
    throw new Error("定位锚点失效，找不到 .artx-ai-generation-loading::after");
  }
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n  }", open);
  return css.slice(open, close === -1 ? css.length : close);
}

/** 切出 AssetNodeComponent 到下一个顶层声明为止。 */
function sliceAssetNode(): string {
  const marker = "function AssetNodeComponent(";
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error("定位锚点失效，找不到 AssetNodeComponent");
  }
  const rest = source.slice(start + marker.length);
  const nextTop = rest.search(/\n(?:function |const [A-Za-z]+ = |type |export )/);
  return rest.slice(0, nextTop === -1 ? rest.length : nextTop);
}

const assetNode = sliceAssetNode();

describe("图片节点圆角：唯一事实源", () => {
  it("切片锚点有效（片段非空）", () => {
    expect(
      assetNode.length,
      "AssetNodeComponent 片段为空 —— 后面所有断言会恒真/恒假"
    ).toBeGreaterThan(5000);
  });

  it("圆角必须是 12px，且收口成常量", () => {
    /*
     * ⚠️ 必须带结尾分号，否则 "= 1" 会被 "= 12"/"= 16" 前缀匹配放过
     *   （数值型断言的前缀匹配坑）。
     * 📌 2026-09-23 先定 4px，用户实测觉得太细微，当天改为 12px。
     */
    expect(
      assetNode,
      "ASSET_NODE_IMAGE_RADIUS 不是 12 —— 用户要的就是 12 像素"
    ).toContain("const ASSET_NODE_IMAGE_RADIUS = 12;");
  });

  it("外框描边必须是 1px（用户原话「改为一个像素」）", () => {
    expect(
      assetNode,
      "ASSET_NODE_BORDER_WIDTH 不是 1 —— 描边一宽就把圆角吃掉了"
    ).toContain("const ASSET_NODE_BORDER_WIDTH = 1;");
    expect(
      assetNode,
      "还残留 2px 硬编码描边 —— 裁剪半径会退回 4−2=2px，圆角「看不出来」"
    ).not.toContain("border: `2px solid ${borderColor}`");
  });

  it("描边必须消费常量，不能再写字面量", () => {
    expect(
      assetNode,
      "内层容器没用 ASSET_NODE_BORDER_WIDTH —— 改常量不会生效"
    ).toContain("border: `${ASSET_NODE_BORDER_WIDTH}px solid ${borderColor}`");
  });
});

describe("图片节点圆角：每个可见状态层都必须消费同一半径", () => {
  /*
   * ⚠️ 这条是本次真正的防倒退点。
   *   图片节点同一块区域有 6 个互斥/叠加的可见层：
   *     外层容器 / 内层裁剪容器 / 主图 <img> / 生成中的模糊底图 <img>
   *     / AI 处理中覆盖层 / 已过期层 / 未保存层
   *   只改一个 → 正常图有圆角、加载中是直角，零报错。
   *   （这是记忆里「同一份数据的多个出口」事故模式的第 N 次复现。）
   */
  /*
   * 📌 2026-09-23 契约变更：出口从「全用 ASSET_NODE_IMAGE_RADIUS」拆成两档。
   *   外轮廓层（外层容器 / 内层描边容器 / 主图 <img>）用 IMAGE 半径 = 12；
   *   内层 overflow:hidden 的**覆盖层**用 INNER 半径 = 12 − 1 = 11，
   *   否则比父层裁剪路径大 1px，四个角被削（用户反馈的「描边被切断」之一）。
   *   所以这里必须分别计数，合计仍是 7 —— 少哪一档都会漏改状态层。
   */
  it("外轮廓层必须用 IMAGE 半径", () => {
    const hits = assetNode.match(/borderRadius: ASSET_NODE_IMAGE_RADIUS/g) ?? [];
    expect(
      hits.length,
      `外轮廓出口数不对（期望 3，实得 ${hits.length}）—— ` +
        `外层容器 / 内层描边容器 / 主图 <img> 三处必须是节点真实外圆角`
    ).toBe(3);
  });

  it("内层覆盖层必须用 INNER 半径（比裁剪路径大就会削角）", () => {
    const hits = assetNode.match(/borderRadius: ASSET_NODE_INNER_RADIUS/g) ?? [];
    expect(
      hits.length,
      `覆盖层出口数不对（期望 4，实得 ${hits.length}）—— ` +
        `模糊底图 / AI 处理中层 / 已过期层 / 未保存层，漏一个就四角被切`
    ).toBe(4);
  });

  it("INNER 半径必须由 IMAGE 半径减描边宽推导，不能写死", () => {
    expect(
      assetNode,
      "INNER 半径写成了字面量 —— 圆角或描边一改就又出现削角"
    ).toContain(
      "ASSET_NODE_IMAGE_RADIUS - ASSET_NODE_BORDER_WIDTH"
    );
    /*
     * ⚠️ 变异 M3 实测漏网：最初写 `assetNode.toContain("Math.max(")`，
     *   但 Math.max 在这个 3.7 万行文件里到处都是，断言等于恒绿。
     *   必须把范围收窄到这个常量自己的声明块内。
     *   （记忆判据：同一模式多次出现时 toContain 会让变异漏网。）
     */
    const declStart = assetNode.indexOf("const ASSET_NODE_INNER_RADIUS");
    expect(declStart, "INNER 半径声明锚点失效").toBeGreaterThan(-1);
    const decl = assetNode.slice(declStart, declStart + 160);
    expect(
      decl,
      "INNER 半径没有下限保护 —— 描边比圆角宽时会算出负值圆角"
    ).toContain("Math.max(");
  });

  it("主图 <img> 自身必须带圆角，不能只靠父层裁剪", () => {
    /*
     * ⚠️⚠️ 切片必须**收窄到这个 <img> 自己的 style 块之内**。
     *   最初写成 start + 900，把下面「图片未保存」层的 borderRadius 也切进来了，
     *   于是删掉主图圆角后这条断言依然通过 —— 变异 M-D 半漏网（2026-09-23 实测）。
     *   终止锚用主图 style 块末尾那行 zIndex: 1。
     */
    const start = assetNode.indexOf("onLoad={handleImageNaturalSizeLoaded}");
    expect(start, "主图锚点失效").toBeGreaterThan(-1);
    const end = assetNode.indexOf("zIndex: 1,", start);
    expect(end, "主图 style 块终止锚失效").toBeGreaterThan(start);
    const block = assetNode.slice(start, end);
    expect(
      block,
      "主图 <img> 没有自己的 borderRadius —— 圆角全靠父层裁剪，" +
        "会被 border 宽度吃掉，用户看不见"
    ).toContain("borderRadius: ASSET_NODE_IMAGE_RADIUS,");
    expect(block, "主图锚点切片没覆盖到 objectFit，可能切错范围").toContain(
      'objectFit: "contain"'
    );
  });

  it("生成中的模糊底图也必须同半径", () => {
    const start = assetNode.indexOf("src={sourceBackgroundSrc}");
    expect(start, "模糊底图锚点失效").toBeGreaterThan(-1);
    const block = assetNode.slice(start, start + 700);
    expect(
      block,
      "生成中的模糊底图缺圆角 —— 出图过程中节点会变直角"
    ).toContain("borderRadius: ASSET_NODE_INNER_RADIUS,");
  });

  it("「该图片已过期」层必须同半径", () => {
    const start = assetNode.indexOf("displaySrc && isImageExpired ? (");
    expect(start, "过期层锚点失效").toBeGreaterThan(-1);
    const block = assetNode.slice(start, start + 600);
    expect(block, "过期层缺圆角").toContain(
      "borderRadius: ASSET_NODE_INNER_RADIUS,"
    );
  });

  it("生成中的白色描边不能用直线段拼（会在圆角处断开）", () => {
    /*
     * ⚠️⚠️⚠️ 这条是 2026-09-23 用户反馈「四个角描边被切断」的直接根因锁。
     *   旧写法用 4 条 linear-gradient 直线段贴在 top/bottom/left/right，
     *   直线段是矩形的、走不了弧 —— 圆角一加大，四角就整块没有描边。
     *   新写法用 border-box/content-box 双 mask 相减挖出沿圆角走的环。
     */
    const rule = sliceGenerationBorderRule();
    expect(
      rule,
      "描边又退回「直线段拼边框」写法 —— 圆角四个角必然断开"
    ).not.toMatch(/(top|bottom)\s*\/\s*100%\s+\d+px/);
    expect(
      rule,
      "描边又退回「直线段拼边框」写法 —— 圆角四个角必然断开"
    ).not.toMatch(/(left|right)\s*\/\s*\d+px\s+100%/);
    expect(rule, "描边没有跟随父层圆角").toContain("border-radius: inherit");
    expect(rule, "缺 mask 相减 —— 挖不出沿圆角走的环").toContain(
      "mask-composite: exclude"
    );
    expect(rule, "缺 Safari 前缀，Safari 下描边会变成整块白").toContain(
      "-webkit-mask-composite: xor"
    );
    expect(
      rule,
      "环的厚度必须由组件下发的 CSS 变量决定，不能写死"
    ).toContain("var(--artx-gen-border-width");
  });

  it("描边厚度变量必须由组件真实下发", () => {
    expect(
      assetNode,
      "组件没下发 --artx-gen-border-width —— CSS 只能吃兜底值，" +
        "描边宽度改了描边不跟随"
    ).toContain("--artx-gen-border-width");
  });

  it("「图片未保存」层必须同半径", () => {
    const start = assetNode.indexOf("图片未保存，请重新上传");
    expect(start, "未保存层锚点失效").toBeGreaterThan(-1);
    // 这层的 style 在文案之前，往回切
    const block = assetNode.slice(Math.max(0, start - 900), start);
    expect(block, "未保存层缺圆角").toContain(
      "borderRadius: ASSET_NODE_INNER_RADIUS,"
    );
  });
});
