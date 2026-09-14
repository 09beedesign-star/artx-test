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
  type TourAnchor,
} from "../../../../shared/onboarding-steps";

const REPO_ROOT = resolve(__dirname, "../../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf-8");
}

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
