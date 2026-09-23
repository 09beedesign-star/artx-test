import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 图片节点 4px 圆角 + 1px 描边的回归锁（2026-09-23 用户点名）。
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

  it("圆角必须是 4px，且收口成常量", () => {
    expect(
      assetNode,
      "ASSET_NODE_IMAGE_RADIUS 不是 4 —— 用户要的就是 4 像素"
    ).toContain("const ASSET_NODE_IMAGE_RADIUS = 4;");
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
  it("borderRadius 引用次数必须覆盖全部出口", () => {
    const hits = assetNode.match(/borderRadius: ASSET_NODE_IMAGE_RADIUS/g) ?? [];
    expect(
      hits.length,
      `圆角出口数不对（期望 7，实得 ${hits.length}）—— 有状态层漏改，` +
        `会出现「正常图有圆角、加载中/过期时是直角」`
    ).toBe(7);
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
    ).toContain("borderRadius: ASSET_NODE_IMAGE_RADIUS,");
  });

  it("「该图片已过期」层必须同半径", () => {
    const start = assetNode.indexOf("displaySrc && isImageExpired ? (");
    expect(start, "过期层锚点失效").toBeGreaterThan(-1);
    const block = assetNode.slice(start, start + 600);
    expect(block, "过期层缺圆角").toContain(
      "borderRadius: ASSET_NODE_IMAGE_RADIUS,"
    );
  });

  it("「图片未保存」层必须同半径", () => {
    const start = assetNode.indexOf("图片未保存，请重新上传");
    expect(start, "未保存层锚点失效").toBeGreaterThan(-1);
    // 这层的 style 在文案之前，往回切
    const block = assetNode.slice(Math.max(0, start - 900), start);
    expect(block, "未保存层缺圆角").toContain(
      "borderRadius: ASSET_NODE_IMAGE_RADIUS,"
    );
  });
});
