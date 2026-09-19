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

/**
 * 截出 `hasSeenAnnouncement` 的函数体。
 *
 * ⚠️ 存在的理由：seen-store 里现在同时住着「已读记录（存 id）」和
 *    「强制待弹标记（存 "1"）」两套状态。凡是针对已读记录的 not.toContain
 *    断言都必须先收窄到这个函数体内，否则会被强制标记的合法写法误伤。
 *    找不到函数签名时直接抛错，避免静默返回空串让断言恒绿。
 */
function seenFnBody(code: string): string {
  const at = code.indexOf("export function hasSeenAnnouncement");
  if (at < 0) throw new Error("hasSeenAnnouncement 不见了：seen-store 被重构？");
  const end = code.indexOf("export function", at + 1);
  return code.slice(at, end < 0 ? undefined : end);
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
    // 正向锚点：onClick 确实存在（右下角按钮）
    expect(code).toContain("onClick={onClose}");
    /**
     * ⚠️ 口径变更（2026-09-19）：右上角 ✕ 已移除，关闭出口从 2 个减为 1 个。
     *    所以这里必须是**恰好 1 个** —— 多出来的就是遮罩或其它意外出口。
     */
    const onClickCount = (code.match(/onClick=\{onClose\}/g) ?? []).length;
    expect(onClickCount).toBe(1);
  });
});

/* ───────────────── 蒙层遮罩（2026-09-19 改口径）───────────────── */

describe("AnnouncementModal 视觉约束", () => {
  it("遮罩层必须是半透明黑色蒙层，不得退回透明", () => {
    /**
     * ⚠️ 口径变更记录：早期版本要求「不加黑色蒙层」，2026-09-19 产品改为**要加**。
     *    这条断言现在反过来防「有人照着旧注释把它改回 transparent」。
     */
    const code = readCode(MODAL_PATH);
    const overlayStart = code.indexOf("zIndex: 2147483000");
    expect(overlayStart).toBeGreaterThan(-1);
    const overlayBlock = code.slice(overlayStart, overlayStart + 400);
    expect(overlayBlock).toContain("background: MASK_SCRIM");
    expect(overlayBlock).not.toContain("background: \"transparent\"");
    // 蒙层常量本身必须是有不透明度的黑色，不能是 0 或全透明写法
    expect(code).toMatch(/const MASK_SCRIM = "rgba\(0,0,0,0\.[1-9]\d*\)"/);
  });

  it("蒙层存在不等于可以点击关闭（阻断语义不受影响）", () => {
    // 📌 加了蒙层之后最容易顺手补的就是「点蒙层关闭」，这里再钉一次。
    const code = readCode(MODAL_PATH);
    expect(code).not.toContain("pointerEvents");
  });

  it("保留右下角绿色按钮这个唯一常驻关闭元素", () => {
    const code = readCode(MODAL_PATH);
    expect(code).toContain("#BAFF2E");
    expect(code).toContain("content.actionLabel");
  });

  it("阴影不透明度 +10% / 扩散 +20%（0.65→0.72，30/90→36/108）", () => {
    const code = readCode(MODAL_PATH);
    expect(code).toContain("boxShadow: \"0 36px 108px rgba(0,0,0,0.72)\"");
    expect(code).not.toContain("0 30px 90px rgba(0,0,0,0.65)");
  });

  it("整体尺寸缩小 20%（600 → 480）", () => {
    const code = readCode(MODAL_PATH);
    expect(code).toContain("const CARD_WIDTH = 480");
    expect(code).not.toContain("min(600px");
  });

  it("白色描边加粗到 4px，且必须向内扩（外框总尺寸不变）", () => {
    /**
     * ⚠️ 「向内扩」不是靠数字，而是靠 boxSizing:"border-box"。
     *    改成 content-box 会让描边向外撑、弹窗从 480 变 488，
     *    视觉上只是"大了一点点"，不会报任何错，极难发现。
     *    所以这两条必须**一起**断言。
     */
    const code = readCode(MODAL_PATH);
    expect(code).toContain("const CARD_BORDER_WIDTH = 4");
    expect(code).toContain("border: `${CARD_BORDER_WIDTH}px solid #fff`");
    expect(code).toContain("boxSizing: \"border-box\"");
    expect(code).not.toContain("boxSizing: \"content-box\"");
    // 旧的 2px 硬编码描边不该再存在
    expect(code).not.toContain("border: \"2px solid #fff\"");
  });
});

