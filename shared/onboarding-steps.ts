/**
 * 新手引导 —— 唯一事实源（Single Source of Truth）
 *
 * ⚠️ 本项目历史教训：「同一份数据的多个出口」已连踩多次。
 * 引导的**锚点 id、文案、顺序、分段**一律只在本文件定义，
 * 任何组件都不得内联硬编码 data-tour-id 字符串以外的引导内容。
 *
 * 锚点约定：被引导的 DOM 元素上打 `data-tour-id="<TourAnchor>"`。
 * 状态持久化：localStorage key = `artx:onboarding:v1`。
 */

/* ────────────────────────────────────────────────────────────
 * 一、锚点常量（唯一事实源）
 * ──────────────────────────────────────────────────────────── */

export const TOUR_ANCHORS = {
  // —— 侧边栏（AppShell） ——
  navHome: "nav-home",
  navInspiration: "nav-inspiration",
  navSkills: "nav-skills",
  navWorkspace: "nav-workspace",
  navBilling: "nav-billing",
  navInvite: "nav-invite",

  // —— 首页 / 工作台首屏（HomePage） ——
  homePromptPanel: "home-prompt-panel",
  homeInspirationSection: "home-inspiration-section",
  homeInspirationCard: "home-inspiration-card",
  homeInspirationMore: "home-inspiration-more",

  // —— 技能商店（SkillsPage） ——
  skillsCategoryBar: "skills-category-bar",
  skillsSearch: "skills-search",
  skillsCard: "skills-card",
  skillsQuickLoad: "skills-quick-load",

  // —— 邀请好友（InviteDialog） ——
  inviteReward: "invite-reward",
  inviteCopyMessage: "invite-copy-message",
  inviteCode: "invite-code",
  inviteStats: "invite-stats",

  // —— 画布（InfiniteCanvas，均为已确认真实渲染的组件） ——
  canvasToolPalette: "canvas-tool-palette",
  canvasAssistantPanel: "canvas-assistant-panel",
  canvasZoomBar: "canvas-zoom-bar",
  canvasBack: "canvas-back",
} as const;

export type TourAnchor = (typeof TOUR_ANCHORS)[keyof typeof TOUR_ANCHORS];

/* ────────────────────────────────────────────────────────────
 * 二、类型定义
 * ──────────────────────────────────────────────────────────── */

/** 气泡相对高亮区的方位。auto = 由引擎按可用空间自动选择。 */
export type TourPlacement = "auto" | "top" | "bottom" | "left" | "right";

export interface TourStep {
  /** 步骤唯一 id，用于埋点与调试 */
  id: string;
  /** 高亮锚点；为 null 时为「居中通栏卡片」（用作开场白 / 收尾） */
  anchor: TourAnchor | null;
  title: string;
  /** 正文，纯文字注解。支持多段 */
  body: string;
  placement?: TourPlacement;
  /** 挖孔在元素外扩的像素，默认 8 */
  padding?: number;
  /** 挖孔圆角，默认跟随元素 computed borderRadius，指定则覆盖 */
  radius?: number;
  /** 该步骤允许用户直接点击高亮区内的真实元素（默认 false，蒙层拦截所有点击） */
  interactive?: boolean;
  /** 锚点可能异步出现时的最长等待毫秒，默认 4000；超时则跳过该步 */
  waitMs?: number;
  /** 锚点找不到时是否静默跳过（默认 true）。false = 降级为居中卡片展示 */
  skipIfMissing?: boolean;
}

export type TourSegmentId = "home" | "skills" | "invite" | "canvas";

export interface TourSegment {
  id: TourSegmentId;
  /** 分段标题，显示在气泡顶部的小标签上 */
  label: string;
  /** 该段应在哪个路由下触发。支持前缀匹配（以 * 结尾） */
  routeMatch: string;
  /** 该段整体的最小前置延迟，用于避开路由 loading 遮罩（720ms） */
  startDelayMs?: number;
  steps: TourStep[];
}

/* ────────────────────────────────────────────────────────────
 * 三、引导内容（产品功能提炼）
 * ──────────────────────────────────────────────────────────── */

const A = TOUR_ANCHORS;

/** 第 1 段：工作台首屏 —— 提示词面板 + 灵感推荐 */
const homeSegment: TourSegment = {
  id: "home",
  label: "工作台",
  routeMatch: "/",
  startDelayMs: 900,
  steps: [
    {
      id: "home-welcome",
      anchor: null,
      title: "欢迎来到 ArtX Studio",
      body:
        "接下来用 1 分钟带你认全这里的核心能力：从一句话生图，到技能商店里的成品级模板，再到无限画布上的精修工具。随时可以按 Esc 跳过。",
    },
    {
      id: "home-prompt",
      anchor: A.homePromptPanel,
      title: "一句话开始创作",
      body:
        "在这里描述你想要的画面，选好模型后回车即可出图。支持上传参考图做图生图，也可以直接把技能商店的模板灌进来当起点。",
      placement: "bottom",
      padding: 12,
    },
    {
      id: "home-inspiration",
      anchor: A.homeInspirationSection,
      title: "灵感推荐：不知道写什么就看这里",
      body:
        "这是全站精选的优秀作品流。每张图都带着完整的提示词配方，看到喜欢的直接取用，省去从零写提示词的过程。",
      placement: "auto",
      padding: 16,
    },
    {
      id: "home-inspiration-card",
      anchor: A.homeInspirationCard,
      title: "点任意一张图，直接复用它的配方",
      body:
        "点开卡片可以看到这张图用的模型、提示词和参数。点「用这个提示词」会把配方带进画布，你只需要改几个词就能产出自己的版本。",
      placement: "auto",
      padding: 10,
      skipIfMissing: true,
    },
  ],
};

