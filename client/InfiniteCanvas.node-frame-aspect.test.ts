import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ⚠️ 相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
// 加载失败并显示「0 test」—— 不是失败，是压根没跑。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../../shared/strip-source-comments";

/**
 * 画布节点「紫色选框必须与图片外轮廓完全重合」的防护测试。
 *
 * 【用户症状】
 * 一张 1:1 正方图进画布后，紫色选框呈 16:9 宽扁，左右各留一块空白。
 *
 * 【真因】
 * 节点框尺寸来自 `getImageDisplaySizeForRatio(ratio)` —— 按**选中的比例**查一张
 * 固定表（`"16:9": { w: 320, h: 180 }`），与模型实际返回图片的真实像素比例无关。
 * 图片再以 `object-fit: contain` 塞进这个框，比例对不上就留白。
 * 边框画在节点容器上（`:8024`，`oklch(0.65 0.22 290)`），于是框比图大一圈。
 *
 * 【修复的两层】
 * 1. 生成链路三个插入点一律 `fitGeneratedImageSizeToFrame`，不再看 `detail.skillId`。
 * 2. 渲染层 `<img onLoad>` 唯一收口：按 naturalWidth/Height 把框收紧到图片实际占位。
 *
 * 【⚠️⚠️ 为什么全部断言必须切片】
 * InfiniteCanvas.tsx 三万多行，`objectFit: "contain"` 出现 5 次、
 * `naturalWidth` 出现 20+ 次。不切片的断言守的是别人家的门。
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
 * ⚠️ 切不出来时直接抛错而不是返回空串：空串会让区间内的 `not.toContain`
 * 全部恒绿 ——「没量到」和「没问题」输出长得一模一样。
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

describe("画布节点画框与图片外轮廓对齐", () => {
  describe("生成链路：按真图比例贴合，不看 skillId", () => {
    /**
     * ⚠️⚠️⚠️ 这条是本文件最关键的断言。
     *
     * 修复前的写法是：
     *   const fittedSize = detail.skillId
     *     ? fitGeneratedImageSizeToFrame(image, size)
     *     : size;
     *
     * 只要任何一处退回 `detail.skillId ?`，非 skill 生成的图就会重新留白，
     * **且全程零报错**。所以这里用反向断言把这个写法钉死。
     */
    it("三个插入点都不再用 detail.skillId 决定是否贴合", () => {
      expect(source).not.toContain("detail.skillId\n          ? fitGeneratedImageSizeToFrame");
      expect(source).not.toContain("detail.skillId\n              ? fitGeneratedImageSizeToFrame");
      expect(source).not.toContain("detail.skillId\n            ? fitGeneratedImageSizeToFrame");
      // 更通用的一道：`skillId` 与 `fitGeneratedImageSizeToFrame` 不得出现在同一个三元里。
      expect(
        /skillId[\s\S]{0,40}\?\s*fitGeneratedImageSizeToFrame/.test(source)
      ).toBe(false);
    });

    /**
     * ⚠️ 上面那条只证明「旧写法没了」，证明不了「新写法在」——
     * 把三处整个删掉也能让反向断言通过。所以必须配一条计数断言。
     *
     * 📌⭐ 同一模式在文件里出现多次时 `toContain` 会让变异漏网
     * （删掉 1 处、还剩 2 处 → 恒绿），必须数个数。
     */
    it("生成链路恰好三处调用贴合函数", () => {
      const calls = source.match(/fitGeneratedImageSizeToFrame\(/g) || [];
      // 1 处函数定义 + 3 处调用
      expect(calls.length).toBe(4);
    });

    it("贴合函数只缩不放：scale 取两轴较小者", () => {
      const fnBlock = sliceBetween(
        "function fitGeneratedImageSizeToFrame(",
        "function buildSkillAppliedImagePrompt(",
        150
      );
      // Math.min 保证结果一定 ≤ frame，即画面上图片不会被放大。
      expect(fnBlock).toContain(
        "const scale = Math.min(frame.w / imageW, frame.h / imageH);"
      );
      // 拿不到真实尺寸时必须原样返回 frame，不能返回 0 或崩掉。
      expect(fnBlock).toContain("return frame;");
    });
  });

  describe("渲染层唯一收口：onLoad 按真图比例校正", () => {
    const assetBlock = sliceBetween(
      "const handleImageNaturalSizeLoaded = useCallback(",
      "const {\n    iconSize: processingIconSize,",
      600
    );

    it("读的是 naturalWidth/naturalHeight 而不是显示尺寸", () => {
      /*
       * ⚠️ 节点上的 width/height 是**显示尺寸**，本身就可能已经被比例表改歪。
       * 拿它反推比例 = 用错的答案去校正错的答案，永远校不回来。
       */
      expect(assetBlock).toContain("const naturalW = el.naturalWidth;");
      expect(assetBlock).toContain("const naturalH = el.naturalHeight;");
    });

    it("同样只缩不放", () => {
      expect(assetBlock).toContain(
        "const scale = Math.min(frameW / naturalW, frameH / naturalH);"
      );
    });

    /**
     * ⚠️⚠️ 三种「不能校正」的情况必须全部跳过，宁可不改也不能改错：
     * - 裁剪态：<img> 被放大到 10000/cropW %，naturalWidth 是整图不是裁剪区
     * - 画框剪裁：可视区由 clipPath 抠出，不等于图片盒
     * - 旋转 90/270：视觉外轮廓宽高互换，按原比例收会更歪
     */
    it("裁剪态、画框剪裁、90/270 旋转一律跳过", () => {
      expect(assetBlock).toContain(
        "if (hasActiveCrop || hasFrameClipInsets) return;"
      );
      expect(assetBlock).toContain(
        "if (Math.abs(((rotation % 360) + 360) % 360) % 180 !== 0) return;"
      );
    });

    /**
     * ⚠️⚠️⚠️ 1px 死区不能删。
     * 四舍五入本身带 ±0.5px 抖动，没有死区会出现
     * 「写回 → 重渲染 → 又差 1px → 再写回」的来回震荡，表现为节点尺寸抽搐。
     *
     * 📌 不能写 `toContain("<= 1")` —— 变异成 `<= 10` 时前缀依然匹配。
     *    必须带上完整表达式作为定界。
     */
    it("有 1px 死区防止写回震荡", () => {
      expect(assetBlock).toContain(
        "if (Math.abs(nextW - frameW) <= 1 && Math.abs(nextH - frameH) <= 1) return;"
      );
    });

    it("校正结果同时写进 style 和 data，两套必须一致", () => {
      /*
       * ⚠️ 节点尺寸有两个事实源：ReactFlow 的 `style.width/height`（决定选框），
       * 和 `data.imgW/imgH`（决定持久化与重渲染）。只写一个 →
       * 刷新页面后框又变回去，且零报错。
       */
      expect(assetBlock).toContain("style: { ...n.style, width: nextW, height: nextH },");
      expect(assetBlock).toContain("imgW: nextW,");
      expect(assetBlock).toContain("imgH: nextH,");
    });

    it("收口真的接到了图片元素上", () => {
      /*
       * ⚠️ 这条是「透传 ≠ 被消费」的防线：函数写得再对，
       * 没挂到 <img onLoad> 上就等于没做。
       */
      const imgAt = source.indexOf("onLoad={handleImageNaturalSizeLoaded}");
      expect(imgAt).toBeGreaterThan(-1);
      const imgBlock = source.slice(
        source.lastIndexOf("<img", imgAt),
        source.indexOf("/>", imgAt)
      );
      // 必须挂在承载 displaySrc 的那个主图上，不是过期占位图/生成中图标。
      expect(imgBlock).toContain("src={displaySrc}");
    });
  });

  describe("裁剪态判据唯一事实源", () => {
    /**
     * ⚠️ `isCropping || cropX > 0 || ...` 这串条件以前内联写在 imgCropStyle 里，
     * onLoad 收口也需要同一个判断。抄一份出去必然有一天两边走偏。
     */
    it("hasActiveCrop 只定义一次且被两处共用", () => {
      const defs = source.match(/const hasActiveCrop =/g) || [];
      expect(defs.length).toBe(1);
      const uses = source.match(/hasActiveCrop/g) || [];
      // 1 处定义 + imgCropStyle + onLoad 守卫 + useCallback 依赖数组
      expect(uses.length).toBeGreaterThanOrEqual(4);
    });
  });
});
