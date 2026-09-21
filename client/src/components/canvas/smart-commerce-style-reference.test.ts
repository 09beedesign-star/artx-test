import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 智能产品图「风格参考图」的接线防护测试（2026-09-16）。
 *
 * 【为什么是源码断言】
 * 这条链路跨了 5 段：对话框 state → CustomEvent detail → 画布 effect →
 * editImageWithPrompt(referencedAssets) → 服务端 referenceImages → VOD FileInfos。
 * 本项目已经在「透传 ≠ 被消费」上踩过十一次 —— 加了字段、也传下去了，
 * 但消费端根本没读，表现是「传了参考图，出图跟它毫无关系」且全程零报错。
 *
 * 所以这里锚的是「接没接上」，不是「函数算得对不对」。
 */

const DIALOG_PATH =
  "client/src/components/canvas/SmartCommerceProductDialog.tsx";
const CANVAS_PATH = "client/src/components/canvas/InfiniteCanvas.tsx";

/**
 * 只剥「整行都是注释」的形态。
 *
 * ⚠️ 不能用通用块注释正则：InfiniteCanvas.tsx 上百万字符，
 * 里面的正则字面量和字符串都可能出现 `/*` 片段，通用写法会从假起点
 * 一路吞到下一个结束符，把真实代码吃掉，让断言「假通过」。
 */
function stripComments(source: string) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function readStripped(path: string) {
  return stripComments(readFileSync(path, "utf8"));
}

/**
 * 截取画布侧智能产品图的出图正文。
 *
 * 起锚用 editImageWithPrompt 之前的 SMART_COMMERCE_PROMPT_IMAGE_MODEL_ID，
 * 止锚用该 run() 的收尾。范围划错的断言比没有断言更糟 ——
 * 它会逼着人去改正确的代码。
 */
function readSmartProductRunBody() {
  const source = readStripped(CANVAS_PATH);
  const start = source.indexOf("const single = await editImageWithPrompt({");
  expect(start, "起锚没找到，测试范围失效").toBeGreaterThan(0);
  const end = source.indexOf("collected.push(", start);
  expect(end, "止锚没找到，测试范围失效").toBeGreaterThan(start);
  const body = source.slice(start, end);
  // 范围自检：太短说明锚错了，断言会变成空转。
  expect(body.length).toBeGreaterThan(200);
  return body;
}

describe("智能产品图风格参考图：必须真正驱动出图", () => {
  it("⚠️ 参考图必须接到 referencedAssets，不能只放在 detail 里", () => {
    const body = readSmartProductRunBody();

    /**
     * 这是整条链最容易做成静默失效的一环。
     * detail 里加了 referenceSrc、对话框也传了，但 editImageWithPrompt
     * 若不带 referencedAssets，图根本到不了上游 —— 用户传了参考图，
     * 出来的背景跟它毫无关系，且不会有任何报错。
     */
    expect(body, "参考图没接到 referencedAssets 上，等于没传").toMatch(
      /referencedAssets:\s*detail\.referenceSrc/
    );
    expect(body).toContain('title: "style reference"');
  });

  it("参考图的 title 不得与蒙版保留字撞名", () => {
    const body = readSmartProductRunBody();

    /**
     * 服务端 image-generation.ts:4250 按 `title === "annotation mask"`
     * 把参考图挑出来当蒙版用。风格参考图若叫这个名字，
     * 会被当成蒙版解析，行为完全跑偏。
     */
    expect(body).not.toContain('title: "annotation mask"');
  });
});

describe("智能产品图风格参考图：提示词措辞是死线", () => {
  it("⚠️ 只能正向指认用途，不得用抽象否定", () => {
    const source = readStripped(DIALOG_PATH);

    /**
     * 2026-09-16 实测（即梦 4.0 + 蒙版，判据为「目标区内/区外像素改变比」）：
     *   · 「第二张图是样张，不是构图参考」这种抽象否定 → 0.94x，整图被重画
     *   · 换成正向指认用途 + 单点排除            → 3.29x
     *
     * 📌 强调「不是什么」会把模型的注意力引到那个东西上。
     *    与本项目「额度闸门只能用排除法不能用白名单」是同构的教训。
     */
    const start = source.indexOf("const referenceStyleRules");
    expect(start, "referenceStyleRules 没找到").toBeGreaterThan(0);
    const body = source.slice(start, start + 800);

    // 正向锚点：必须说清「这张图是干什么用的」。
    expect(body).toContain("风格参考图");
    expect(body, "缺少对产品主体的保护条款").toContain("产品");

    // 反向断言：这类抽象否定措辞实测会让模型放飞。
    expect(body, "抽象否定措辞实测会让保真度崩到 0.94x").not.toMatch(
      /不是构图参考|不是重新生成|不是重新设计/
    );
  });

  it("模板模式不得带参考图（PicWish 上游不接受，传了只会被丢掉）", () => {
    const source = readStripped(DIALOG_PATH);

    /**
     * 传过去被上游丢掉是最坏的一种失败：用户以为生效了，
     * 结果完全没影响，还找不到任何错误信息。
     */
    expect(source).toMatch(/referenceSrc:\s*isPromptMode && referenceSrc/);
  });

  it("参考图与产品图必须是两个独立的上传入口", () => {
    const source = readStripped(DIALOG_PATH);

    /**
     * 两者语义完全相反：产品图是「要被逐像素保护的主体」，
     * 参考图是「只提供风格的样张」。共用一个 input 会让用户传错，
     * 而传错的后果是产品被当成风格来源重绘。
     */
    expect(source).toContain("referenceInputRef");
    expect(source).toContain("productInputRef");
    expect(source).not.toMatch(/referenceInputRef\s*=\s*productInputRef/);
  });
});

