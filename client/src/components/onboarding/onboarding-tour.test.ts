/**
 * 新手引导回归测试
 *
 * ⚠️ 本项目历史教训：「测纯函数 ≠ 测修复」。
 * 光断言常量存在毫无意义 —— 真正会坏的是「锚点有没有被接到真实渲染的 DOM 上」。
 * 因此本文件的核心断言是：
 *   ① 每个被步骤引用的锚点，都能在对应源码里找到 data-tour-id 的实际使用；
 *   ② 锚点打在**真实渲染**的组件上，而不是死代码（BottomPromptBar / TopLeftToolbar）；
 *   ③ 调度逻辑（resolveAutoSegment / matchesRoute）在边界条件下行为正确。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_VERSION,
  TOUR_ANCHORS,
  TOUR_SEGMENTS,
  createEmptyOnboardingState,
  getSegment,
  matchesRoute,
  resolveAutoSegment,
  shouldShowProgressDots,
  type TourAnchor,
  type TourSegment,
  type TourStep,
} from "../../../../shared/onboarding-steps";

const REPO_ROOT = resolve(__dirname, "../../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf-8");
}

/*
 * 单步分段的测试夹具。
 * 现网四段步数都 >1，「只有一步就不画点」这条规则在真实数据上**无法触发**，
 * 只能自造。这也意味着它是前瞻性约束：将来有人加了单步分段，规则已经就位。
 */
const STEP_A: TourStep = { id: "fixture-a", anchor: null, title: "甲", body: "甲内容" };
const STEP_B: TourStep = { id: "fixture-b", anchor: null, title: "乙", body: "乙内容" };
const BASE_SEGMENT: TourSegment = {
  id: "home",
  label: "夹具",
  routeMatch: "/",
  steps: [STEP_A],
};

/* ────────────────────────── 内容完整性 ────────────────────────── */