/** 第 2 段：技能商店 */
const skillsSegment: TourSegment = {
  id: "skills",
  label: "技能商店",
  routeMatch: "/skills",
  startDelayMs: 800,
  steps: [
    {
      id: "skills-intro",
      anchor: null,
      title: "技能商店：把复杂流程打包成一键",
      body:
        "每个「技能」是一套调好的模型 + 提示词 + 画幅组合，专门解决一类具体任务，比如电商主图、头像、海报。不用自己调参，选中即用。",
    },
    {
      id: "skills-category",
      anchor: A.skillsCategoryBar,
      title: "按场景筛选",
      body:
        "技能按用途分好了类。先想清楚你要做的是哪类产出，再从对应分类里挑，比逐个翻快得多。",
      placement: "bottom",
      padding: 10,
    },
    {
      id: "skills-search",
      anchor: A.skillsSearch,
      title: "也可以直接搜",
      body:
        "支持搜技能名和尺寸。比如想要 3:4 的竖版商品图，直接输尺寸就能筛出来。",
      placement: "bottom",
      padding: 10,
    },
    {
      id: "skills-card",
      anchor: A.skillsCard,
      title: "每张卡片就是一套现成方案",
      body:
        "卡片上写清了这个技能适合做什么、属于哪个分类、带哪些标签。挑的时候重点看简介那一行。",
      placement: "auto",
      padding: 10,
      skipIfMissing: true,
    },
    {
      id: "skills-quick-load",
      anchor: A.skillsQuickLoad,
      title: "「快速加载」= 带着配置进画布",
      body:
        "点它会新建一个画布，并把这个技能的模型、提示词模板、画幅全部预置好。你进去只要替换素材或改几个关键词就能出图。",
      placement: "auto",
      padding: 8,
      skipIfMissing: true,
    },
  ],
};

/** 第 3 段：邀请好友（弹窗内，需等异步 summary 就绪） */
const inviteSegment: TourSegment = {
  id: "invite",
  label: "邀请好友",
  routeMatch: "*",
  startDelayMs: 300,
  steps: [
    {
      id: "invite-reward",
      anchor: A.inviteReward,
      title: "邀请好友，双方都拿积分",
      body:
        "这里写明了你和好友各自能拿到多少积分。奖励在好友首次完成付费后到账，不是注册即发，所以推荐给真正会用的人更划算。",
      placement: "auto",
      padding: 10,
      waitMs: 6000,
    },
    {
      id: "invite-copy",
      anchor: A.inviteCopyMessage,
      title: "一键复制完整邀请话术",
      body:
        "推荐用这个。复制出来的内容已经包含链接和邀请码，直接粘到微信群或私聊就行，不用自己组织语言。",
      placement: "auto",
      padding: 8,
    },
    {
      id: "invite-code",
      anchor: A.inviteCode,
      title: "你的专属邀请码",
      body:
        "这个码是固定的，不会变，可以长期复用。好友在注册时填入即可与你绑定。",
      placement: "auto",
      padding: 8,
      skipIfMissing: true,
    },
    {
      id: "invite-stats",
      anchor: A.inviteStats,
      title: "随时查战绩",
      body:
        "已邀请人数和已到账积分都在这里。如果暂时不想再接受新邀请，下方开关可以随时暂停。",
      placement: "auto",
      padding: 10,
      skipIfMissing: true,
    },
  ],
};