/* ───────────────── 右上角 ✕ 已移除（2026-09-19）───────────────── */

describe("右上角 ✕ 已移除", () => {
  it("源码里不得再残留任何 ✕ 关闭按钮的痕迹", () => {
    /**
     * 产品口径（2026-09-19）：右下角已有「我知道了」，右上角 ✕ 属重复出口，移除。
     * 历史上 ✕ 还踩过 overflow 裁切的坑（放进 overflowY:"auto" 的卡片里显示不全），
     * 现在直接不存在了，这条断言防的是「有人把它加回来」。
     */
    const code = readCode(MODAL_PATH);
    expect(code).not.toContain("aria-label=\"关闭弹窗\"");
    expect(code).not.toContain("CLOSE_SIZE");
    // ✕ 的 SVG 路径特征串
    expect(code).not.toContain("M5 5 L19 19");
  });

  it("关闭出口只剩右下角按钮这一个（可用性是硬需求）", () => {
    /**
     * ⚠️ 只剩一个出口意味着它一旦失效，弹窗就彻底关不掉，且不报错。
     *    正向锚点：按钮文案与点击回调都必须在。
     */
    const code = readCode(MODAL_PATH);
    expect(code).toContain("content.actionLabel");
    expect(code).toContain("onClick={onClose}");
  });

  it("卡片仍保留纵向滚动（长内容不能溢出视口）", () => {
    const code = readCode(MODAL_PATH);
    expect(code).toContain("overflowY: \"auto\"");
  });
});

/* ───────────────── 每次登录 / 注册后重新弹出 ───────────────── */