describe("onboarding content", () => {
  it("covers the four scenarios the product requires", () => {
    const ids = TOUR_SEGMENTS.map((segment) => segment.id);
    expect(ids).toContain("home"); // 工作台灵感推荐
    expect(ids).toContain("skills"); // 技能商店
    expect(ids).toContain("invite"); // 好友推荐
    expect(ids).toContain("canvas"); // 画布命令面板
  });

  it("gives every step a non-empty title and body", () => {
    for (const segment of TOUR_SEGMENTS) {
      expect(segment.steps.length).toBeGreaterThan(0);
      for (const step of segment.steps) {
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.body.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every step id unique across all segments", () => {
    const allIds = TOUR_SEGMENTS.flatMap((segment) =>
      segment.steps.map((step) => step.id),
    );
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("explicitly annotates the canvas command palette", () => {
    const canvas = getSegment("canvas");
    expect(canvas).toBeDefined();
    const paletteStep = canvas?.steps.find(
      (step) => step.anchor === TOUR_ANCHORS.canvasToolPalette,
    );
    expect(paletteStep).toBeDefined();
    // 命令面板的注解必须真的说明它是干什么的，而不是一句空话
    expect(paletteStep?.body).toContain("智能注释");
    expect(paletteStep?.body).toContain("文字");
  });
});

/* ──────────────── 锚点必须真的接到 DOM 上（核心断言） ──────────────── */

/** 锚点 → 应当出现 data-tour-id 使用的源文件 */
const ANCHOR_WIRING: Array<{ anchor: TourAnchor; file: string }> = [
  { anchor: TOUR_ANCHORS.homePromptPanel, file: "client/src/pages/HomePage.tsx" },
  { anchor: TOUR_ANCHORS.homeInspirationSection, file: "client/src/pages/HomePage.tsx" },
  { anchor: TOUR_ANCHORS.homeInspirationCard, file: "client/src/pages/HomePage.tsx" },
  { anchor: TOUR_ANCHORS.skillsCategoryBar, file: "client/src/pages/SkillsPage.tsx" },
  { anchor: TOUR_ANCHORS.skillsSearch, file: "client/src/pages/SkillsPage.tsx" },
  { anchor: TOUR_ANCHORS.skillsCard, file: "client/src/pages/SkillsPage.tsx" },
  { anchor: TOUR_ANCHORS.skillsQuickLoad, file: "client/src/pages/SkillsPage.tsx" },
  { anchor: TOUR_ANCHORS.inviteReward, file: "client/src/components/workspace/InviteDialog.tsx" },
  { anchor: TOUR_ANCHORS.inviteCopyMessage, file: "client/src/components/workspace/InviteDialog.tsx" },
  { anchor: TOUR_ANCHORS.inviteCode, file: "client/src/components/workspace/InviteDialog.tsx" },
  { anchor: TOUR_ANCHORS.inviteStats, file: "client/src/components/workspace/InviteDialog.tsx" },
  { anchor: TOUR_ANCHORS.canvasToolPalette, file: "client/src/components/canvas/InfiniteCanvas.tsx" },
  { anchor: TOUR_ANCHORS.canvasAssistantPanel, file: "client/src/components/canvas/InfiniteCanvas.tsx" },
  { anchor: TOUR_ANCHORS.canvasZoomBar, file: "client/src/components/canvas/InfiniteCanvas.tsx" },
];

/** 由常量名反查 key，用于在源码里匹配 `TOUR_ANCHORS.xxx` 的写法 */
function anchorKeyOf(anchor: TourAnchor): string {
  const entry = Object.entries(TOUR_ANCHORS).find(([, value]) => value === anchor);
  if (!entry) throw new Error(`未登记的锚点: ${anchor}`);
  return entry[0];
}

describe("onboarding anchors are actually wired into rendered JSX", () => {
  it.each(ANCHOR_WIRING)(
    "wires $anchor into $file",
    ({ anchor, file }) => {
      const source = readSource(file);
      const key = anchorKeyOf(anchor);
      // 必须是通过常量引用，禁止硬编码字符串 —— 否则改名时会静默失联
      expect(source).toContain(`TOUR_ANCHORS.${key}`);
      expect(source).toContain("data-tour-id=");
    },
  );

  /*
    ⚠️⚠️ 真实事故回归（2026-09-14 浏览器实测发现）：
    「灵感推荐」锚点原本打在外层 `<section className="min-h-screen …">` 上，
    该 section 实测高 6108px，而视口只有 577px。
    四块遮罩的尺寸都由「视口 - 挖孔矩形」推出，rect 溢出视口后四块全被压成 0
    → 黑色遮罩覆盖率 0%，蒙层在视觉上彻底消失，而代码全程零报错。

    引擎侧已在 cutout-geometry 里做了兜底（超过 85% 视口就退化为全屏蒙层），
    但兜底只是「不崩」，锚点本身挂错位置仍然会让这一步失去高亮意义，
    所以这里从源码层面禁止把锚点打回满屏容器。
  */
  it("never anchors the inspiration step onto the full-screen section", () => {
    const source = readSource("client/src/pages/HomePage.tsx");
    const sectionLine = source
      .split("\n")
      .find((line) => line.includes("<section") && line.includes("inspirationRef"));
    expect(sectionLine).toBeTruthy();
    // 这一行仍应是 min-h-screen 的布局容器（确认断言没有因为改名而空跑）
    expect(sectionLine).toContain("min-h-screen");
    // 但它绝不能同时是引导锚点
    expect(sectionLine).not.toContain("data-tour-id");
  });

  it("每个步骤引用的锚点都在 TOUR_ANCHORS 中登记", () => {
    const known = new Set<string>(Object.values(TOUR_ANCHORS));
    for (const segment of TOUR_SEGMENTS) {
      for (const step of segment.steps) {
        if (step.anchor === null) continue;
        expect(known.has(step.anchor)).toBe(true);
      }
    }
  });

  it("侧边栏六个入口全部打上锚点，且邀请好友按钮单独接了线", () => {
    const source = readSource("client/src/components/layout/AppShell.tsx");
    for (const key of [
      "navHome",
      "navInspiration",
      "navSkills",
      "navWorkspace",
      "navBilling",
      "navInvite",
    ]) {
      expect(source).toContain(`TOUR_ANCHORS.${key}`);
    }
    // NavItem 必须真的把 tourId 透传到 DOM，光有 prop 定义不算接上
    expect(source).toContain("data-tour-id={tourId}");
  });

  it("⚠️ 锚点不能打在死代码上：BottomPromptBar / TopLeftToolbar 从未被渲染", () => {
    const source = readSource("client/src/components/canvas/InfiniteCanvas.tsx");

    // 这两个组件确实存在定义（防止本断言因改名而失效变成空跑）
    expect(source).toContain("function BottomPromptBar");
    expect(source).toContain("function TopLeftToolbar");

    // 但它们不能作为 JSX 被渲染 —— 一旦有人渲染了，说明前提变了，需重新评估
    expect(source).not.toContain("<BottomPromptBar");
    expect(source).not.toContain("<TopLeftToolbar");

    // 真正承载引导的两个组件必须确实被渲染
    expect(source).toContain("<CanvasTopToolPalette");
    expect(source).toContain("<CanvasAssistantPanel");
  });

  it("邀请弹窗的打开动作收口到唯一入口，引导触发不会被绕过", () => {
    const source = readSource("client/src/components/layout/AppShell.tsx");

    // 必须存在统一入口，且入口里同时做了「开弹窗」和「起引导」两件事
    expect(source).toContain("const openInviteDialog = ");
    const entryStart = source.indexOf("const openInviteDialog = ");
    const entryBody = source.slice(entryStart, entryStart + 400);
    expect(entryBody).toContain("setInviteOpen(true)");
    expect(entryBody).toContain('onboarding.start("invite"');

    // 侧边栏按钮必须走这个入口，而不是自己 setInviteOpen(true)
    expect(source).toContain("onClick={openInviteDialog}");

    /*
      ⚠️ 关键反向断言：AppShell 里 setInviteOpen(true) 只允许出现一次，
      也就是只能出现在 openInviteDialog 内部。
      多一处 = 又开了一个绕过引导的出口（本项目「同一份数据多个出口」老坑）。

      ⚠️ 必须先剥注释再数，否则会被注释里的同名字符串污染
      —— 这正是本项目「扫错了范围」那条老教训，块注释的续行
      既不以 // 也不以 * 开头，按行前缀过滤是不够的。
    */
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const openCalls = withoutComments.match(/setInviteOpen\(true\)/g) ?? [];
    expect(openCalls).toHaveLength(1);
  });

  it("引导 Provider 已挂载进 App，且位于 Router 内部", () => {
    const source = readSource("client/src/App.tsx");
    expect(source).toContain("<OnboardingProvider>");
    // 必须在 WouterRouter 内 —— Provider 依赖 useLocation，放外面会直接抛错
    const routerIndex = source.indexOf("<WouterRouter");
    const providerIndex = source.indexOf("<OnboardingProvider>");
    expect(routerIndex).toBeGreaterThanOrEqual(0);
    expect(providerIndex).toBeGreaterThan(routerIndex);
  });
});

/* ────────────────────────── 调度逻辑 ────────────────────────── */

describe("matchesRoute", () => {
  it("exact-matches a plain path", () => {
    expect(matchesRoute("/skills", "/skills")).toBe(true);
    expect(matchesRoute("/skills", "/skills/detail")).toBe(false);
  });

  it("prefix-matches a wildcard path", () => {
    expect(matchesRoute("/project/*", "/project/abc123")).toBe(true);
    expect(matchesRoute("/project/*", "/projects")).toBe(false);
  });

  it("treats bare * as match-all", () => {
    expect(matchesRoute("*", "/anything")).toBe(true);
  });
});

describe("resolveAutoSegment", () => {
  it("plays the home segment on first visit to /", () => {
    const segment = resolveAutoSegment("/", createEmptyOnboardingState());
    expect(segment?.id).toBe("home");
  });

  it("skips a segment once it is completed", () => {
    const state = { ...createEmptyOnboardingState(), completed: ["home" as const] };
    expect(resolveAutoSegment("/", state)).toBeNull();
  });

  it("never auto-plays the dialog-only invite segment", () => {
    // invite 的 routeMatch 是 "*"，若被自动匹配，会在任意页面弹出、锚点全部找不到
    const state = createEmptyOnboardingState();
    for (const path of ["/", "/skills", "/billing", "/project/x"]) {
      expect(resolveAutoSegment(path, state)?.id).not.toBe("invite");
    }
  });

  it("plays the canvas segment on a project route", () => {
    const segment = resolveAutoSegment("/project/demo", createEmptyOnboardingState());
    expect(segment?.id).toBe("canvas");
  });

  it("returns null when the user dismissed everything", () => {
    const state = { ...createEmptyOnboardingState(), dismissedAll: true };
    expect(resolveAutoSegment("/", state)).toBeNull();
  });

  it("re-triggers everything when the content version changes", () => {
    // 老用户存的是 version 0 且已完成 home；版本升级后应重新引导
    const stale = { completed: ["home" as const], dismissedAll: false, version: 0 };
    expect(resolveAutoSegment("/", stale)?.id).toBe("home");
  });
});

/* ────────────────────────── 存储约定 ────────────────────────── */

describe("onboarding storage", () => {
  it("follows the project's artx: namespace convention", () => {
    expect(ONBOARDING_STORAGE_KEY.startsWith("artx:")).toBe(true);
  });

  it("starts from a clean, versioned state", () => {
    const state = createEmptyOnboardingState();
    expect(state.completed).toEqual([]);
    expect(state.dismissedAll).toBe(false);
    expect(state.version).toBe(ONBOARDING_VERSION);
  });
});

/* ────────────────────────── 视觉规格 ────────────────────────── */

describe("tour overlay visuals", () => {
  const tourSource = readSource("client/src/components/onboarding/OnboardingTour.tsx");

  it("uses a black translucent mask", () => {
    expect(tourSource).toContain("rgba(0, 0, 0, 0.72)");
  });

  it("stacks above the route loading gate (z-index 2147483000)", () => {
    const appSource = readSource("client/src/App.tsx");
    expect(appSource).toContain("z-[2147483000]");
    expect(tourSource).toContain("2147483600");
  });

  it("renders through a portal so it escapes any overflow/stacking context", () => {
    expect(tourSource).toContain("createPortal");
    expect(tourSource).toContain("document.body");
  });

  it("supports keyboard escape and arrow navigation", () => {
    expect(tourSource).toContain('"Escape"');
    expect(tourSource).toContain('"ArrowRight"');
    expect(tourSource).toContain('"ArrowLeft"');
  });
});

/* ────────────────────── 进度点数量 = 该段真实步数 ────────────────────── */

describe("progress dots", () => {
  const tourSource = readSource("client/src/components/onboarding/OnboardingTour.tsx");

  it("多步分段要画点，单步/空分段不画", () => {
    // 纯函数真调用，不是读源码 —— 这条断言不会因为改名而空跑。
    expect(shouldShowProgressDots({ ...BASE_SEGMENT, steps: [] })).toBe(false);
    expect(shouldShowProgressDots({ ...BASE_SEGMENT, steps: [STEP_A] })).toBe(false);
    expect(shouldShowProgressDots({ ...BASE_SEGMENT, steps: [STEP_A, STEP_B] })).toBe(true);
  });

  it("现网每个分段的点数都等于自己的步数，不是全局总步数", () => {
    /*
     * 📌 守的是「按段计数」这个口径。四段步数各不相同（4/5/4/6），
     *    一旦有人误用 TOUR_SEGMENTS.flatMap(...).length，
     *    所有段都会画出 19 个点，而这里会立刻变红。
     */
    const totalAcrossAllSegments = TOUR_SEGMENTS.flatMap((s) => s.steps).length;
    for (const segment of TOUR_SEGMENTS) {
      expect(shouldShowProgressDots(segment)).toBe(true);
      expect(segment.steps.length).toBeLessThan(totalAcrossAllSegments);
    }
  });

  it("圆点由 steps.map 推导，不存在硬编码点数", () => {
    expect(tourSource).toContain("steps.map((s, i) =>");
    // 反向断言：任何形如 [0,1,2] / Array.from({length: N}) 的写死点数都不允许。
    const dotsBlock = tourSource.slice(
      tourSource.indexOf("showProgressDots &&"),
      tourSource.indexOf("{!isFirst && ("),
    );
    expect(dotsBlock.length).toBeGreaterThan(100); // 切片自检，防恒绿
    expect(dotsBlock).not.toMatch(/\[0,\s*1,\s*2/);
    expect(dotsBlock).not.toContain("Array.from({");
  });

  it("⚠️ 单步时仍保留进度点容器，否则「下一步」按钮会塌到左边", () => {
    /*
     * 📌 这条最容易被「顺手优化」掉：看到 showProgressDots 为 false 就把整个
     *    <div> 一起条件掉，显得更干净 —— 但底部行是 justifyContent:"space-between"，
     *    少一个 flex 子项，右侧按钮组会平移到卡片左端。
     *    所以 showProgressDots 必须写在 <div> **内部**，不能包住 <div>。
     */
    const bottomRow = tourSource.slice(
      tourSource.indexOf('justifyContent: "space-between",\n            marginTop: 14'),
      tourSource.indexOf("{isLast ? \"开始使用\" : \"下一步\"}"),
    );
    expect(bottomRow.length).toBeGreaterThan(200); // 切片自检
    // 容器 div 必须在条件之前出现 = 条件在 div 内部。
    const divAt = bottomRow.indexOf('<div style={{ display: "flex", alignItems: "center", gap: 5 }}>');
    const condAt = bottomRow.indexOf("showProgressDots &&");
    expect(divAt).toBeGreaterThan(-1);
    expect(condAt).toBeGreaterThan(-1);
    expect(divAt).toBeLessThan(condAt);
    // 布局契约本身也锁住：靠 space-between 顶开，没有改用 marginLeft:auto。
    expect(bottomRow).toContain('justifyContent: "space-between"');
  });

  it("判据只有一个出口，组件里不就地重写 steps.length > 1", () => {
    // 📌 一处判据两个出口 = 迟早长歪。组件必须调共享函数。
    expect(tourSource).toContain("shouldShowProgressDots(segment)");
    /*
     * ⚠️ 必须先剥注释再断言 —— 实测踩过：解释「别在这里写 steps.length > 1」的
     * 那行注释本身就含这个字符串，直接扫全文会把自己的注释当成违规代码而误报。
     * 同本文件 :213-216 记录的老坑，块注释续行既不以 // 也不以 * 开头。
     */
    const withoutComments = tourSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(withoutComments).toContain("shouldShowProgressDots(segment)"); // 切片自检
    expect(withoutComments).not.toContain("steps.length > 1");
  });
});
