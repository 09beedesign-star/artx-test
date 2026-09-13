import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-09-13 用户反馈：订阅卡右上角的「已选择」徽标要去掉，
 * 理由是「这会使整个 UI 布局不稳定」。
 *
 * 根因不是徽标本身丑，而是它和标题在同一个 flex 行里抢宽度：
 * 「已选择」三个字放不下就把自己挤成两行（「已选」/「择」），
 * 连带把 "Studio 工作室版" 这种长名字也压成两行，
 * 整张卡的头部高度直接翻倍 —— 而它又是跟着鼠标点选实时出现/消失的，
 * 于是用户每点一张卡，卡片就跳一次。
 *
 * 所以这里锁两件事，缺一不可：
 * 1. 徽标不再表达「点选」这种临时交互状态（只留账户既成事实）；
 * 2. 剩下的徽标文案永远不许折行 —— 否则换个四字文案会原样复发。
 *
 * 第 2 条尤其重要：只删「已选择」是治标，「当前套餐」「不可降级」
 * 同样是四个字，同样会被压成两行。
 */
describe("订阅卡徽标不得破坏头部布局（2026-09-13 回归锁）", () => {
  const source = () =>
    readFileSync(resolve(__dirname, "BillingPage.tsx"), "utf-8");

  /**
   * 只剥「整行都是块注释」的形态。
   * 通用的 /\/\*[\s\S]*?\*\//g 会被源码里的正则字面量、字符串中的 `/*` 带偏，
   * 一路贪婪吞掉真实代码，让断言在残缺源码上假通过。
   */
  const stripComments = (src: string) =>
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
      .replace(/^\s*\/\/.*$/gm, "");

  /** planBadge 那条三元链（从声明到分号结束） */
  const badgeExpression = () => {
    const src = stripComments(source());
    const start = src.indexOf("const planBadge");
    expect(start, "没找到 planBadge 声明").toBeGreaterThan(0);
    const end = src.indexOf(";", start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  it("徽标文案里不再有「已选择」", () => {
    // 反向断言。必须在剥注释后的源码上做，
    // 否则会命中上面解释「为什么删掉」的注释而恒挂。
    const src = stripComments(source());
    expect(src).not.toContain("已选择");
  });

  it("徽标不跟随 isSelected（点选是临时状态，不该改变布局）", () => {
    // 锚在 planBadge 表达式内部，而不是全文件 —— isSelected 在按钮配色处
    // 仍然合法使用，全文件断言会误伤。
    expect(badgeExpression()).not.toContain("isSelected");
  });

  it("徽标仍然表达账户既成事实（不是把功能整个删了）", () => {
    const expression = badgeExpression();
    expect(expression).toContain("当前套餐");
    expect(expression).toContain("不可降级");
    expect(expression).toContain("推荐");
  });

  it("徽标永不折行——换个四字文案也不会复发", () => {
    const src = stripComments(source());
    // ⚠️ 不能直接 match 第一个 radius-pill：页头 :833 另有一个 pill 元素，
    // 全文件匹配会命中它，报出「缺 whitespace-nowrap」的假失败。
    // 正确做法是从渲染 {planBadge} 的位置往回找它自己的 span 开标签。
    const badgeUsage = src.indexOf("{planBadge || ");
    expect(badgeUsage, "没找到徽标的渲染位置").toBeGreaterThan(0);
    const spanStart = src.lastIndexOf("<span", badgeUsage);
    expect(spanStart).toBeGreaterThan(0);
    const badgeSpan = src.slice(spanStart, badgeUsage);
    expect(badgeSpan).toContain("whitespace-nowrap");
    expect(badgeSpan).toContain("shrink-0");
  });

  it("标题侧可收缩，挤压不会全部转嫁给徽标", () => {
    // flex 子项默认 min-width:auto，不加 min-w-0 文本块不肯让步。
    const src = stripComments(source());
    const headerStart = src.indexOf(
      'className="mb-4 flex items-start justify-between gap-3"'
    );
    expect(headerStart, "没找到卡片头部容器").toBeGreaterThan(0);
    const headerBlock = src.slice(headerStart, headerStart + 600);
    expect(headerBlock).toContain('className="min-w-0"');
  });

  it("剥注释不会误删真实代码（上面几条断言的前置保障）", () => {
    const raw = source();
    const stripped = stripComments(raw);
    // 锚点必须是「只可能出现在代码里」的完整片段，不能是注释里也会
    // 自然提到的裸关键词（否则解释性注释会让计数对不上，把一次正确的
    // 剥离误判成误删）。
    const countIn = (text: string) =>
      (text.match(/const planBadge = isCurrentSubscribedPlan/g) || []).length;
    expect(countIn(raw)).toBe(1);
    expect(countIn(stripped)).toBe(countIn(raw));
    expect(stripped.length).toBeLessThan(raw.length);
    // 确认剥离确实生效：本次新写的注释关键词必须已消失
    expect(stripped).not.toContain("徽标宁可占满自己的宽度");
  });
});
