import { describe, expect, it } from "vitest";
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../shared/strip-source-comments";

/**
 * 这个文件测的是**检测器的地基**。
 *
 * 十几个源码断言测试全都依赖 stripSourceComments。
 * 它一旦误吃代码，那些测试里的 not.toContain 会**集体恒绿** ——
 * 全线飘绿，但一扇门都没在守。
 * 所以这里的用例不是"顺便测一下工具函数"，而是整套源码断言的底座。
 */
describe("stripSourceComments", () => {
  it("removes standalone block comments", () => {
    const source = [
      "const a = 1;",
      "/**",
      " * 说明",
      " */",
      "const b = 2;",
    ].join("\n");
    const stripped = stripSourceComments(source);
    expect(stripped).not.toContain("说明");
    expect(stripped).toContain("const a = 1;");
    expect(stripped).toContain("const b = 2;");
  });

  it("removes indented block comments", () => {
    const source = ["function f() {", "  /* 内部说明 */", "  return 1;", "}"].join("\n");
    const stripped = stripSourceComments(source);
    expect(stripped).not.toContain("内部说明");
    expect(stripped).toContain("return 1;");
  });

  it("removes line comments", () => {
    const stripped = stripSourceComments("const a = 1; // 这是注释\nconst b = 2;");
    expect(stripped).not.toContain("这是注释");
    expect(stripped).toContain("const a = 1;");
    expect(stripped).toContain("const b = 2;");
  });

  it("keeps urls that contain //", () => {
    const stripped = stripSourceComments('const u = "https://example.com/api";');
    expect(stripped).toContain("https://example.com/api");
  });

  /**
   * JSX 注释的行首是 `{` 不是 `/*`，只按行首匹配块注释会整段漏掉。
   * 实测后果：CreditsGuidePage.tsx 的 JSX 注释里写了示例数字 85,000，
   * 漏剥之后「源码里不许出现 85,000」这条断言直接假阳性 ——
   * 一个本来完全正确的实现（用的是 quoteCreditRecharge 现算）被判成硬编码违规。
   * 📌 判据：误报和漏报一样致命，只是误报吵、漏报静。
   */
  it("removes jsx comments written as {/* ... */}", () => {
    const source = [
      "<span>",
      "  {/* 直接给 85,000 更直观 */}",
      "  {formatCredits(quote(tier).credits)}",
      "</span>",
    ].join("\n");
    const stripped = stripSourceComments(source);
    expect(stripped).not.toContain("85,000");
    expect(stripped).toContain("formatCredits(quote(tier).credits)");
    // 不能只吃掉注释文字却留下孤儿花括号，那会干扰按结构匹配的断言。
    expect(stripped).not.toContain("{}");
  });

  /**
   * ⚠️⚠️⚠️ 这条守的是 JSX 规则**自己**别吃多了。
   *
   * 如果 JSX 注释正则写成 `\{\s*\/\*`（`\s` 含换行），
   * 它会把「代码块开头的 `{` 换行后跟一段 JSDoc」也当成 JSX 注释，
   * 一路贪到后面某个 `*​/}` 为止。
   * 实测在 InfiniteCanvas.tsx 上单次吞掉 171981 字符（全文件 14%），
   * 十几条接线断言的计数瞬间归零。
   * 📌 和 "image/*" 同类：正则胃口比意图大，吃错了还不报错。
   */
  it("does not treat a code block followed by jsdoc as a jsx comment", () => {
    // 样本必须真实：后面得有一个真的 JSX 注释收尾，
    // 宽松正则正是从上面的 `{` 一路贪到这里的 `*​/}`，
    // 把中间所有代码一口吞掉。没有这个收尾，样本证明不了任何事。
    const source = [
      "useEffect(() => {",
      "  /**",
      "   * 说明文字",
      "   */",
      "  const KEEP_ME = focusCanvasCenter(center);",
      "  return () => {};",
      "}, [focusCanvasCenter]);",
      "",
      "const view = <div>{/* 真正的 JSX 注释 */}</div>;",
    ].join("\n");
    const stripped = stripSourceComments(source);

    // 夹在 { 和 } 之间的真代码一个都不能少。
    expect(stripped).toContain("const KEEP_ME = focusCanvasCenter(center);");
    expect(stripped).toContain("[focusCanvasCenter]");
    expect(stripped).not.toContain("说明文字");

    // 对照：含换行的宽松写法会把中间这段代码吃掉。
    // 这行证明上面的断言确实能分辨两种实现，不是摆设。
    const loose = source.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
    expect(loose).not.toContain("const KEEP_ME = focusCanvasCenter(center);");
  });

  // 真实的 JSX 注释一定是 `{/*` 紧邻的（Prettier 也这么格式化），
  // 换行的那种不是 JSX 注释，是代码块 + JSDoc，见上一条用例。
  it("removes multi-line jsx comments", () => {
    const source = [
      "  {/*",
      "    多行说明，里面提到 85,000",
      "  */}",
      "  const keep = 1;",
    ].join("\n");
    const stripped = stripSourceComments(source);
    expect(stripped).not.toContain("85,000");
    expect(stripped).toContain("const keep = 1;");
  });

  /**
   * ⚠️⚠️⚠️ 这条是整个文件存在的理由。
   *
   * 旧实现 /\/\*[\s\S]*?\*\//g 会把 "image/*" 里的 /* 当成块注释开头，
   * 一路吞到后面第一个 *​/ 为止。在 server/index.ts 上实测吞掉 43.6%。
   * 被吞掉的代码对断言来说不存在 → 那些 not.toContain 全部恒绿。
   */
  it("does not treat mime strings like image/* as a block comment", () => {
    const source = [
      'app.post("/api/images", upload({ accept: "image/*", limit: "1mb" }), handler);',
      'const KEEP_ME = "runBackgroundImageTask(req.body, user)";',
      "const tail = 1; /* 真注释 */",
    ].join("\n");
    const stripped = stripSourceComments(source);

    // 夹在两个 /* ... */ 之间的代码绝不能消失。
    expect(stripped).toContain("runBackgroundImageTask(req.body, user)");
    expect(stripped).toContain('accept: "image/*"');

    // 对照：旧的贪心实现在同一段输入上会把中间那行吃掉。
    // 这行不是装饰，它证明上面的断言确实能区分新旧实现。
    const legacy = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(legacy).not.toContain("runBackgroundImageTask(req.body, user)");
  });

  it("keeps video/* and application/* strings too", () => {
    const source = 'const accepts = ["video/*", "application/*"]; const after = "still here";';
    const stripped = stripSourceComments(source);
    expect(stripped).toContain("still here");
    expect(stripped).toContain("video/*");
  });
});

