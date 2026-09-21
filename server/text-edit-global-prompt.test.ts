import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TEXT_EDIT_GLOBAL_NEGATIVE_TERMS,
  TEXT_EDIT_GLOBAL_POSITIVE_PROMPT,
  buildTextEditGlobalPrompt,
  buildTextEditLanguageHint,
} from "../shared/text-edit-global-prompt";

const IMAGE_GENERATION_PATH = path.resolve(
  import.meta.dirname,
  "image-generation.ts",
);

/**
 * 读源码做断言时必须先剥注释。
 *
 * ⚠️ 本项目踩过：反向断言 `not.toContain("xxx")` 被自己写的中文注释命中而恒红；
 * 正向断言也会被注释里引用的旧代码片段"假命中"，让测试看起来通过其实没量到东西。
 */
function readSourceWithoutComments() {
  const raw = fs.readFileSync(IMAGE_GENERATION_PATH, "utf8");
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("text_edit 全局通用提示词", () => {
  it("启用时同时给出正向指令与负面词", () => {
    const result = buildTextEditGlobalPrompt(true);
    expect(result.positive).toBe(TEXT_EDIT_GLOBAL_POSITIVE_PROMPT);
    expect(result.positive.length).toBeGreaterThan(0);
    expect(result.negative).toContain(TEXT_EDIT_GLOBAL_NEGATIVE_TERMS[0]);
  });

  it("关闭时两段都必须是空串，而不是 undefined 或占位文字", () => {
    /**
     * 空串是刻意的：调用方用 `.filter(Boolean)` 和三元拼接，
     * undefined 会被拼成字面量 "undefined" 发给模型，零报错但污染提示词。
     */
    const result = buildTextEditGlobalPrompt(false);
    expect(result.positive).toBe("");
    expect(result.negative).toBe("");
  });

  it("默认参数为启用 —— 漏传参数不能让特性静默失效", () => {
    /**
     * ⚠️ 这条守的是「没生效」和「没效果」长得一样的坑：
     * 若默认值是 false，上线后用户看到出图没变化，
     * 会误判成"提示词没用"而去改提示词内容，永远修不好。
     */
    expect(buildTextEditGlobalPrompt().positive).toBe(
      TEXT_EDIT_GLOBAL_POSITIVE_PROMPT,
    );
  });

  it("负面词不与既有事故负面词重复堆叠", () => {
    /**
     * image-generation.ts 里已有一串实测踩坑得来的负面词（底板/白色色块/文本框…）。
     * 全局层若重复同义词，不会让模型更听话，只会稀释其他指令的权重。
     */
    const existing = [
      "文字底板",
      "白色色块",
      "文本框",
      "标签贴纸",
      "圆角矩形背景",
      "气泡框",
      "画面变形",
      "背景改动",
      "模糊",
      "噪点",
      "水印",
      "扭曲",
    ];
    const overlap = TEXT_EDIT_GLOBAL_NEGATIVE_TERMS.filter(term =>
      existing.includes(term),
    );
    expect(overlap).toEqual([]);
  });

  it("提示词长度受控，避免稀释本次具体指令", () => {
    /**
     * 全局层会挤占模型对「这次到底要写什么字」的注意力。
     * 这条是硬预算闸门：想加内容就必须先删内容，逼迫保持精简。
     */
    expect(TEXT_EDIT_GLOBAL_POSITIVE_PROMPT.length).toBeLessThan(1200);
    expect(TEXT_EDIT_GLOBAL_NEGATIVE_TERMS.length).toBeLessThanOrEqual(20);
  });

  it("完整外形优先级规则存在，且明确「字号不照样本放大」", () => {
    /**
     * 2026-09-21 上轮实测证伪：照样本复刻字号 = 截断根因
     * （样本条 7 字满宽，模型写 5 字也撑满）。这条规则把
     * 「完整不截断」压到「照样本」之上，同时显式禁止字号照样本放大。
     * ⚠️ 用「不得被截断」+「字号不照样本放大」两个锚点做正向断言，
     * 不是 not.toContain（避免被自己的中文注释命中而恒红）。
     */
    expect(TEXT_EDIT_GLOBAL_POSITIVE_PROMPT).toContain("替换文字必须完整显示");
    expect(TEXT_EDIT_GLOBAL_POSITIVE_PROMPT).toContain("不得被截断");
    expect(TEXT_EDIT_GLOBAL_POSITIVE_PROMPT).toContain("字号不照样本放大");
  });
});

describe("语种与行数提示（按本次目标文案动态生成）", () => {
  it("中文单行 → 一行中文", () => {
    const hint = buildTextEditLanguageHint("欢乐中国年");
    expect(hint).toContain("一行中文");
    expect(hint).not.toContain("英文");
  });

  it("英文单行 → 一行英文", () => {
    const hint = buildTextEditLanguageHint("GAME FOR PEACE");
    expect(hint).toContain("一行英文");
    expect(hint).not.toContain("中文");
  });

  it("⚠️ 多区域批量替换时必须报实际行数，不能写死「一行」", () => {
    /**
     * 这条守的是把单样例约束当通用约束的坑。
     * renderTargetText 在多区域被改时是 changedTexts.join("\n")，
     * 强行要求"一行"会让模型把多行文案挤成一行 —— 零报错。
     */
    const hint = buildTextEditLanguageHint("欢乐中国年\n龙狮迎冰雪\n即刻出发");
    expect(hint).toContain("3行中文");
    expect(hint).not.toContain("一行");
  });

  it("空行不计入行数", () => {
    expect(buildTextEditLanguageHint("欢乐中国年\n\n\n")).toContain("一行中文");
  });

  it("中英混排按中文字形口径处理", () => {
    /**
     * "龙年 2026" 这类标题若按英文口径要求"标准无衬线字体"，
     * 会让模型用西文字体去凑中文字形，结果是字形崩坏。
     */
    expect(buildTextEditLanguageHint("龙年 2026")).toContain("中文");
  });

  it("空文案返回空串，不产生无意义指令", () => {
    expect(buildTextEditLanguageHint("")).toBe("");
    expect(buildTextEditLanguageHint("   ")).toBe("");
  });
});

describe("全局提示词的接线（防「只改一个出口」）", () => {
  it("image-generation.ts 确实引入并调用了事实源", () => {
    const source = readSourceWithoutComments();
    expect(source).toContain(
      'from "../shared/text-edit-global-prompt"',
    );
    expect(source).toContain("buildTextEditGlobalPrompt(isTextEditOperation)");
  });

  it("正向与负面两段都被接进去，不能只接一半", () => {
    /**
     * ⚠️⚠️ 这条是本用例的核心价值。
     * 只接 positive 不接 negative（或反之）是最典型的半吊子状态：
     * 出图会有部分改善，看起来"生效了"，于是没人会再查另一半。
     */
    const source = readSourceWithoutComments();
    expect(source).toContain("textEditGlobalPrompt.positive");
    expect(source).toContain("textEditGlobalPrompt.negative");
  });

  it("注入点选在两条出口共用的变量上，而非各改一处", () => {
    /**
     * VOD 链与 OpenAI 链分别从 textEditInstruction / textEditNegativeInstruction
     * 取值。断言这两个变量各自只被声明一次，保证注入点是收口处。
     * 📌 若将来有人复制出第二个 textEditInstruction，这条会红。
     */
    const source = readSourceWithoutComments();
    const positiveDecl = source.match(/let textEditInstruction\s*=/g) || [];
    const negativeDecl =
      source.match(/const textEditNegativeInstruction\s*=/g) || [];
    expect(positiveDecl).toHaveLength(1);
    expect(negativeDecl).toHaveLength(1);
  });

  it("两条链路都仍在消费这两个变量", () => {
    /**
     * 计数断言而非 toContain：同一模式出现多次时 toContain 会让变异漏网
     * —— 删掉其中一条链路的引用，toContain 依然通过。
     */
    const source = readSourceWithoutComments();
    const positiveUses =
      source.match(/^\s*textEditInstruction,\s*$/gm) || [];
    const negativeUses =
      source.match(/^\s*textEditNegativeInstruction,\s*$/gm) || [];
    expect(positiveUses.length).toBeGreaterThanOrEqual(2);
    expect(negativeUses.length).toBeGreaterThanOrEqual(2);
  });

  it("语种提示接在 renderTargetText 上，而非静态全局层", () => {
    /**
     * ⚠️ 若有人图省事把语种提示塞进 TEXT_EDIT_GLOBAL_POSITIVE_PROMPT，
     * 就只能写死"一行中文"，多区域批量替换必错。这条把接线位置锁死。
     */
    const source = readSourceWithoutComments();
    expect(source).toContain("buildTextEditLanguageHint(renderTargetText)");
    expect(TEXT_EDIT_GLOBAL_POSITIVE_PROMPT).not.toContain("一行");
  });

  it("作用域被 isTextEditOperation 夹住，不会污染文生图/抠图/扩图", () => {
    /**
     * ⚠️⚠️⚠️ 最重要的一条边界。
     * text_edit 是保真任务，文生图是创作任务，二者目标互相冲突。
     * 全局层一旦无差别注入，改个字会连带整图重打光。
     */
    const source = readSourceWithoutComments();
    expect(source).toContain("buildTextEditGlobalPrompt(isTextEditOperation)");
    // 不允许出现无条件启用的写法
    expect(source).not.toContain("buildTextEditGlobalPrompt(true)");
  });
});
