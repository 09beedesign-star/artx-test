/**
 * 首页公告弹窗回归测试
 *
 * ⚠️ 本项目历史教训：「测纯函数 ≠ 测修复」。
 * 这个弹窗真正会坏的地方不在纯函数里，而在四个「改了也不报错」的位置：
 *   ① 有人给透明遮罩补一行 pointerEvents:"none" → 阻断彻底失效，页面看着完全正常
 *   ② 有人顺手加 Esc 关闭 / 自动关闭定时器 → 不再是阻断式
 *   ③ 有人给遮罩加回黑色背景 → 违反「不要黑色蒙层」的明确要求
 *   ④ 换弹窗时只改了文案没改 id → 老用户永远看不到新内容
 * 因此本文件的核心是**源码断言**，并且每条反向断言都配了正向锚点，
 * 避免「文件路径写错 / 正则吃掉源码」导致的恒绿。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  stripSourceComments,
  assertStripKeptSource,
} from "../../../../shared/strip-source-comments";

const REPO_ROOT = resolve(__dirname, "../../../..");

const MODAL_PATH = "client/src/components/announcement/AnnouncementModal.tsx";
const CONTENT_PATH = "client/src/components/announcement/announcement-content.ts";
const GATE_PATH = "client/src/components/announcement/announcement-gate.ts";
const SEEN_PATH = "client/src/components/announcement/announcement-seen-store.ts";
const HOME_PATH = "client/src/pages/HomePage.tsx";
const PROVIDER_PATH = "client/src/components/onboarding/OnboardingProvider.tsx";

/**
 * 这几个文件是「小文件 + 大段设计说明」，注释天然占比高。
 * 实测（两套独立口径互相印证，差值均 < 2 个百分点）：
 *   announcement-content.ts    正则 53.3% / 逐行 53.3%
 *   announcement-gate.ts       正则 47.1% / 逐行 47.1%
 *   announcement-seen-store.ts 正则 37.7% / 逐行 36.7%
 *   AnnouncementModal.tsx      正则 15.4% / 逐行 16.2%
 * 两个口径吻合 ⇒ 是注释真的多，不是正则把源码吃跑了。
 *
 * ⚠️ 所以这里**只放宽本调用点的阈值，绝不改 assertStripKeptSource 的默认值 0.3**
 *    —— 默认值是全仓其它测试共用的护栏，动它等于替所有文件把门拆了。
 * ⚠️ 同时保留一次「锚点幸存」正向自检：万一将来正则真的退化，
 *    比例检查可能仍在阈值内，但锚点会消失，下面所有反向断言会恒绿。
 */
const MAX_COMMENT_RATIO = 0.6;

function readCode(relativePath: string): string {
  const raw = readFileSync(resolve(REPO_ROOT, relativePath), "utf-8");
  const stripped = stripSourceComments(raw);
  // 自检：剥离器一旦退化，下面所有 not.toContain 会静默恒绿
  assertStripKeptSource(raw, stripped, MAX_COMMENT_RATIO);
  return stripped;
}

/* ───────────────── 检测器自检（必须排在最前）───────────────── */

describe("注释剥离器自检", () => {
  it("剥离后关键代码锚点仍然存在（否则下面的反向断言全是恒绿）", () => {
    // 📌 这条是「检测器能检测出自己失效」的那一环。
    //    阈值放宽到 0.6 后，光看比例已经不足以发现正则退化，
    //    必须用真实代码锚点兜住。
    const gate = readCode(GATE_PATH);
    expect(gate).toContain("listeners.forEach");

    const modal = readCode(MODAL_PATH);
    expect(modal).toContain("onClick={onClose}");
    expect(modal).toContain("createPortal");

    const seen = readCode(SEEN_PATH);
    expect(seen).toContain("window.localStorage");
  });

  it("剥离确实吃掉了注释（不是原样返回，否则反向断言会恒红/失真）", () => {
    const raw = readFileSync(resolve(REPO_ROOT, GATE_PATH), "utf-8");
    const stripped = stripSourceComments(raw);
    expect(stripped.length).toBeLessThan(raw.length);
    // 注释里出现过的字眼，剥离后不该还在
    expect(raw).toContain("唯一事实源");
    expect(stripped).not.toContain("唯一事实源");
  });
});

