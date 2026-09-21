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
 *
 * ⚠️ 2026-09-15 卡片被抽到 components/billing/ 下的共享组件里
 * （页面和画布充值弹窗共用），锚点跟着搬过来了。
 * 同时，卡片高度从「写死 min-h-[480px]」改成「compact 时不锁高」——
 * 弹窗里空间更紧，锁 480 会把内容顶出屏幕。
 * 所以断言不再数 min-h-[480px] 的字面量个数（那只是页面形态的表现），
 * 改为守真正决定对齐的那套机制：flex flex-col 容器 + flex-1 权益列表。
 * 这两条才是「按钮贴底」的充要条件，换成弹窗形态依然成立。
 */
describe("计费卡片底部按钮对齐（2026-09-13 回归锁）", () => {
  const readPanel = (file: string) =>
    readFileSync(
      resolve(__dirname, "../components/billing", file),
      "utf-8",
    );

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

  const rechargeSource = () => stripComments(readPanel("RechargePanel.tsx"));
  const subscriptionSource = () =>
    stripComments(readPanel("SubscriptionPanel.tsx"));

  /** 取出卡片 article 的 className 表达式（含 compact 三元）。 */
  const cardClassExpression = (src: string) => {
    const marker = "<article";
    const start = src.indexOf(marker);
    expect(start, "没找到卡片 article").toBeGreaterThan(0);
    const classAt = src.indexOf("className=", start);
    expect(classAt).toBeGreaterThan(start);
    // className={`...`} 形式，取到反引号结束。
    const end = src.indexOf("`}", classAt);
    expect(end, "卡片 className 不是模板字符串形式").toBeGreaterThan(classAt);
    return src.slice(classAt, end + 2);
  };

  it("充值卡是 flex 纵向容器，不是普通块级流", () => {
    const cls = cardClassExpression(rechargeSource());
    // flex 与 flex-col 缺一个，下面的 flex-1 都不生效。
    expect(cls).toContain("flex");
    expect(cls).toContain("flex-col");
  });

  it("权益列表用 flex-1 吸收剩余空间，把按钮压到底部", () => {
    expect(rechargeSource()).toMatch(/<ul className="mt-4 flex-1 space-y-2"/);
  });

  it("不得退回固定最小高的写法（正是 bug 时期的写法）", () => {
    // 反向断言：min-h-[92px] 让按钮位置跟着内容高度走，是这次对齐问题的直接原因。
    // 必须在剥注释后的源码上断言，否则会命中上面解释「为什么不能这样写」的注释。
    expect(rechargeSource()).not.toContain("min-h-[92px]");
  });

  it("订阅卡与充值卡用同一套底部对齐方案", () => {
    // 两处卡片视觉上并列，布局模型分家迟早会再次跑偏。
    for (const [name, src] of [
      ["充值卡", rechargeSource()],
      ["订阅卡", subscriptionSource()],
    ] as const) {
      const cls = cardClassExpression(src);
      expect(cls, `${name}缺少 flex`).toContain("flex");
      expect(cls, `${name}缺少 flex-col`).toContain("flex-col");
      // 权益列表吸收剩余空间，这是按钮贴底的关键。
      expect(
        src.match(/<ul className="mt-4 flex-1 /g)?.length,
        `${name}的权益列表不是 flex-1`,
      ).toBe(1);
    }
  });

  it("页面形态仍然锁住 480 最小高（弹窗形态才放开）", () => {
    /*
      compact 是弹窗专用的放宽开关。守住「非 compact 时仍有 min-h-[480px]」，
      免得有人图省事把它一删了事 —— 那样页面上三张卡会各自缩到内容高度，
      并排起来参差不齐，等于把 2026-09-13 修的问题换个形式放回来。
    */
    for (const [name, src] of [
      ["充值卡", rechargeSource()],
      ["订阅卡", subscriptionSource()],
    ] as const) {
      const cls = cardClassExpression(src);
      expect(cls, `${name}丢了页面形态的 min-h-[480px]`).toContain(
        "min-h-[480px]",
      );
      expect(cls, `${name}的 480 最小高没有跟 compact 挂钩`).toContain(
        "compact",
      );
    }
  });

  it("剥注释不会误删真实代码（上面几条断言的前置保障）", () => {
    for (const file of ["RechargePanel.tsx", "SubscriptionPanel.tsx"]) {
      const raw = readPanel(file);
      const stripped = stripComments(raw);
      // 锚点必须是「只可能出现在代码里」的完整片段。
      // 早先这里锚的是裸 min-h-[480px]，结果命中了解释性注释
      // （注释里恰好提到「min-h-[480px] 只锁卡片外框总高」），
      // 剥离后计数变少，把一次正确的剥离误判成误删。
      const countIn = (text: string) =>
        (text.match(/compact \? "" : "min-h-\[480px\]"/g) || []).length;
      expect(countIn(raw), `${file} 没找到卡片高度表达式`).toBe(1);
      expect(countIn(stripped), `${file} 剥注释误删了真实代码`).toBe(
        countIn(raw),
      );
      expect(stripped.length, `${file} 剥注释没生效`).toBeLessThan(raw.length);
    }
    // 确认剥离确实生效：RechargePanel 里那段解释性注释必须已消失
    expect(stripComments(readPanel("RechargePanel.tsx"))).not.toContain(
      "充值按钮必须三张卡底部对齐",
    );
  });
});
