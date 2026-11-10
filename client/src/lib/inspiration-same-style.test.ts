import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments } from "../../../shared/strip-source-comments";

/**
 * 「一键同款」的接线防护测试（2026-11-10）。
 *
 * 【为什么要扫源码】
 * 这个功能的价值全在**跨组件的一根线**上：页面写交接载荷 → 画布消费它。
 * 只测其中一半（比如载荷里有图）会得到「库是对的、画布没接」的恒绿结论，
 * 而这正是这个按钮**从上线起就点不出任何东西**的原因：
 * 画布侧拿到 `shouldAutoRun: false` 就 `return`，key 已经删了，两边都零报错。
 *
 * 📌 判据分别守住几个独立故障点：
 *   1. 载荷里必须带图，且**图必须在写入侧就固化成 data:URL**；
 *   2. 载荷必须显式 `shouldAutoRun: false`（否则一次点击就替用户扣积分）；
 *   3. 画布必须消费「不自动跑」这一支：导图 + 聚焦输入框 + **不许掉进生成**；
 *   4. 画布批量导图必须一张失败不拖累整批。
 */

const root = resolve(__dirname, "../../..");
const read = (relative: string) =>
  stripSourceComments(readFileSync(resolve(root, relative), "utf-8"));

const sameStyleLib = read("client/src/lib/inspiration-same-style.ts");
const canvasSource = read("client/src/components/canvas/InfiniteCanvas.tsx");

describe("一键同款 载荷", () => {
  it("把模板图固化后作为参考图塞进交接载荷", () => {
    expect(sameStyleLib).toContain("references");
    /*
     * ⚠️⚠️ 反面教材（2026-11-10 实测事故）：
     * 上一版这里断言的是 `not.toContain("toDataURL")`，理由是
     * 「远程 URL 就够了，画布侧走代理兜底，硬转 dataURL 只会在主线程白算一遍」。
     * 结果用户点下去看到「同款参考图未能载入」：
     *   · 兜底数据的 imageUrl 是相对路径，在 /project/<id> 下被解析成
     *     /project/inspiration-images/... → 404；
     *   · 就算写成绝对 URL，也要赌「跳转之后那一刻」网络与代理都通。
     * 📌 交接通道的契约一直是 data:URL。写方少发一次转换，读方就得赌一次网络。
     */
    expect(sameStyleLib).toContain("toDataURL");
    expect(sameStyleLib).toContain("src: resolved.src");
    expect(sameStyleLib).not.toContain("src: imageUrl");
  });

  it("相对路径必须先按当前页面解析成绝对地址", () => {
    // 兜底数据的 imageUrl 就是 `inspiration-images/prompt-01.jpg` 这种形态，
    // 原样交给 /project/<id> 页面必然 404。
    expect(sameStyleLib).toContain("new URL(src, window.location.href)");
  });

  it("代理返回 HTML 时不能当成图片（本地 dev 的 /api 会走 SPA fallback）", () => {
    // 只看 response.ok 的话，index.html 会被当成图片 dataURL 一路传下去，
    // 最后在画布侧炸成「图片加载失败」，现象与原因隔了三层。
    //
    // ⚠️ 必须切片断言：InfiniteCanvas 全文有 15 处 `startsWith("image/")`，
    // 整文件 `toContain` 会变成恒绿 —— 把这段校验删掉照样通过。
    expect(sameStyleLib).toContain('contentType.startsWith("image/")');
    const proxyFnStart = canvasSource.indexOf("async function fetchImageProxyDataUrl");
    const proxyFnEnd = canvasSource.indexOf("function getImageProxyUrl");
    expect(proxyFnStart, "找不到 fetchImageProxyDataUrl").toBeGreaterThan(0);
    expect(proxyFnEnd).toBeGreaterThan(proxyFnStart);
    expect(canvasSource.slice(proxyFnStart, proxyFnEnd)).toContain(
      'contentType.startsWith("image/")'
    );
  });

  it("固化后的体积受交接通道预算约束", () => {
    // 不设上限的话，一张原图就能把 sessionStorage 顶爆，
    // 结果是整个载荷写不进去（连图带提示词一起丢）。
    expect(sameStyleLib).toContain("HOME_REFERENCE_SINGLE_BUDGET_BYTES");
    expect(sameStyleLib).toContain("estimateDataUrlBytes");
  });

  it("绝不自动出图（一次生成要扣积分，必须用户自己点）", () => {
    expect(sameStyleLib).toContain("shouldAutoRun: false");
  });

  it("没有图片时明确报错，而不是建一块空画布", () => {
    expect(sameStyleLib).toContain("missing-image");
  });
});

describe("一键同款 画布侧消费", () => {
  /** 截出「不自动跑」这一支，避免整文件匹配把别处的调用算进来。 */
  const branchStart = canvasSource.indexOf("if (!payload.shouldAutoRun) {");
  const branchEnd = canvasSource.indexOf("if (!submittedText) return;");

  it("分支确实存在且顺序正确（先处理不自动跑，再进生成）", () => {
    expect(branchStart, "找不到 shouldAutoRun 分支").toBeGreaterThan(0);
    expect(branchEnd, "找不到生成前的空提示词闸门").toBeGreaterThan(branchStart);
  });

  it("这一支里导图 + 聚焦输入框，但绝不触发生成", () => {
    const branch = canvasSource.slice(branchStart, branchEnd);
    expect(branch).toContain("onImportHomeReferences(handoffReferences)");
    expect(branch).toContain("focusComposerSegment()");
    // 📌 关键反向断言：掉进生成就等于「点了同款直接扣积分」。
    expect(branch).not.toContain("generateAiImages");
    expect(branch).not.toContain("dispatchImageGenerationTask");
  });

  it("允许「只有图、没有提示词」的载荷", () => {
    /*
     * 旧守卫是 `!payload.prompt?.trim()` —— 一键同款恰好没有提示词，
     * 会被当成无效载荷直接忽略（而且 key 也不删）。
     */
    expect(canvasSource).toContain(
      "if (!submittedText && handoffReferences.length === 0) return;"
    );
  });

  it("批量导图一张失败不拖累整批", () => {
    /*
     * Promise.all 在一张 404 时整体 reject → 用户看到「一张都没进来」，
     * 而其余几张本来是好的。
     *
     * ⚠️ 必须切片断言：全文有 6 处 `Promise.allSettled`，
     * 整文件 `toContain` 是恒绿（实测过：改回 Promise.all 仍然通过）。
     */
    const fnStart = canvasSource.indexOf(
      "const pasteClipboardImageSources = useCallback("
    );
    const fnEnd = canvasSource.indexOf(
      "const pasteClipboardPayload = useCallback("
    );
    expect(fnStart, "找不到 pasteClipboardImageSources").toBeGreaterThan(0);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = canvasSource.slice(fnStart, fnEnd);
    expect(body).toContain("Promise.allSettled");
    expect(body).not.toContain("await Promise.all(");
  });
});