/* ───────────────── 阻断式的三个必要条件 ───────────────── */

describe("AnnouncementModal 阻断语义", () => {
  it("遮罩层不得放行点击穿透", () => {
    const code = readCode(MODAL_PATH);
    // 正向锚点：先证明我们确实读到了遮罩层的样式块
    expect(code).toContain("position: \"fixed\"");
    expect(code).toContain("inset: 0");
    // 反向断言：整个组件里不允许出现 pointerEvents: "none"
    expect(code).not.toContain("pointerEvents: \"none\"");
    expect(code).not.toContain("pointerEvents: 'none'");
    expect(code).not.toContain("pointer-events: none");
  });

  it("不得有自动关闭定时器", () => {
    const code = readCode(MODAL_PATH);
    expect(code).not.toContain("setTimeout");
    expect(code).not.toContain("setInterval");
  });

  it("不得响应 Esc 关闭", () => {
    const code = readCode(MODAL_PATH);
    expect(code).not.toContain("Escape");
    expect(code).not.toContain("keydown");
  });

  it("遮罩自身不得绑 onClick（点空白处不关闭）", () => {
    const code = readCode(MODAL_PATH);
    // 正向锚点：onClick 确实存在（两个按钮各一个）
    expect(code).toContain("onClick={onClose}");
    // 且**恰好两个**：右上角 ✕ 与右下角绿色按钮，多出来的就是遮罩或其它出口
    const onClickCount = (code.match(/onClick=\{onClose\}/g) ?? []).length;
    expect(onClickCount).toBe(2);
  });
});

/* ───────────────── 不要黑色蒙层 ───────────────── */