/** 第 4 段：无限画布 —— 命令面板与核心功能 */
const canvasSegment: TourSegment = {
  id: "canvas",
  label: "画布",
  routeMatch: "/project/*",
  startDelayMs: 1200,
  steps: [
    {
      id: "canvas-intro",
      anchor: null,
      title: "无限画布：所有精修都在这里发生",
      body:
        "画布不是单张图的编辑器，而是一块可以无限铺开的工作台。生成、对比、改图、拼版都在同一个空间里完成，方案之间可以随时横向比较。",
    },
    {
      id: "canvas-tool-palette",
      anchor: A.canvasToolPalette,
      title: "命令面板：画布的主操作台",
      body:
        "这一排是画布的核心命令入口，从左到右依次是：智能注释、智能产品图、移动、上传图片、创建画板、几何形状、铅笔、文字。选中某个工具后，在画布上拖拽即可生效。",
      placement: "auto",
      padding: 12,
    },
    {
      id: "canvas-assistant",
      anchor: A.canvasAssistantPanel,
      title: "AI 助手面板：在这里下指令",
      body:
        "写提示词、切换模型、设置画幅比例都在这块面板。选中画布上的图再下指令，就是对这张图做局部重绘或风格改写；不选中则是全新生成。",
      placement: "left",
      padding: 12,
    },
    {
      id: "canvas-node-tools",
      anchor: null,
      title: "选中图片会浮出专属工具条",
      body:
        "在画布上点任意一张图，图的上方会出现一排操作：裁切、去背景、橡皮擦除、图层分离、提示词反推、视角调整、HD 4K 放大、去水印、扩图、下载。这是使用频率最高的一组功能，务必试一遍。",
    },
    {
      id: "canvas-zoom",
      anchor: A.canvasZoomBar,
      title: "缩放与锁定",
      body:
        "调整视图比例、锁定画布防止误拖都在这里。图铺多了以后靠它快速回到全局视角。",
      placement: "auto",
      padding: 10,
    },
    {
      id: "canvas-done",
      anchor: null,
      title: "就这些，开始创作吧",
      body:
        "画布内容会自动保存，随时可以关掉再回来。如果想重看这份引导，在「帮助与反馈」里可以重新打开。",
    },
  ],
};

export const TOUR_SEGMENTS: TourSegment[] = [
  homeSegment,
  skillsSegment,
  inviteSegment,
  canvasSegment,
];

/* ────────────────────────────────────────────────────────────
 * 四、工具函数
 * ──────────────────────────────────────────────────────────── */

export const ONBOARDING_STORAGE_KEY = "artx:onboarding:v1";

export interface OnboardingState {
  /** 已完成（或已跳过）的分段 */
  completed: TourSegmentId[];
  /** 用户是否整体关闭了引导（点了「不再提示」） */
  dismissedAll: boolean;
  /** 版本号，便于将来内容更新后重新触发 */
  version: number;
}

export const ONBOARDING_VERSION = 1;

export function createEmptyOnboardingState(): OnboardingState {
  return { completed: [], dismissedAll: false, version: ONBOARDING_VERSION };
}

export function getSegment(id: TourSegmentId): TourSegment | undefined {
  return TOUR_SEGMENTS.find((segment) => segment.id === id);
}

/**
 * 气泡底部那排进度点要不要画。
 *
 * 判据：**点的数量恒等于该段的真实步数**，所以只有 1 步（或 0 步）时
 * 画出来就是孤零零一个点 —— 它既不表示进度也不可点击，纯噪声，应当不画。
 *
 * ⚠️ 不画 ≠ 不占位。底部整行是 `justifyContent: "space-between"`，
 * 左侧进度点容器一旦整个不渲染，右侧按钮组会从右端塌到左端。
 * 所以调用方必须**保留那个 flex 子项**（渲染空容器），只是不 map 出圆点。
 * 详见 OnboardingTour.tsx 底部行的注释。
 *
 * ⚠️ 这里刻意用 `segment.steps.length`（声明步数）而不是运行期可达步数：
 * 带 skipIfMissing 的步骤会在锚点缺失时被静默跳过，但那是运行期才知道的，
 * 渲染首帧无法预判；若按可达步数画点，会出现「点数在引导过程中突然变少」
 * 的跳变，比多画一个点更糟。
 */
export function shouldShowProgressDots(segment: TourSegment): boolean {
  return segment.steps.length > 1;
}

/**
 * 路由匹配。约定：
 *  - "*"          → 匹配任意路由（用于弹窗类分段，由弹窗自身触发）
 *  - "/skills"    → 精确匹配
 *  - "/project/*" → 前缀匹配
 */
export function matchesRoute(routeMatch: string, pathname: string): boolean {
  if (routeMatch === "*") return true;
  if (routeMatch.endsWith("/*")) {
    return pathname.startsWith(routeMatch.slice(0, -1));
  }
  return routeMatch === pathname;
}

/** 根据当前路由找出「该自动播放」的分段（跳过已完成的） */
export function resolveAutoSegment(
  pathname: string,
  state: OnboardingState,
): TourSegment | null {
  if (state.dismissedAll) return null;
  if (state.version !== ONBOARDING_VERSION) {
    // 版本变更视为全部未完成
    return (
      TOUR_SEGMENTS.find(
        (segment) =>
          segment.routeMatch !== "*" && matchesRoute(segment.routeMatch, pathname),
      ) ?? null
    );
  }
  return (
    TOUR_SEGMENTS.find(
      (segment) =>
        segment.routeMatch !== "*" &&
        !state.completed.includes(segment.id) &&
        matchesRoute(segment.routeMatch, pathname),
    ) ?? null
  );
}

/** 构造 data-tour-id 属性对象，供 JSX 展开使用：{...tourAttr(TOUR_ANCHORS.navSkills)} */
export function tourAttr(anchor: TourAnchor): { "data-tour-id": TourAnchor } {
  return { "data-tour-id": anchor };
}

/** 查询锚点元素 */
export function findTourTarget(anchor: TourAnchor): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-tour-id="${anchor}"]`);
}