describe("智能产品图风格参考图：不得占据产品图上传窗口（2026-09-16）", () => {
  /**
   * ⚠️⚠️ 这是一个**零报错**的真实缺陷，不是纯视觉问题。
   *
   * 参考图的隐藏 <input> 原先放在 uploadSlot 内部，而 uploadSlot 的根 div
   * 自身带 onClick → productInputRef.click()。程序化调用
   * referenceInputRef.current.click() 时，click 事件会从隐藏 input 冒泡到
   * 那个根 div，于是产品图选择器被一并唤起 ——
   * 用户看到的就是「点参考图，弹出来的是产品图上传窗口」。
   *
   * 修复方式：把 input 挂到面板根部（常驻、且不在任何带 onClick 的容器里）。
   * 不能挪进提示词区：那一段会随 backgroundMode 切换整段卸载，
   * input 跟着卸载会丢掉 file 选择回调。
   */
  it("参考图 input 不得放在带 onClick 的产品上传区里", () => {
    const source = readStripped(DIALOG_PATH);

    const slotStart = source.indexOf("const uploadSlot = (");
    expect(slotStart, "找不到 uploadSlot").toBeGreaterThan(0);
    const slotEnd = source.indexOf("const referenceFileInput", slotStart);
    expect(slotEnd, "找不到 uploadSlot 的结束锚点").toBeGreaterThan(slotStart);
    const slot = source.slice(slotStart, slotEnd);

    // 范围自检：太短说明锚错了，断言会变成空转
    expect(slot.length).toBeGreaterThan(500);

    /**
     * ⚠️⚠️ 这里必须同时禁掉两种写法。
     *
     * 第一版断言只禁了 `ref={referenceInputRef}`（即 input 标签本身写在槽里），
     * 结果做变异自证时发现：把 input 的**定义**留在外面、只把
     * `{referenceFileInput}` 这个变量渲染进 uploadSlot，冒泡缺陷一模一样会复现，
     * 而测试照样 8 passed —— 断言对这种倒退是恒绿的。
     *
     * 📌 真正决定会不会冒泡的是「渲染在哪棵子树下」，不是「标签写在哪一行」。
     *    判据必须锁渲染位置。
     */
    expect(slot, "参考图 input 回到了产品上传区，点击会冒泡唤起产品选图器").not.toContain(
      "ref={referenceInputRef}"
    );
    expect(slot, "参考图 input 被渲染进产品上传区，点击会冒泡唤起产品选图器").not.toContain(
      "{referenceFileInput}"
    );
    // 产品图自己的 input 仍然留在里面
    expect(slot).toContain("ref={productInputRef}");

    // 正面判据：它必须渲染在面板根 div 下（常驻、且父链上没有 onClick）
    const panelStart = source.indexOf("data-artx-dialog-surface");
    expect(panelStart, "找不到面板根节点").toBeGreaterThan(0);
    const headerStart = source.indexOf("<header", panelStart);
    expect(headerStart, "找不到面板 header").toBeGreaterThan(panelStart);
    const panelHead = source.slice(panelStart, headerStart);
    expect(panelHead.length).toBeGreaterThan(200);
    expect(panelHead, "参考图 input 没有挂在面板根部").toContain("{referenceFileInput}");
  });

  it("参考图上传后按画布引用标签的样式展示，且尺寸配色取自共享常量", () => {
    const source = readStripped(DIALOG_PATH);

    /**
     * 需求原文：「仅仅在提示词窗口内按照画布引用图片标签的样式展示，
     * UI 交互和视觉效果与图片引用标签保持一致。」
     *
     * ⚠️ 判据必须是「取自同一份常量」，不能只看长得像。
     *    照抄一份数值同样能通过肉眼检查，但那就造出了第二个出口 ——
     *    以后调整标签外观时这里不会跟着变，且不会报任何错。
     */
    expect(source).toContain('from "@/components/canvas/composer-ref-token"');
    expect(source).toContain("COMPOSER_REF_TOKEN_SIZE.maxWidth");
    expect(source).toContain("COMPOSER_REF_TOKEN_SIZE.height");
    expect(source).toContain("COMPOSER_REF_TOKEN_SIZE.iconSize");
    expect(source).toContain("getComposerRefTokenColors(isDark");
    // 与画布标签同一个语义标记
    expect(source).toContain('data-composer-token="image"');

    // 旧的「按钮 + 24px 缩略图 + 移除文字」那套已被替换
    expect(source).not.toContain("已挂参考图");
    expect(source).not.toContain('className="h-6 w-6 rounded object-cover"');

    // 反向自检：确认共享常量确实没有被复制成本地字面量
    expect(source, "尺寸被硬编码成副本了").not.toMatch(
      /maxWidth:\s*82\b/
    );
  });
});

describe("去掉右上角实现细节角标", () => {
  it("不再向用户暴露上游厂商名与模型名", () => {
    const source = readFileSync(DIALOG_PATH, "utf8");

    /**
     * 「PicWish 模板 / gem 模型生成」是实现细节，对用户没有决策价值，
     * 下面的 tab 已经说清「默认背景 / 提示词生图」的区别了。
     *
     * ⚠️ 这里刻意读**未剥注释**的原文并只锁 JSX 角标结构：
     *    title 属性里出现 PicWish 是合理的（那是给用户的功能解释），
     *    要禁的是把它当标签摆在标题行右上角。
     */
    expect(source).not.toMatch(/<aside[^>]*>[\s\S]{0,200}PicWish 模板/);
  });
});
