/**
 * 全站字体栈 —— 防护测试（2026-09-14 新增）
 *
 * ## 这件事为什么要做
 *
 * 用户反馈：Windows 电脑上打开站点，字是**带衬线的**（像宋体），
 * 而 macOS 上是正常的无衬线。要求对标 apple.com 在 Windows 上的显示效果。
 *
 * 根因不是「少了某个字体」，而是原来的字体栈
 * `'Inter', system-ui, sans-serif` 里：
 *   1. **Inter 从未被加载** —— index.html 没有任何字体 <link>，
 *      也没有装 @fontsource 包，所以这个名字自始至终是空头支票；
 *   2. 于是实际生效的是 `system-ui`，而 system-ui 的解析结果
 *      **由操作系统决定，不由我们决定** —— 在中文 Windows 上它可能落到
 *      微软雅黑（西文字形干瘪），部分环境甚至回退到**宋体（衬线）**。
 *
 * 📌 判据：**凡是对排版有要求的站点，都不能把最终字形交给 `system-ui` 去猜。**
 *    必须把中西文字体分别点名，西文在前、中文在后。
 *
 * ## 本文件锁住的四条意图
 *
 * 1. 字体栈里**绝不能出现衬线体**（宋体 / SimSun / serif 等）—— 那正是 bug 本身；
 * 2. 必须**显式点名中文字体**，不能只靠 system-ui 兜底；
 * 3. `index.html` 的内联兜底与 `index.css` 的 --font-sans **必须一致**，
 *    否则首帧和后续渲染会用两套字体，出现闪烁；
 * 4. CSS 里**不得再出现写死的字体名**，所有出口都要走 CSS 变量 ——
 *    这份文件有 14 处 font-family，只改一处等于没改。
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const CSS_PATH = path.join(process.cwd(), "client/src/index.css");
const HTML_PATH = path.join(process.cwd(), "client/index.html");

const css = fs.readFileSync(CSS_PATH, "utf8");
const html = fs.readFileSync(HTML_PATH, "utf8");

/** 剥掉 CSS 注释 —— 注释里大量提到「宋体」「serif」等词，不剥会污染断言。 */
function stripCssComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** 取 --font-sans 的值（从 @theme 块里）。 */
function extractFontSans(src: string): string {
  const m = stripCssComments(src).match(/--font-sans:\s*([^;]+);/);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

describe("字体栈 — 绝不能出现衬线体", () => {
  it("⭐⭐ --font-sans 里不得包含任何衬线字体（这就是用户报的 bug）", () => {
    const stack = extractFontSans(css);
    // 正向确认确实取到了值，否则下面的反向断言全是空转。
    expect(stack.length).toBeGreaterThan(50);

    const serifNames = [
      "SimSun",
      "宋体",
      "NSimSun",
      "Songti",
      "STSong",
      "Times New Roman",
      "Georgia",
      "Cambria",
    ];
    for (const name of serifNames) {
      expect(stack).not.toContain(name);
    }
    // 独立的 serif 关键字（注意不能误伤 sans-serif）。
    expect(stack).not.toMatch(/(^|[,\s])serif\s*$/);
    expect(stack).not.toMatch(/(^|[,\s])serif\s*,/);
  });

  it("⭐ 必须以 sans-serif 收尾（最终兜底不能落到浏览器默认的宋体）", () => {
    expect(extractFontSans(css).trim()).toMatch(/sans-serif$/);
  });
});

describe("字体栈 — 必须显式点名，不能交给 system-ui 去猜", () => {
  /*
   * 反向断言。没有这条，把字体栈写回 `system-ui, sans-serif` 也能通过
   * 上面「不含衬线体」的检查 —— 但那恰恰是 bug 的原始形态。
   */
  it("⭐⭐ 不得退回裸 system-ui 方案（bug 的原始形态）", () => {
    const stack = extractFontSans(css);
    expect(stack).not.toMatch(/^\s*system-ui\s*,\s*sans-serif\s*$/);
  });

  it("⭐ 必须显式列出中文字体，Windows 与 macOS 都要覆盖", () => {
    const stack = extractFontSans(css);
    // Windows 中文
    expect(stack).toContain("Microsoft YaHei");
    // macOS 中文
    expect(stack).toContain("PingFang SC");
  });

  it("⭐ 必须显式列出西文字体，Windows 与 macOS 都要覆盖", () => {
    const stack = extractFontSans(css);
    // macOS / iOS 的 San Francisco
    expect(stack).toContain("-apple-system");
    // Windows 西文
    expect(stack).toContain("Segoe UI");
  });

  it("⭐ 西文字体必须排在中文字体之前（否则西文会被中文字体的西文部分接管）", () => {
    const stack = extractFontSans(css);
    const segoe = stack.indexOf("Segoe UI");
    const yahei = stack.indexOf("Microsoft YaHei");
    expect(segoe).toBeGreaterThan(-1);
    expect(yahei).toBeGreaterThan(-1);
    expect(segoe).toBeLessThan(yahei);
  });

  it("不得再声称使用未加载的 Inter（空头支票会让人误以为字体已生效）", () => {
    // 项目没有引入任何 Inter 字体资源，CSS 里就不该再写这个名字。
    const hasFontResource =
      /@font-face/.test(stripCssComments(css)) ||
      /fonts\.(googleapis|gstatic)/.test(html) ||
      /fontsource/.test(html);
    if (!hasFontResource) {
      expect(stripCssComments(css)).not.toContain("'Inter'");
    }
  });
});

describe("⭐⭐ 首帧兜底 — HTML 内联与 CSS 变量必须一致", () => {
  /*
   * 外部 CSS 到位前浏览器已经开始绘制，中文 Windows 的默认字体是宋体。
   * 少了这段内联样式，用户会看到衬线字闪一下再跳成无衬线。
   */
  it("index.html 必须内联 font-family 兜底", () => {
    expect(html).toContain("font-family");
    expect(html).toContain("Microsoft YaHei");
    expect(html).toContain("-apple-system");
  });

  it("⭐⭐ 内联兜底与 --font-sans 的字体清单必须逐项一致（防两处各改各的）", () => {
    const cssStack = extractFontSans(css);

    const styleBlock = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleBlock).not.toBeNull();
    const htmlStack = (styleBlock![1].match(/font-family:\s*([^;]+);/) || [])[1];
    expect(htmlStack).toBeTruthy();

    const normalize = (s: string) =>
      s
        .replace(/\s+/g, " ")
        .split(",")
        .map((x) => x.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);

    expect(normalize(htmlStack!)).toEqual(normalize(cssStack));
  });
});

describe("⭐⭐ 出口收敛 — 不许再有写死的字体名", () => {
  /*
   * 这份 CSS 里有 14 处 font-family。本项目反复踩过「同一份数据多个出口」的坑：
   * 只改一处，功能等于没做，而且全程零报错。
   */
  it("index.css 里所有 font-family 都必须走 CSS 变量", () => {
    const code = stripCssComments(css);
    // 排除 @theme 里定义变量本身的那两行。
    const decls = [...code.matchAll(/(?<!-)font-family:\s*([^;]+);/g)].map(
      (m) => m[1].trim(),
    );
    // 正向确认确实扫到了声明，否则断言空转。
    expect(decls.length).toBeGreaterThan(10);
    for (const d of decls) {
      expect(d).toMatch(/^var\(--font-(sans|mono)\)$/);
    }
  });

  it("等宽字体栈同样不得落到 Courier New（Windows 上观感偏衬线）", () => {
    const m = stripCssComments(css).match(/--font-mono:\s*([^;]+);/);
    expect(m).not.toBeNull();
    const stack = m![1].replace(/\s+/g, " ");
    expect(stack).not.toContain("Courier");
    expect(stack.trim()).toMatch(/monospace$/);
  });
});