describe("AnnouncementModal 视觉约束", () => {
  it("遮罩层必须是透明的，不得出现黑色蒙层", () => {
    const code = readCode(MODAL_PATH);
    expect(code).toContain("background: \"transparent\"");
    /**
     * ⚠️ 这里只能查「遮罩层自己的 background」，不能全文禁 rgba(0,0,0,...)：
     *    卡片的 boxShadow 合法地用了 rgba(0,0,0,0.65)，
     *    一刀切会让这条断言变成恒红，逼着后人把它删掉 —— 那才是真的失守。
     * 做法：只看 zIndex 到第一个闭合之间的遮罩样式块。
     */
    const overlayStart = code.indexOf("zIndex: 2147483000");
    expect(overlayStart).toBeGreaterThan(-1);
    const overlayBlock = code.slice(overlayStart, overlayStart + 400);
    expect(overlayBlock).toContain("background: \"transparent\"");
    expect(overlayBlock).not.toMatch(/background:\s*"rgba\(0/);
    expect(overlayBlock).not.toMatch(/background:\s*"#0/);
    // backdropFilter / tailwind 黑蒙层在全文件范围内都不该出现
    expect(code).not.toContain("backdropFilter");
    expect(code).not.toContain("bg-black/");
  });

  it("保留右下角绿色按钮与右上角关闭按钮这两个常驻元素", () => {
    const code = readCode(MODAL_PATH);
    expect(code).toContain("#BAFF2E");
    expect(code).toContain("aria-label=\"关闭弹窗\"");
    expect(code).toContain("content.actionLabel");
  });
});

/* ───────────────── 内容抽离 ───────────────── */

describe("弹窗内容与骨架分离", () => {
  it("骨架文件里不得硬编码任何业务文案", () => {
    const code = readCode(MODAL_PATH);
    // 正向锚点：骨架确实在消费外部内容
    expect(code).toContain("content.title");
    expect(code).toContain("content.body");
    expect(code).toContain("content.image");
    // 反向断言：当期文案不该出现在骨架里
    expect(code).not.toContain("我知道了");
    expect(code).not.toContain("ArtXStudio");
    expect(code).not.toContain("IMAGE2.5");
  });

  it("内容文件提供了全部可变字段", () => {
    const code = readCode(CONTENT_PATH);
    for (const key of ["id", "image", "title", "body", "tag", "actionLabel"]) {
      expect(code).toContain(`${key}:`);
    }
  });

  it("图片走 import 而非 public 绝对路径（换图必须换 URL）", () => {
    const code = readCode(CONTENT_PATH);
    expect(code).toContain("@/assets/announcement/");
    expect(code).not.toContain("src=\"/");
  });
});

/* ───────────────── 关闭规则与已读状态 ───────────────── */

describe("关闭规则", () => {
  it("首页把 ✕ 和「我知道了」接到同一个关闭函数", () => {
    const code = readCode(HOME_PATH);
    expect(code).toContain("handleAnnouncementClose");
    expect(code).toContain("markAnnouncementSeen(HOME_ANNOUNCEMENT.id)");
    expect(code).toContain("onClose={handleAnnouncementClose}");
  });

  it("已读状态存的是公告 id，不是布尔值（换弹窗自动重新触达）", () => {
    const code = readCode(SEEN_PATH);
    expect(code).toContain("=== announcementId");
    expect(code).not.toContain("=== \"1\"");
    expect(code).not.toContain("=== \"true\"");
  });

  it("已读读取失败时返回 false（隐私模式下仍然显示）", () => {
    const code = readCode(SEEN_PATH);
    expect(code).toMatch(/catch\s*\{\s*return false;/);
  });

  it("只用 localStorage，不碰 sessionStorage", () => {
    const code = readCode(SEEN_PATH);
    expect(code).toContain("window.localStorage");
    expect(code).not.toContain("sessionStorage");
  });
});

/* ───────────────── 与新手引导互斥 ───────────────── */

describe("与新手引导互斥", () => {
  it("闸门是可订阅的，不是裸布尔量", () => {
    const code = readCode(GATE_PATH);
    expect(code).toContain("subscribeAnnouncementBlocking");
    expect(code).toContain("listeners.forEach");
  });

  it("引导 Provider 订阅闸门并在阻断时跳过自动播放", () => {
    const code = readCode(PROVIDER_PATH);
    expect(code).toContain("useSyncExternalStore");
    expect(code).toContain("if (announcementBlocking) return;");
    // 依赖数组必须带上，否则闸门解除后不会重跑 effect
    expect(code).toContain("announcementBlocking]");
  });

  it("跳过必须发生在 attemptedRef 打标之前，否则引导会被永久吃掉", () => {
    const code = readCode(PROVIDER_PATH);
    const skipAt = code.indexOf("if (announcementBlocking) return;");
    const markAt = code.indexOf("attemptedRef.current.add(candidate.id)");
    expect(skipAt).toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(-1);
    expect(skipAt).toBeLessThan(markAt);
  });

  it("打标必须在定时器回调内，不能在排期时就写进 attemptedRef", () => {
    /**
     * 实测回归：React 子组件 effect 先于父页面执行，首页挂载那一轮
     * OnboardingProvider 读到的闸门还是旧的 false，会一路走到打标；
     * 等公告关闭时 attemptedRef 里已有 home，引导再也不播且不报错。
     * 判据：打标必须排在 setTimeout 之后（即在回调体内）。
     */
    const code = readCode(PROVIDER_PATH);
    const timerAt = code.indexOf("timerRef.current = window.setTimeout(() => {\n      if (isAnnouncementBlocking())");
    const markAt = code.indexOf("attemptedRef.current.add(candidate.id)");
    expect(timerAt).toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(timerAt);
  });

  it("定时器到点时必须再查一次闸门（防止延迟窗口内公告才弹出）", () => {
    const code = readCode(PROVIDER_PATH);
    expect(code).toContain("if (isAnnouncementBlocking()) return;");
    /**
     * 必须真的从闸门模块 import，不能只是碰巧有个同名符号。
     * ⚠️ 这里不能写成 toContain("isAnnouncementBlocking,") ——
     *    useSyncExternalStore 的参数列表里也有一模一样的串，
     *    删掉 import 之后断言依然会绿（变异自证时实测踩到过）。
     */
    const importBlock = code.slice(
      code.indexOf("import {"),
      code.indexOf("announcement-gate\";") + 20,
    );
    expect(importBlock).toContain("isAnnouncementBlocking");
  });

  it("首页在卸载时复位闸门", () => {
    const code = readCode(HOME_PATH);
    expect(code).toContain("return () => setAnnouncementBlocking(false);");
  });
});