describe("assertStripKeptSource", () => {
  it("passes when the strip keeps most of the source", () => {
    const raw = "x".repeat(1000);
    expect(() => assertStripKeptSource(raw, "x".repeat(900))).not.toThrow();
  });

  it("throws when the strip eats too much source", () => {
    const raw = "x".repeat(1000);
    expect(() => assertStripKeptSource(raw, "x".repeat(500))).toThrow(/吃掉了/);
  });

  it("throws on empty input instead of silently passing", () => {
    // 📌 读文件路径写错时 raw 是空串，除法会得到 NaN / -Infinity，
    //    不显式拦住的话这个自检会"静默通过"—— 又一个恒绿的检测器。
    expect(() => assertStripKeptSource("", "")).toThrow(/原始源码为空/);
  });

  /**
   * 用真实的 server/index.ts 当样本：它是全项目受旧实现伤害最重的文件。
   * 📌 判据：拿合成样本测"能过"没意义，必须拿真实的坏样本测"能拦住"。
   */
  it("would have caught the legacy implementation on server/index.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const raw = readFileSync(resolve(__dirname, "index.ts"), "utf-8");

    // 新实现：过。
    expect(() => assertStripKeptSource(raw, stripSourceComments(raw))).not.toThrow();

    // 旧实现：必须被拦住。
    const legacy = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(() => assertStripKeptSource(raw, legacy)).toThrow(/吃掉了/);
  });
});
