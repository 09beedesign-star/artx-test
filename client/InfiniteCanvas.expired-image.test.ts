import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ⚠️ 相对路径，不用 @shared 别名：vitest 不解析该别名，会让整个套件静默变「0 test」。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../../shared/strip-source-comments";

/**
 * 「图片已过期」占位态的接线防护测试。
 *
 * 【守的是什么】
 * 生成图在服务端只留 ARTX_UPLOAD_RETENTION_DAYS 天（默认 10，见
 * server/local-image-storage.ts:53）。清理之后画布里存的仍是那条 /uploads/... URL，
 * 浏览器拿到 404 → 用户看到破图图例，**全程零报错、零提示**。
 * 修复是在 AssetNodeComponent 的 <img> 上挂 onError，改渲染成「该图片已过期」。
 *
 * 【为什么断言必须先切片】
 * InfiniteCanvas.tsx 有三万多行，同名属性满天飞（同目录的
 * InfiniteCanvas.empty-state-wiring.test.ts:20-27 实测过 `pointerEvents: "none"`
 * 全文件 27 次、`nodrag nopan` 48 次，删掉目标那处测试照样全绿）。
 * 📌 超大文件里做源码断言，锚点必须先确认「目标块外是否也存在」，
 *    否则断言守的是别人家的门。
 */

const source = (() => {
  const raw = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
  const stripped = stripSourceComments(raw);
  // ⚠️ 自检：剥离函数一旦退化成贪心正则会误吃代码，让反向断言集体恒绿。
  assertStripKeptSource(raw, stripped);
  return stripped;
})();

/**
 * 从源码里切出一段区间。
 *
 * ⚠️ 切不出来时直接抛错而不是返回空串：空串会让区间内的 `not.toContain` 全部恒绿，
 * 「没量到」和「没问题」输出长得一模一样。
 */
function sliceBetween(
  startMarker: string,
  endMarker: string,
  minLength = 200
): string {
  const start = source.indexOf(startMarker);
  if (start < 0)
    throw new Error(`切片起点不存在：${startMarker}（实现可能已重命名）`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`切片终点不存在：${endMarker}`);
  const block = source.slice(start, end);
  if (block.length < minLength) {
    throw new Error(`切片过短（${block.length} 字符），区间多半不对`);
  }
  return block;
}

/** 图片节点组件体（画布上真正渲染图片的那个，type 字面量是 "asset"） */
const assetNodeBlock = sliceBetween(
  "function AssetNodeComponent(",
  "function ChatNodeComponent("
);

describe("canvas expired image placeholder", () => {
  it("在图片节点上用 onError 探测失效，而不是靠别处推断", () => {
    expect(assetNodeBlock).toContain("onError={() => setIsImageExpired(true)}");
  });

  it("失效后渲染过期占位块，且不再渲染那张 <img>", () => {
    // 分支条件本身：过期分支必须排在正常 <img> 分支之前，否则永远走不到。
    const expiredBranch = assetNodeBlock.indexOf(
      ") : displaySrc && isImageExpired ? ("
    );
    const imgBranch = assetNodeBlock.indexOf(") : displaySrc ? (");
    expect(expiredBranch).toBeGreaterThan(-1);
    expect(imgBranch).toBeGreaterThan(-1);
    expect(expiredBranch).toBeLessThan(imgBranch);

    expect(assetNodeBlock).toContain("该图片已过期");
  });

  it("过期标记不写进 node.data —— 它会被同步持久化，临时 404 就再也回不来", () => {
    // 📌 这是本修复最容易被「顺手优化」掉的一条：
    //    把状态挪进 data 看起来更「统一」，实则让 CDN 抖动变成永久损坏。
    expect(assetNodeBlock).toContain("const [isImageExpired, setIsImageExpired]");
    expect(assetNodeBlock).not.toContain("isImageExpired: true");
    expect(assetNodeBlock).not.toContain("data.isImageExpired");
  });

  it("换图后自动清除过期标记", () => {
    // 不重置的话，节点重新生成出新图仍会顶着旧的过期态。
    expect(assetNodeBlock).toContain("setIsImageExpired(false);");
    expect(assetNodeBlock).toMatch(
      /setIsImageExpired\(false\);\s*\}, \[displaySrc\]\)/
    );
  });

  it("过期节点点开全屏预览时给提示，而不是放一张大破图", () => {
    expect(assetNodeBlock).toMatch(/if \(isImageExpired\) \{\s*toast\(/);
    // 拦截必须发生在 setPreview(true) 之前。
    const guard = assetNodeBlock.indexOf("if (isImageExpired) {");
    const open = assetNodeBlock.indexOf("setPreview(true);");
    expect(guard).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(open);
  });

  it("占位文字不用失败态那套白色半透明 —— 浅色主题下对比度只有 1.12", () => {
    /*
     * 📌 实测：rgba(255,255,255,0.30) 压在同款浅色渐变底（#d6d6da→#eeeeef）上，
     *    合成后是 rgb(226,226,229)，对比度 1.12 —— 白纸写白字，肉眼看不见。
     *    深色侧也只有 2.58 / 2.72，同样不达标。
     *    过期态只剩这一行字，看不见就等于没做这个功能。
     */
    const expiredBlock = sliceBetween(
      ") : displaySrc && isImageExpired ? (",
      ") : displaySrc ? ("
    );
    expect(expiredBlock).not.toContain("rgba(255,255,255,0.30)");
    expect(expiredBlock).toContain("color: expiredTextColor");
    // 颜色必须随主题分叉，写死单色必然有一侧不可读。
    expect(assetNodeBlock).toMatch(
      /const expiredTextColor = isDark\s*\?[\s\S]{0,80}:/
    );
  });

  it("占位块文字高度用 textBlockHeight，不自己凑差值", () => {
    /*
     * 📌 复刻自 ai-processing-overlay.ts:27-39 记录的坑：
     * maxHeight 写成 `blockSize - iconSize` 会在小节点上小于文字实际所需，
     * flex 把 span 压扁 + overflow:hidden 裁字 —— 零报错的排版事故。
     */
    const expiredBlock = sliceBetween(
      ") : displaySrc && isImageExpired ? (",
      ") : displaySrc ? ("
    );
    expect(expiredBlock).toContain("maxHeight: processingTextBlockHeight");
    expect(expiredBlock).toContain("flexShrink: 0");
    // 画框裁切：漏掉会让占位块溢出画框。同层其它分支都带了。
    expect(expiredBlock).toContain("...frameClipStyle");
  });
});
