import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-09-13 用户反馈：充值标签下三张卡的绿色充值按钮没有对齐，
 * 左边第一张明显比另外两张高一截。
 *
 * 根因不是间距写错了，而是**布局模型选错**：
 * `article` 当时是普通块级流、权益列表用固定的 `min-h-[92px]`，
 * 按钮位置于是完全跟着上方内容的实际高度走。
 * 「可兑换 X 积分 · Y 积分/HKD」这行在第一张卡占一行、后两张换行占两行，
 * 一行的高度差就直接传导到了按钮上。
 * `min-h-[480px]` 只锁卡片外框总高，**锁不住内部元素的垂直位置**。
 *
 * 正解是订阅卡早就在用的写法：article 用 flex flex-col，
 * 权益列表用 flex-1 吸收剩余空间，把按钮挤到底部。
 *
 * 这类纯 CSS 的对齐问题没有运行时报错、单看代码也很自然，
 * 极容易在后续重构中被无意改回去，所以锁住。
 */
describe("计费卡片底部按钮对齐（2026-09-13 回归锁）", () => {
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

  /** 取充值标签那段（从 activeTab === "recharge" 到文件末尾的 section 结束） */
  const rechargeBlock = () => {
    const src = stripComments(source());
    const start = src.indexOf('activeTab === "recharge"');
    expect(start).toBeGreaterThan(0);
    return src.slice(start);
  };

  it("充值卡是 flex 纵向容器，不是普通块级流", () => {
    const block = rechargeBlock();
    // article 必须同时具备 flex 与 flex-col，缺一个 flex-1 都不生效。
    const articleClass = block.match(/className="([^"]*min-h-\[480px\][^"]*)"/);
    expect(articleClass, "没找到充值卡 article 的 className").toBeTruthy();
    expect(articleClass![1]).toContain("flex");
    expect(articleClass![1]).toContain("flex-col");
  });

  it("权益列表用 flex-1 吸收剩余空间，把按钮压到底部", () => {
    const block = rechargeBlock();
    expect(block).toMatch(/<ul className="mt-4 flex-1 space-y-2"/);
  });

  it("不得退回固定最小高的写法（正是 bug 时期的写法）", () => {
    // 反向断言：min-h-[92px] 让按钮位置跟着内容高度走，是这次对齐问题的直接原因。
    // 必须在剥注释后的源码上断言，否则会命中上面解释「为什么不能这样写」的注释。
    const block = rechargeBlock();
    expect(block).not.toContain("min-h-[92px]");
  });

  it("订阅卡与充值卡用同一套底部对齐方案", () => {
    // 两处卡片视觉上并列，布局模型分家迟早会再次跑偏。
    const src = stripComments(source());
    const articleClasses = src.match(/className="[^"]*min-h-\[480px\][^"]*"/g) || [];
    // 订阅卡 + 充值卡，各一处
    expect(articleClasses.length).toBe(2);
    for (const cls of articleClasses) {
      expect(cls, `卡片缺少 flex flex-col：${cls}`).toContain("flex");
      expect(cls, `卡片缺少 flex-col：${cls}`).toContain("flex-col");
    }
    // 两张卡的权益列表都必须是 flex-1
    expect((src.match(/<ul className="mt-4 flex-1 /g) || []).length).toBe(2);
  });

  it("剥注释不会误删真实代码（上面几条断言的前置保障）", () => {
    const raw = source();
    const stripped = stripComments(raw);
    // 锚点必须是「只可能出现在代码里」的完整片段。
    // 早先这里锚的是裸 min-h-[480px]，结果命中了本次新写的解释性注释
    // （注释里恰好提到「min-h-[480px] 只锁卡片外框总高」），
    // 剥离后计数从 3 变 2，把一次正确的剥离误判成误删。
    const countIn = (text: string) =>
      (text.match(/className="flex min-h-\[480px\] flex-col/g) || []).length;
    expect(countIn(raw)).toBe(2);
    expect(countIn(stripped)).toBe(countIn(raw));
    expect(stripped.length).toBeLessThan(raw.length);
    // 确认剥离确实生效：本次新写的 JSX 注释关键词必须已消失
    expect(stripped).not.toContain("充值按钮必须三张卡底部对齐");
  });
});