describe("登录 / 注册后自动重放公告", () => {
  it("seen-store 暴露重放入口，且同时打强制标记 + 广播事件", () => {
    /**
     * ⚠️ 两件事缺一不可：
     *   只打标记 → 停在首页登录的用户看不到（首页不会重跑惰性初始化）
     *   只广播   → 登录后跳转/刷新/新开标签页的路径看不到
     */
    const code = readCode(SEEN_PATH);
    expect(code).toContain("export function requestAnnouncementReplay");
    const fnAt = code.indexOf("export function requestAnnouncementReplay");
    const body = code.slice(fnAt);
    expect(body).toContain("markAnnouncementForcePending()");
    expect(body).toContain("dispatchEvent");
    /**
     * ⚠️ 不许退回「清已读记录」的老做法：
     *    清完之后任何一条后续路径再写一次已读，弹窗就被静默吃掉且零报错。
     *    正向标记必须被显式消费，中间谁写已读都盖不住。
     */
    expect(body).not.toContain("resetAnnouncementSeen()");
  });

  it("AuthContext 的每条登录/注册成功路径都走统一收尾", () => {
    const code = readCode("client/src/contexts/AuthContext.tsx");
    expect(code).toContain("requestAnnouncementReplay");
    expect(code).toContain("const completeAuthSuccess");
    /**
     * 5 条成功路径必须一条不漏：
     *   ① 账号密码登录 / 注册  ② 短信验证码  ③ 邮箱验证码
     *   ④ 第三方登录          ⑤ GitHub Pages 本地兜底(applyStoredSession)
     * 少一条就是「某种登录方式登进去了却不弹公告」，且全程零报错。
     *
     * ⚠️ 这里只数**调用点**，不含定义。
     *    定义写作 `const completeAuthSuccess = (` ，中间有 " = "，
     *    不会被 /completeAuthSuccess\(/ 命中 —— 别再把期望值 +1。
     */
    const calls = (code.match(/completeAuthSuccess\(/g) ?? []).length;
    expect(calls).toBe(5);
    // 收尾函数之外不得再有裸的 setLoginModalOpen(false) 成功分支残留
    const strayCloses = (code.match(/setLoginModalOpen\(false\)/g) ?? []).length;
    expect(strayCloses).toBe(2); // closeLoginModal + completeAuthSuccess 内部各一次
  });

  it("首页监听重放事件并当场打开弹窗", () => {
    const code = readCode(HOME_PATH);
    expect(code).toContain("ANNOUNCEMENT_REPLAY_EVENT");
    expect(code).toContain("addEventListener(ANNOUNCEMENT_REPLAY_EVENT");
    expect(code).toContain("removeEventListener(ANNOUNCEMENT_REPLAY_EVENT");
    expect(code).toContain("setAnnouncementOpen(true)");
  });
});

/* ───────────────── 强硬规则：强制待弹标记 ───────────────── */

describe("强硬规则 —— 每次登录/注册后首页必弹", () => {
  it("seen-store 提供独立的强制标记三件套，且与已读记录不同 key", () => {
    const code = readCode(SEEN_PATH);
    expect(code).toContain("export function markAnnouncementForcePending");
    expect(code).toContain("export function hasAnnouncementForcePending");
    expect(code).toContain("export function clearAnnouncementForcePending");
    /**
     * 两个 key 必须分开存。合并成一个（比如把已读记录清空当作「待弹」）
     * 就回到了脆弱的隐式约定，且无法区分「没看过」和「强制要看」。
     */
    expect(code).toContain('"artx:announcement-force-pending"');
    expect(code).toContain('"artx:announcement-seen-id"');
  });

  it("强制标记读失败必须返回 false，否则隐私模式下弹窗关不掉", () => {
    /**
     * ⚠️ 这条和 hasSeenAnnouncement 的「失败倒向弹」不是一回事：
     *    若 hasAnnouncementForcePending 在 catch 里返回 true，
     *    localStorage 不可用时会变成「每刷一次首页就弹一次」，用户永远关不掉。
     */
    const code = readCode(SEEN_PATH);
    const fnAt = code.indexOf("export function hasAnnouncementForcePending");
    expect(fnAt).toBeGreaterThan(-1);
    const body = code.slice(fnAt, fnAt + 400);
    expect(body).toMatch(/catch\s*\{\s*return false;/);
  });

  it("首页判定顺序：强制标记优先于已读记录", () => {
    /**
     * 顺序写反（先判已读、再判强制）不会报错，
     * 但老用户永远弹不出来 —— 这正是「强硬规则」失效的典型形态。
     */
    const code = readCode(HOME_PATH);
    expect(code).toMatch(
      /hasAnnouncementForcePending\(\)\s*\|\|\s*!hasSeenAnnouncement\(/
    );
  });

  it("标记只在弹窗真正打开后被消费，且必须被消费", () => {
    const code = readCode(HOME_PATH);
    expect(code).toContain("clearAnnouncementForcePending");
    /**
     * ⚠️ 必须挂在 announcementOpen === true 的 effect 里：
     *    ① 写进惰性初始化 → 严格模式双跑，第二次读到空，弹窗时有时无且零报错
     *    ② 完全不清        → 标记永久驻留，关掉后每次刷新又弹，等于关不掉
     */
    expect(code).toMatch(
      /if\s*\(announcementOpen\)\s*clearAnnouncementForcePending\(\);/
    );
    // 不得出现在惰性初始化那一行附近（那里只允许读，不允许清）
    const initAt = code.indexOf("hasAnnouncementForcePending() ||");
    const initBlock = code.slice(initAt, initAt + 200);
    expect(initBlock).not.toContain("clearAnnouncementForcePending");
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
  it("首页把「我知道了」接到关闭函数并记已读", () => {
    const code = readCode(HOME_PATH);
    expect(code).toContain("handleAnnouncementClose");
    expect(code).toContain("markAnnouncementSeen(HOME_ANNOUNCEMENT.id)");
    expect(code).toContain("onClose={handleAnnouncementClose}");
  });

  it("已读状态存的是公告 id，不是布尔值（换弹窗自动重新触达）", () => {
    /**
     * ⚠️ 断言范围必须限定在 hasSeenAnnouncement 函数体内，不能扫全文件。
     *    强制待弹标记（hasAnnouncementForcePending）本来就是布尔语义，
     *    合法地写着 === "1"；全文件扫会把它误判成回归。
     */
    const code = readCode(SEEN_PATH);
    const body = seenFnBody(code);
    expect(body).toContain("=== announcementId");
    expect(body).not.toContain("=== \"1\"");
    expect(body).not.toContain("=== \"true\"");
  });

  it("已读读取失败时返回 false（隐私模式下仍然显示）", () => {
    const code = readCode(SEEN_PATH);
    expect(seenFnBody(code)).toMatch(/catch\s*\{\s*return false;/);
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
